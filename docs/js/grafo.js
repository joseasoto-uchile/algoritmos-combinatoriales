/* Modelo de grafo: creación, generación aleatoria, ejemplos y serialización.
 *
 * Port de graph_model/ (model.py + ejemplos.py) de la versión Dash. Esta capa
 * no sabe nada de algoritmos ni de dibujo, igual que en Python.
 */

/* Generador con semilla (mulberry32). JS no trae uno propio y Math.random no
 * acepta semilla, así que sin esto las instancias no serían reproducibles y
 * el campo "semilla" de la interfaz no tendría sentido. */
function generadorAleatorio(semilla) {
    let a = (semilla >>> 0) || 0x9e3779b9;
    const siguiente = () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        siguiente,
        // Entero en [min, max], ambos inclusive.
        entero: (min, max) => min + Math.floor(siguiente() * (max - min + 1)),
        elegir: (arr) => arr[Math.floor(siguiente() * arr.length)],
        mezclar: (arr) => {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(siguiente() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        },
    };
}

/* Réplica del identificador que viz.js genera para cada arista. Se duplica a
 * propósito en vez de importarlo: el modelo no debe depender de la capa de
 * dibujo. Espeja a graph_model/model.py. */
function idAristaInterno(u, v, dirigido) {
    return dirigido ? `${u}__${v}` : [u, v].sort().join('__');
}

/* Rechaza un objeto de grafo malformado con un mensaje concreto.
 *
 * Espeja graph_model/model.py: MISMAS reglas y MISMOS mensajes, porque un
 * archivo tiene que comportarse igual en las dos versiones. Antes no había
 * validación de ningún lado y cada una "reparaba" a su manera —Python fusiona
 * aristas repetidas y crea los nodos que faltan, JavaScript no—, así que el
 * mismo archivo daba grafos distintos.
 *
 * En JavaScript el silencio era peor que en Python: un peso de texto no lanza
 * error, se concatena, y Dijkstra devolvía distancias como "0diez2" sin avisar
 * de nada.
 *
 * Se informa solo el PRIMER problema: basta para corregirlo y cabe en una línea.
 */
function validarDatosGrafo(datos) {
    if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
        throw new Error('JSON inválido: el contenido debe ser un objeto.');
    }
    for (const clave of ['nodos', 'aristas']) {
        if (!(clave in datos)) throw new Error(`JSON inválido: falta la clave "${clave}".`);
        if (!Array.isArray(datos[clave])) {
            throw new Error(`JSON inválido: "${clave}" debe ser una lista.`);
        }
    }

    const dirigido = Boolean(datos.dirigido);
    const ids = new Set();
    for (const nodo of datos.nodos) {
        if (nodo === null || typeof nodo !== 'object' || !('id' in nodo)) {
            throw new Error('JSON inválido: hay un nodo sin la clave "id".');
        }
        const tipo = typeof nodo.id;
        if (tipo !== 'string' && tipo !== 'number') {
            throw new Error('JSON inválido: hay un nodo con un identificador que no es texto ni número.');
        }
        const nid = String(nodo.id);
        if (nid === '') throw new Error('JSON inválido: hay un nodo con el identificador vacío.');
        if (ids.has(nid)) throw new Error(`JSON inválido: el nodo "${nid}" está declarado dos veces.`);
        ids.add(nid);
    }

    const vistas = new Set();
    const idsArista = new Set();
    for (const arista of datos.aristas) {
        if (arista === null || typeof arista !== 'object'
            || !('origen' in arista) || !('destino' in arista)) {
            throw new Error('JSON inválido: hay una arista sin "origen" o sin "destino".');
        }
        const u = String(arista.origen), v = String(arista.destino);
        for (const extremo of [u, v]) {
            if (!ids.has(extremo)) {
                throw new Error(`JSON inválido: la arista ${u} → ${v} apunta al nodo "${extremo}", que no está declarado.`);
            }
        }
        const peso = arista.weight ?? arista.peso;
        if (peso === undefined || peso === null) {
            throw new Error(`JSON inválido: la arista ${u} → ${v} no tiene peso.`);
        }
        if (typeof peso !== 'number') {
            throw new Error(`JSON inválido: la arista ${u} → ${v} tiene un peso no numérico ("${peso}").`);
        }
        if (!Number.isFinite(peso)) {
            throw new Error(`JSON inválido: la arista ${u} → ${v} tiene un peso no finito.`);
        }

        const clave = dirigido ? `${u}>${v}` : [u, v].sort().join('-');
        if (vistas.has(clave)) {
            throw new Error(`JSON inválido: la arista ${u} → ${v} aparece repetida.`);
        }
        vistas.add(clave);
        idsArista.add(idAristaInterno(u, v, dirigido));
    }

    // Cytoscape exige identificadores únicos entre nodos Y aristas: un nodo
    // llamado "0__1" chocaría con el id generado para la arista 0 → 1 y uno de
    // los dos elementos no se dibujaría.
    const choque = [...ids].filter((n) => idsArista.has(n)).sort();
    if (choque.length) {
        throw new Error(`JSON inválido: el nodo "${choque[0]}" choca con el identificador interno de una arista. Renómbralo.`);
    }
}

class Grafo {
    constructor(dirigido = true) {
        this.dirigido = dirigido;
        this.nodos = new Map();   // id -> {id, label, pos:[x,y]}
        this.aristas = [];        // {origen, destino, peso}
        this._ady = null;         // caché de adyacencia
    }

    agregarNodo(id, datos = {}) {
        this.nodos.set(String(id), { id: String(id), label: String(id), ...datos });
        this._ady = null;
    }

    agregarArista(u, v, peso = 1) {
        this.aristas.push({ origen: String(u), destino: String(v), peso });
        this._ady = null;
    }

    get ids() { return [...this.nodos.keys()]; }

    /* Lista de adyacencia. En un grafo no dirigido cada arista se registra en
     * ambos sentidos, que es lo que hace que los recorridos funcionen igual
     * sin que los algoritmos tengan que preguntar por la dirección. */
    get adyacencia() {
        if (this._ady) return this._ady;
        const ady = new Map();
        for (const id of this.nodos.keys()) ady.set(id, []);
        for (const { origen, destino, peso } of this.aristas) {
            ady.get(origen).push({ v: destino, peso });
            if (!this.dirigido) ady.get(destino).push({ v: origen, peso });
        }
        this._ady = ady;
        return ady;
    }

    vecinos(u) { return this.adyacencia.get(u) || []; }

    gradoSalida(u) { return this.vecinos(u).length; }

    tienePesosNegativos() { return this.aristas.some((a) => a.peso < 0); }

    /* Orden topológico por Kahn; devuelve null si hay ciclo. Se usa tanto para
     * decidir si el grafo es un DAG como para el algoritmo de caminos en DAG,
     * así no hay dos implementaciones que puedan discrepar. */
    ordenTopologico() {
        if (!this.dirigido) return null;
        const gradoEntrada = new Map([...this.nodos.keys()].map((n) => [n, 0]));
        for (const { destino } of this.aristas) {
            gradoEntrada.set(destino, gradoEntrada.get(destino) + 1);
        }
        const cola = [...this.nodos.keys()].filter((n) => gradoEntrada.get(n) === 0);
        const orden = [];
        while (cola.length) {
            const u = cola.shift();
            orden.push(u);
            for (const { v } of this.vecinos(u)) {
                gradoEntrada.set(v, gradoEntrada.get(v) - 1);
                if (gradoEntrada.get(v) === 0) cola.push(v);
            }
        }
        return orden.length === this.nodos.size ? orden : null;
    }

    esDAG() { return this.ordenTopologico() !== null; }

    aObjeto() {
        return {
            dirigido: this.dirigido,
            nodos: [...this.nodos.values()],
            aristas: this.aristas.map((a) => ({
                origen: a.origen, destino: a.destino, weight: a.peso,
            })),
        };
    }

    static desdeObjeto(datos) {
        validarDatosGrafo(datos);
        const G = new Grafo(Boolean(datos.dirigido));
        for (const n of datos.nodos) {
            G.agregarNodo(n.id, { label: n.label ?? String(n.id), pos: n.pos });
        }
        for (const a of datos.aristas) {
            G.agregarArista(a.origen, a.destino, a.weight ?? a.peso);
        }
        return G;
    }
}

const ESCALA_POSICIONES = 800;

/* Disposición inicial en círculo. La versión Python usa el spring layout de
 * NetworkX, que no existe acá; da igual porque estas coordenadas solo las usa
 * el layout 'preset' y para las instancias aleatorias Cytoscape recalcula. */
function asignarPosiciones(G) {
    const ids = G.ids;
    const radio = ESCALA_POSICIONES * 0.4;
    const centro = ESCALA_POSICIONES / 2;
    ids.forEach((id, i) => {
        const ang = (2 * Math.PI * i) / ids.length - Math.PI / 2;
        G.nodos.get(id).pos = [centro + radio * Math.cos(ang), centro + radio * Math.sin(ang)];
    });
    return G;
}

function generarAleatorio({
    n = 10, densidad = 0.3, dirigido = true, dag = false, conexo = true,
    pesoMin = 1, pesoMax = 10, permitirNegativos = false, semilla = null,
} = {}) {
    if (dag) dirigido = true;
    if (n < 1) throw new Error('El número de nodos debe ser al menos 1.');
    if (pesoMin > pesoMax) {
        throw new Error(`El peso mínimo (${pesoMin}) no puede ser mayor que el máximo (${pesoMax}).`);
    }

    const rng = generadorAleatorio(semilla == null ? Math.floor(Math.random() * 1e9) : semilla);
    const G = new Grafo(dirigido);
    const ids = Array.from({ length: n }, (_, i) => String(i));
    ids.forEach((id) => G.agregarNodo(id));

    const maxAristas = dirigido ? n * (n - 1) : (n * (n - 1)) / 2;
    let numAristas = Math.round((densidad ?? 0) * maxAristas);
    numAristas = Math.max(0, Math.min(numAristas, maxAristas));

    const pesoAleatorio = () => {
        if (permitirNegativos) {
            const w = rng.entero(-Math.abs(pesoMax), Math.abs(pesoMax));
            return w !== 0 ? w : 1;
        }
        return rng.entero(pesoMin, pesoMax);
    };

    const existentes = new Set();
    const clave = (u, v) => (dirigido ? `${u}>${v}` : [u, v].sort().join('-'));
    const agregar = (u, v) => {
        if (u === v) return false;
        const k = clave(u, v);
        if (existentes.has(k)) return false;
        existentes.add(k);
        G.agregarArista(u, v, pesoAleatorio());
        return true;
    };

    const orden = rng.mezclar([...ids]);
    if (conexo) {
        // Árbol de conectividad primero: garantiza que no queden nodos sueltos
        // antes de repartir las aristas restantes al azar.
        for (let i = 1; i < n; i++) agregar(orden[rng.entero(0, i - 1)], orden[i]);
    }
    const limite = numAristas * 20 + 200;
    let intentos = 0;
    while (existentes.size < numAristas && intentos < limite) {
        if (dag) {
            const i = rng.entero(0, n - 1), j = rng.entero(0, n - 1);
            if (i < j) agregar(orden[i], orden[j]);
        } else {
            agregar(rng.elegir(ids), rng.elegir(ids));
        }
        intentos++;
    }

    return asignarPosiciones(G);
}

/* ---------------------------------------------------------------------------
 * Instancias de ejemplo: estructura reconocible y posiciones fijas, para que
 * el recorrido del algoritmo se lea directo sobre el dibujo.
 * ------------------------------------------------------------------------- */
function ejArbolBinario(niveles = 4) {
    const G = new Grafo(false);
    const total = 2 ** niveles - 1;
    for (let i = 0; i < total; i++) G.agregarNodo(i);
    for (let i = 0; i < total; i++) {
        for (const hijo of [2 * i + 1, 2 * i + 2]) {
            if (hijo < total) G.agregarArista(i, hijo, 1 + (hijo % 5));
        }
    }
    for (let i = 0; i < total; i++) {
        const nivel = Math.floor(Math.log2(i + 1));
        const enNivel = 2 ** nivel;
        const x = ((i - (enNivel - 1) + 0.5) / enNivel) * ESCALA_POSICIONES;
        const y = (nivel / Math.max(niveles - 1, 1)) * ESCALA_POSICIONES * 0.8 + 40;
        G.nodos.get(String(i)).pos = [x, y];
    }
    return G;
}

function ejCiclo(n = 8) {
    const G = new Grafo(false);
    for (let i = 0; i < n; i++) G.agregarNodo(i);
    for (let i = 0; i < n; i++) G.agregarArista(i, (i + 1) % n, 1 + (i % 4));
    return asignarPosiciones(G);
}

function ejRejilla(filas = 4, columnas = 5) {
    const G = new Grafo(false);
    for (let f = 0; f < filas; f++) {
        for (let c = 0; c < columnas; c++) {
            const id = f * columnas + c;
            G.agregarNodo(id);
            G.nodos.get(String(id)).pos = [
                ((c + 0.5) / columnas) * ESCALA_POSICIONES,
                ((f + 0.5) / filas) * ESCALA_POSICIONES * 0.8 + 40,
            ];
        }
    }
    for (let f = 0; f < filas; f++) {
        for (let c = 0; c < columnas; c++) {
            const actual = f * columnas + c;
            if (c + 1 < columnas) G.agregarArista(actual, actual + 1, 1 + ((f + c) % 3));
            if (f + 1 < filas) G.agregarArista(actual, actual + columnas, 1 + ((f + c) % 4));
        }
    }
    return G;
}

function ejDagCapas(capas = [1, 3, 3, 2, 1]) {
    const G = new Grafo(true);
    const porCapa = [];
    let contador = 0;
    capas.forEach((ancho, indice) => {
        const fila = [];
        for (let j = 0; j < ancho; j++) {
            const id = String(contador++);
            G.agregarNodo(id);
            G.nodos.get(id).pos = [
                ((indice + 0.5) / capas.length) * ESCALA_POSICIONES,
                ((j + 0.5) / ancho) * ESCALA_POSICIONES * 0.7 + 60,
            ];
            fila.push(id);
        }
        porCapa.push(fila);
    });
    let peso = 1;
    for (let k = 0; k + 1 < porCapa.length; k++) {
        for (const u of porCapa[k]) {
            for (const v of porCapa[k + 1]) {
                G.agregarArista(u, v, peso);
                peso = 1 + (peso % 7);
            }
        }
    }
    return G;
}

function ejCicloNegativo() {
    const G = new Grafo(true);
    const posiciones = {
        0: [80, 400], 1: [240, 220], 2: [240, 580], 3: [430, 400],
        4: [610, 250], 5: [610, 550], 6: [430, 720],
    };
    for (const [id, pos] of Object.entries(posiciones)) G.agregarNodo(id, { pos });
    [[0, 1, 4], [0, 2, 3], [1, 3, 2], [2, 3, 1],
     [3, 4, 3], [4, 5, -6], [5, 3, 1], [2, 6, 5]]
        .forEach(([u, v, w]) => G.agregarArista(u, v, w));
    return G;
}

function ejCompleto(n = 6) {
    const G = new Grafo(false);
    for (let i = 0; i < n; i++) G.agregarNodo(i);
    let peso = 2;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            G.agregarArista(i, j, peso);
            peso = 1 + ((peso * 3) % 9);
        }
    }
    return asignarPosiciones(G);
}

const EJEMPLOS = {
    arbol: { nombre: 'Árbol binario (15 nodos)', constructor: ejArbolBinario,
        descripcion: 'No dirigido. BFS recorre por niveles; DFS baja hasta una hoja.' },
    ciclo: { nombre: 'Ciclo (8 nodos)', constructor: ejCiclo,
        descripcion: 'No dirigido. BFS avanza por ambos lados y se cierra en el opuesto.' },
    rejilla: { nombre: 'Rejilla 4×5', constructor: () => ejRejilla(),
        descripcion: 'No dirigido. Las distancias forman anillos alrededor del origen.' },
    dag: { nombre: 'DAG por capas', constructor: () => ejDagCapas(),
        descripcion: 'Dirigido y acíclico: habilita el camino mínimo por orden topológico.' },
    ciclo_negativo: { nombre: 'Ciclo negativo (Bellman-Ford)', constructor: ejCicloNegativo,
        descripcion: 'Dirigido con un ciclo de peso -2. Dijkstra no se ofrece acá.' },
    completo: { nombre: 'Grafo completo K6', constructor: () => ejCompleto(),
        descripcion: 'No dirigido y denso: muchas aristas descartadas por Dijkstra.' },
};

function construirEjemplo(clave) {
    if (!EJEMPLOS[clave]) throw new Error(`No existe la instancia de ejemplo '${clave}'.`);
    return EJEMPLOS[clave].constructor();
}
