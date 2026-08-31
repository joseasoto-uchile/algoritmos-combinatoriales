/* Modelo de grafo no dirigido: creación, generación aleatoria, ejemplos y
 * serialización.
 *
 * Esta capa no depende de los algoritmos ni del dibujo.
 */

/* La aplicación es de demostración: las tablas y la matriz del editor se leen
 * en pantalla completas, y el grafo tiene que seguir siendo legible. El tope
 * rige en el generador, en el editor y al cargar un archivo. */
const NODOS_MINIMO = 2;
const NODOS_MAXIMO = 30;

/* Generador de números aleatorios con semilla (mulberry32). JavaScript no
 * incluye uno y Math.random no acepta semilla. Es lo que hace reproducibles
 * las instancias generadas. */
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

/* Los extremos van ordenados: en un grafo no dirigido {u,v} y {v,u} son la
 * misma arista y tienen que producir el mismo identificador. */
function claveArista(u, v) {
    return String(u) < String(v) ? `${u}|${v}` : `${v}|${u}`;
}

/* Réplica del identificador que viz.js genera para cada arista. Se duplica
 * porque el modelo no depende de la capa de dibujo. Un cambio de formato en
 * viz.js requiere actualizar también esta función. */
function idAristaInterno(u, v) {
    return String(u) < String(v) ? `${u}__${v}` : `${v}__${u}`;
}

/* La aplicación trabaja solo con grafos no dirigidos. La clave "dirigido" del
 * archivo es opcional; si aparece con valor verdadero, el archivo se rechaza
 * en lugar de convertirlo, porque el grafo resultante no sería el que el
 * usuario escribió. */
function comprobarNoDirigido(datos) {
    if ('dirigido' in datos && datos.dirigido) {
        throw new Error('JSON inválido: el archivo declara un digrafo y esta '
            + 'aplicación solo admite grafos no dirigidos.');
    }
}

/* Comprueba que "pos" es una lista de dos números finitos. */
function posicionValida(pos) {
    return Array.isArray(pos) && pos.length === 2
        && pos.every((c) => typeof c === 'number' && Number.isFinite(c));
}

/* Nodos alcanzables desde uno dado, por adyacencia no dirigida. Se usa para
 * comprobar la conexidad sin construir el objeto Grafo, de modo que la
 * validación pueda rechazar el archivo antes. */
function alcanzablesDesde(ids, pares, inicio) {
    const ady = new Map(ids.map((id) => [id, []]));
    for (const [u, v] of pares) { ady.get(u).push(v); ady.get(v).push(u); }
    const vistos = new Set([inicio]);
    const pila = [inicio];
    while (pila.length) {
        for (const v of ady.get(pila.pop())) {
            if (!vistos.has(v)) { vistos.add(v); pila.push(v); }
        }
    }
    return vistos;
}

/* Rechaza un objeto de grafo que no cumple el formato.
 *
 * La validación del peso es necesaria porque en JavaScript un peso de tipo
 * texto no produce error: se concatena con los demás en lugar de sumarse, y el
 * peso del árbol sale como una cadena.
 *
 * Se informa solo el primer problema encontrado.
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

    comprobarNoDirigido(datos);
    if (datos.nodos.length > NODOS_MAXIMO) {
        throw new Error(`JSON inválido: el archivo tiene ${datos.nodos.length} nodos y la `
            + `aplicación admite hasta ${NODOS_MAXIMO}.`);
    }
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
        // La capa de dibujo lee pos[0] y pos[1] sin comprobarlos.
        if ('pos' in nodo && !posicionValida(nodo.pos)) {
            throw new Error(`JSON inválido: el nodo "${nid}" tiene una posición que no es una lista de dos números.`);
        }
    }

    const vistas = new Set();
    const idsArista = new Set();
    const pares = [];
    for (const arista of datos.aristas) {
        if (arista === null || typeof arista !== 'object'
            || !('origen' in arista) || !('destino' in arista)) {
            throw new Error('JSON inválido: hay una arista sin "origen" o sin "destino".');
        }
        const u = String(arista.origen), v = String(arista.destino);
        for (const extremo of [u, v]) {
            if (!ids.has(extremo)) {
                throw new Error(`JSON inválido: la arista ${u} — ${v} toca el nodo "${extremo}", que no está declarado.`);
            }
        }
        // Un lazo nunca forma parte de un árbol de expansión y solo ensucia el
        // ordenamiento de Kruskal.
        if (u === v) {
            throw new Error(`JSON inválido: el nodo "${u}" tiene un lazo, y esta aplicación no los admite.`);
        }
        const peso = arista.weight ?? arista.peso;
        if (peso === undefined || peso === null) {
            throw new Error(`JSON inválido: la arista ${u} — ${v} no tiene peso.`);
        }
        if (typeof peso !== 'number') {
            throw new Error(`JSON inválido: la arista ${u} — ${v} tiene un peso no numérico ("${peso}").`);
        }
        if (!Number.isFinite(peso)) {
            throw new Error(`JSON inválido: la arista ${u} — ${v} tiene un peso no finito.`);
        }

        // Sin dirección, {u,v} y {v,u} son la misma arista.
        const clave = claveArista(u, v);
        if (vistas.has(clave)) {
            throw new Error(`JSON inválido: la arista ${u} — ${v} aparece repetida.`);
        }
        vistas.add(clave);
        idsArista.add(idAristaInterno(u, v));
        pares.push([u, v]);
    }

    // Cytoscape exige identificadores únicos entre nodos y aristas. Un nodo
    // llamado "0__1" coincide con el identificador de la arista {0,1}, y uno
    // de los dos elementos no se dibuja.
    const choque = [...ids].filter((n) => idsArista.has(n)).sort();
    if (choque.length) {
        throw new Error(`JSON inválido: el nodo "${choque[0]}" choca con el identificador interno de una arista. Renómbralo.`);
    }

    // Los tres algoritmos suponen el grafo conexo: sobre un grafo con varias
    // componentes no hay árbol de expansión, sino un bosque.
    const lista = [...ids];
    if (lista.length) {
        const alcanzados = alcanzablesDesde(lista, pares, lista[0]);
        if (alcanzados.size !== lista.length) {
            const suelto = lista.find((n) => !alcanzados.has(n));
            throw new Error(`JSON inválido: el grafo no es conexo (no hay camino entre "${lista[0]}" `
                + `y "${suelto}") y esta aplicación supone grafos conexos.`);
        }
    }
}

class Grafo {
    constructor() {
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

    /* Lista de adyacencia. Cada arista aparece en sus dos extremos: el orden en
     * que se escribió origen y destino no significa nada. */
    get adyacencia() {
        if (this._ady) return this._ady;
        const ady = new Map();
        for (const id of this.nodos.keys()) ady.set(id, []);
        this.aristas.forEach(({ origen, destino, peso }, indice) => {
            ady.get(origen).push({ v: destino, peso, indice });
            ady.get(destino).push({ v: origen, peso, indice });
        });
        this._ady = ady;
        return ady;
    }

    vecinos(u) { return this.adyacencia.get(u) || []; }

    grado(u) { return this.vecinos(u).length; }

    tienePesosNegativos() { return this.aristas.some((a) => a.peso < 0); }

    /* Aristas ordenadas por peso, desempatando por el orden en que se
     * declararon. Kruskal recorre esta lista y Borůvka la usa para desempatar,
     * de modo que las dos comparten el mismo orden total. */
    aristasOrdenadas() {
        return this.aristas
            .map((a, indice) => ({ ...a, indice }))
            .sort((x, y) => (x.peso - y.peso) || (x.indice - y.indice));
    }

    /* Los tres algoritmos suponen el grafo conexo. Lo comprueban el validador
     * al cargar, el editor al aplicar cambios y el generador por construcción;
     * este método es el que usan todos. */
    esConexo() {
        const lista = this.ids;
        if (lista.length <= 1) return true;
        const vistos = new Set([lista[0]]);
        const pila = [lista[0]];
        while (pila.length) {
            for (const { v } of this.vecinos(pila.pop())) {
                if (!vistos.has(v)) { vistos.add(v); pila.push(v); }
            }
        }
        return vistos.size === lista.length;
    }

    aObjeto() {
        return {
            dirigido: false,
            nodos: [...this.nodos.values()],
            aristas: this.aristas.map((a) => ({
                origen: a.origen, destino: a.destino, weight: a.peso,
            })),
        };
    }

    static desdeObjeto(datos) {
        validarDatosGrafo(datos);
        const G = new Grafo();
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

/* Disposición inicial en círculo. Estas coordenadas solo las utiliza el layout
 * 'preset'; los demás las recalculan. */
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
    n = 10, densidad = 0.3, pesoMin = 1, pesoMax = 10,
    permitirNegativos = false, semilla = null,
} = {}) {
    if (n < NODOS_MINIMO || n > NODOS_MAXIMO) {
        throw new Error(`El número de nodos debe estar entre ${NODOS_MINIMO} y `
            + `${NODOS_MAXIMO}. Se recibió ${n}.`);
    }
    if (pesoMin > pesoMax) {
        throw new Error(`El peso mínimo (${pesoMin}) no puede ser mayor que el máximo (${pesoMax}).`);
    }

    const rng = generadorAleatorio(semilla == null ? Math.floor(Math.random() * 1e9) : semilla);
    const G = new Grafo();
    const ids = Array.from({ length: n }, (_, i) => String(i));
    ids.forEach((id) => G.agregarNodo(id));

    const maxAristas = (n * (n - 1)) / 2;
    // El árbol de conectividad ya aporta n-1 aristas y no se puede bajar de ahí.
    let numAristas = Math.round((densidad ?? 0) * maxAristas);
    numAristas = Math.max(n - 1, Math.min(numAristas, maxAristas));

    const pesoAleatorio = () => {
        if (permitirNegativos) {
            const w = rng.entero(-Math.abs(pesoMax), Math.abs(pesoMax));
            return w !== 0 ? w : 1;
        }
        return rng.entero(pesoMin, pesoMax);
    };

    const existentes = new Set();
    const agregar = (u, v) => {
        if (u === v) return false;
        const k = claveArista(u, v);
        if (existentes.has(k)) return false;
        existentes.add(k);
        G.agregarArista(u, v, pesoAleatorio());
        return true;
    };

    // Árbol de conectividad: el grafo generado es siempre conexo.
    const orden = rng.mezclar([...ids]);
    for (let i = 1; i < n; i++) agregar(orden[rng.entero(0, i - 1)], orden[i]);

    const limite = numAristas * 20 + 200;
    let intentos = 0;
    while (existentes.size < numAristas && intentos < limite) {
        agregar(rng.elegir(ids), rng.elegir(ids));
        intentos++;
    }

    return asignarPosiciones(G);
}

/* ---------------------------------------------------------------------------
 * Instancias de ejemplo con estructura definida y coordenadas fijas, de modo
 * que el recorrido del algoritmo se corresponda con el dibujo.
 * ------------------------------------------------------------------------- */

/* La instancia de la clase 09: siete nodos, diez aristas de pesos distintos y
 * un único árbol de expansión mínima, {ab, bc, de, fg, ce, eg}, de peso 24.
 *
 * Las posiciones siguen el dibujo de las láminas. a y f van más arriba que b y
 * d para que la arista af, que en las láminas es un arco exterior, pase por
 * encima de ellos en lugar de cruzarlos. */
function ejClase() {
    const G = new Grafo();
    const posiciones = {
        a: [90, 150], b: [250, 215], c: [200, 560], d: [480, 215],
        e: [430, 560], f: [710, 150], g: [660, 560],
    };
    for (const [id, pos] of Object.entries(posiciones)) G.agregarNodo(id, { pos });
    [['a', 'b', 1], ['b', 'c', 2], ['d', 'e', 3], ['f', 'g', 4], ['a', 'c', 5],
     ['c', 'e', 6], ['e', 'g', 8], ['b', 'd', 10], ['d', 'f', 11], ['a', 'f', 12]]
        .forEach(([u, v, w]) => G.agregarArista(u, v, w));
    return G;
}

/* Ciclo con pesos distintos. El árbol de expansión mínima es el ciclo sin su
 * arista más pesada, y cada algoritmo llega a ella en un momento distinto. */
function ejCiclo(n = 8) {
    const G = new Grafo();
    for (let i = 0; i < n; i++) G.agregarNodo(i);
    for (let i = 0; i < n; i++) G.agregarArista(i, (i + 1) % n, i + 1);
    return asignarPosiciones(G);
}

function ejRejilla(filas = 4, columnas = 5) {
    const G = new Grafo();
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
            if (c + 1 < columnas) G.agregarArista(actual, actual + 1, 1 + ((f + 2 * c) % 7));
            if (f + 1 < filas) G.agregarArista(actual, actual + columnas, 1 + ((3 * f + c) % 6));
        }
    }
    return G;
}

/* Muchos pesos repetidos: el árbol de expansión mínima no es único. Desde la
 * raíz a, Jarník-Prim devuelve {ab, ad, bc, be, cf} y Kruskal {ab, ad, bc, cf,
 * de}, los dos de peso 6. */
function ejEmpatados() {
    const G = new Grafo();
    const posiciones = {
        a: [150, 200], b: [400, 130], c: [650, 200],
        d: [150, 560], e: [400, 640], f: [650, 560],
    };
    for (const [id, pos] of Object.entries(posiciones)) G.agregarNodo(id, { pos });
    [['a', 'b', 1], ['b', 'c', 1], ['a', 'd', 1], ['c', 'f', 1],
     ['d', 'e', 2], ['e', 'f', 2], ['b', 'e', 2], ['a', 'c', 3], ['d', 'f', 3]]
        .forEach(([u, v, w]) => G.agregarArista(u, v, w));
    return G;
}

/* Ocho nodos en cuatro parejas unidas por aristas baratas. Borůvka fusiona las
 * parejas en la primera fase, los pares de parejas en la segunda y cierra en la
 * tercera: el número de componentes se reduce a la mitad en cada una. */
function ejBoruvka() {
    const G = new Grafo();
    // Los cuatro extremos van separados de la fila para que las aristas largas
    // 0—3 y 4—7 pasen por fuera de los nodos intermedios en vez de cruzarlos.
    const posiciones = {
        0: [120, 120], 1: [300, 215], 2: [540, 215], 3: [720, 120],
        4: [120, 680], 5: [300, 585], 6: [540, 585], 7: [720, 680],
    };
    for (const [id, pos] of Object.entries(posiciones)) G.agregarNodo(id, { pos });
    [[0, 1, 1], [2, 3, 2], [4, 5, 3], [6, 7, 4],
     [1, 2, 5], [5, 6, 6], [0, 4, 7], [3, 7, 8],
     [1, 5, 12], [2, 6, 13], [0, 3, 14], [4, 7, 15]]
        .forEach(([u, v, w]) => G.agregarArista(u, v, w));
    return G;
}

/* Pesos negativos. El árbol de expansión mínima sigue estando bien definido:
 * todo árbol de expansión tiene n-1 aristas, de modo que un peso negativo no
 * abre la posibilidad de mejorar recorriendo un ciclo. */
function ejNegativos() {
    const G = new Grafo();
    const posiciones = {
        s: [110, 400], a: [330, 190], b: [330, 610], c: [560, 400],
        d: [770, 190], t: [770, 610],
    };
    for (const [id, pos] of Object.entries(posiciones)) G.agregarNodo(id, { pos });
    [['s', 'a', 4], ['s', 'b', -2], ['a', 'b', 3], ['a', 'c', -1],
     ['b', 'c', 5], ['c', 'd', 2], ['c', 't', -3], ['d', 't', 6]]
        .forEach(([u, v, w]) => G.agregarArista(u, v, w));
    return G;
}

function ejCompleto(n = 6) {
    const G = new Grafo();
    for (let i = 0; i < n; i++) G.agregarNodo(i);
    let peso = 2;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            G.agregarArista(i, j, peso);
            peso = 1 + ((peso * 3) % 13);
        }
    }
    return asignarPosiciones(G);
}

const EJEMPLOS = {
    clase: { nombre: 'Instancia de la clase (7 nodos)', constructor: ejClase,
        descripcion: 'La de las láminas de la clase 09. Pesos distintos, de modo que el '
            + 'árbol de expansión mínima es único: {ab, bc, de, fg, ce, eg}, de peso 24.' },
    empatados: { nombre: 'Pesos empatados (6 nodos)', constructor: ejEmpatados,
        descripcion: 'Varias aristas comparten peso y el árbol de expansión mínima no es '
            + 'único: desde la raíz por omisión, Jarník–Prim y Kruskal devuelven árboles '
            + 'distintos, los dos de peso 6.' },
    ciclo: { nombre: 'Ciclo (8 nodos)', constructor: () => ejCiclo(),
        descripcion: 'Pesos 1 a 8. El árbol de expansión mínima es el ciclo sin su arista '
            + 'más pesada; cada algoritmo la descarta en un momento distinto.' },
    rejilla: { nombre: 'Rejilla 4×5', constructor: () => ejRejilla(),
        descripcion: '20 nodos y 31 aristas. El árbol usa 19 y hay que descartar 12.' },
    boruvka: { nombre: 'Parejas por fases (8 nodos)', constructor: ejBoruvka,
        descripcion: 'Cuatro parejas unidas por aristas baratas. Borůvka reduce el número '
            + 'de componentes a la mitad en cada fase y cierra en tres.' },
    negativos: { nombre: 'Pesos negativos', constructor: ejNegativos,
        descripcion: 'Con pesos negativos el árbol de expansión mínima sigue bien definido: '
            + 'todo árbol de expansión tiene el mismo número de aristas.' },
    completo: { nombre: 'Grafo completo (6 nodos)', constructor: () => ejCompleto(),
        descripcion: '15 aristas entre 6 nodos. Kruskal recorre la lista completa aunque el '
            + 'árbol quede fijado mucho antes.' },
};

function construirEjemplo(clave) {
    if (!EJEMPLOS[clave]) throw new Error(`No existe la instancia de ejemplo '${clave}'.`);
    return EJEMPLOS[clave].constructor();
}

/* Union-Find con compresión de caminos y unión por tamaño. Lo usan Kruskal y
 * Borůvka para saber si dos nodos ya están conectados, y la capa de dibujo
 * para recomponer las componentes de (V, F) en cada paso.
 *
 * El representante de una componente es el nodo de identificador menor, de
 * modo que el nombre que aparece en pantalla no depende del orden en que se
 * hicieron las uniones. */
class UnionFind {
    constructor(ids) {
        this.padre = new Map(ids.map((v) => [v, v]));
        this.tam = new Map(ids.map((v) => [v, 1]));
    }

    buscar(v) {
        let r = v;
        while (this.padre.get(r) !== r) r = this.padre.get(r);
        while (this.padre.get(v) !== r) { const s = this.padre.get(v); this.padre.set(v, r); v = s; }
        return r;
    }

    unir(u, v) {
        const a = this.buscar(u), b = this.buscar(v);
        if (a === b) return false;
        const [grande, chico] = this.tam.get(a) >= this.tam.get(b) ? [a, b] : [b, a];
        this.padre.set(chico, grande);
        this.tam.set(grande, this.tam.get(grande) + this.tam.get(chico));
        // El representante visible es el menor de los dos.
        const menor = String(a) < String(b) ? a : b;
        if (menor !== grande) { this.padre.set(grande, menor); this.padre.set(menor, menor); }
        return true;
    }

    mismaComponente(u, v) { return this.buscar(u) === this.buscar(v); }
}

/* Componentes de (V, F), donde F es una lista de pares. Devuelve un Map de
 * nodo a representante. */
function componentesDe(ids, pares) {
    const uf = new UnionFind(ids);
    for (const [u, v] of pares) uf.unir(u, v);
    return new Map(ids.map((v) => [v, uf.buscar(v)]));
}

/* Agrupa el resultado de componentesDe en listas de nodos, ordenadas por
 * representante. */
function agruparComponentes(mapa) {
    const grupos = new Map();
    for (const [v, r] of mapa) {
        if (!grupos.has(r)) grupos.set(r, []);
        grupos.get(r).push(v);
    }
    return [...grupos.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
