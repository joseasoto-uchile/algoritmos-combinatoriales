/* Algoritmos y su registro.
 *
 * Port de algorithms/ de la versión Dash. Cada algoritmo emite la MISMA traza
 * de eventos que su gemelo en Python (mismos tipos, mismos campos, mismos
 * números de línea), así la capa de dibujo es idéntica en las dos versiones.
 */

class ConstructorTraza {
    constructor() { this.traza = []; this.paso = 0; }
    emitir(tipo, datos = {}) {
        this.paso += 1;
        this.traza.push({ tipo, paso: this.paso, ...datos });
    }
}

/* Cola de prioridad mínima (montículo binario). JS no trae una, y usar un
 * array con sort() en cada extracción convertiría Dijkstra en O(V² log V)
 * justo en el caso denso donde se nota.
 *
 * Ante empate de prioridad desempata por el valor, igual que heapq en Python:
 * allá los elementos son tuplas (distancia, nodo) y las tuplas se comparan
 * elemento a elemento. Sin este desempate, con dos nodos a la misma distancia
 * cada versión extraía uno distinto y las trazas divergían aunque el
 * resultado final fuese el mismo. */
function _menorQue(a, b) {
    if (a[0] !== b[0]) return a[0] < b[0];
    return String(a[1]) < String(b[1]);
}

class ColaPrioridad {
    constructor() { this.datos = []; }
    get vacia() { return this.datos.length === 0; }
    push(prioridad, valor) {
        this.datos.push([prioridad, valor]);
        let i = this.datos.length - 1;
        while (i > 0) {
            const padre = (i - 1) >> 1;
            if (!_menorQue(this.datos[i], this.datos[padre])) break;
            [this.datos[padre], this.datos[i]] = [this.datos[i], this.datos[padre]];
            i = padre;
        }
    }
    pop() {
        const tope = this.datos[0];
        const ultimo = this.datos.pop();
        if (this.datos.length) {
            this.datos[0] = ultimo;
            let i = 0;
            for (;;) {
                const izq = 2 * i + 1, der = 2 * i + 2;
                let menor = i;
                if (izq < this.datos.length && _menorQue(this.datos[izq], this.datos[menor])) menor = izq;
                if (der < this.datos.length && _menorQue(this.datos[der], this.datos[menor])) menor = der;
                if (menor === i) break;
                [this.datos[menor], this.datos[i]] = [this.datos[i], this.datos[menor]];
                i = menor;
            }
        }
        return tope;
    }
}

/* --- BFS ---------------------------------------------------------------- */
function bfsTraza(G, origen) {
    const tb = new ConstructorTraza();
    const visitado = new Set([origen]);
    const padre = { [origen]: null };
    const distancia = { [origen]: 0 };
    const cola = [origen];

    tb.emitir('visitar_nodo', { nodo: origen, linea: 3, dist: 0 });
    while (cola.length) {
        const u = cola.shift();
        tb.emitir('procesar_nodo', { nodo: u, linea: 5 });
        for (const { v } of G.vecinos(u)) {
            tb.emitir('explorar_arista', { u, v, linea: 7 });
            if (!visitado.has(v)) {
                visitado.add(v);
                padre[v] = u;
                distancia[v] = distancia[u] + 1;
                cola.push(v);
                tb.emitir('visitar_nodo', { nodo: v, linea: 8, dist: distancia[v] });
                tb.emitir('arista_solucion', { u, v, linea: 9 });
            } else {
                tb.emitir('descartar_arista', { u, v, linea: 7 });
            }
        }
        tb.emitir('nodo_finalizado', { nodo: u, linea: 11 });
    }
    tb.emitir('fin', { distancias: distancia, padres: padre });
    return [{ distancias: distancia, padres: padre }, tb.traza];
}

/* --- DFS ---------------------------------------------------------------- */
/* Recursivo, igual que algorithms/dfs.py: es lo que hace que el orden de los
 * eventos coincida con el de la versión Python. La profundidad está acotada
 * por el número de nodos, muy por debajo del límite de pila del navegador. */
function dfsTraza(G, origen) {
    const tb = new ConstructorTraza();
    const visitado = new Set();
    const padre = { [origen]: null };
    const descubrimiento = {}, finalizacion = {};
    let reloj = 0;

    const visitar = (u) => {
        visitado.add(u);
        descubrimiento[u] = ++reloj;
        tb.emitir('visitar_nodo', { nodo: u, linea: 2 });
        tb.emitir('procesar_nodo', { nodo: u, linea: 2 });
        for (const { v } of G.vecinos(u)) {
            tb.emitir('explorar_arista', { u, v, linea: 4 });
            if (!visitado.has(v)) {
                padre[v] = u;
                tb.emitir('arista_solucion', { u, v, linea: 5 });
                visitar(v);
            } else {
                tb.emitir('descartar_arista', { u, v, linea: 4 });
            }
        }
        finalizacion[u] = ++reloj;
        tb.emitir('nodo_finalizado', { nodo: u, linea: 7 });
    };
    visitar(origen);
    tb.emitir('fin', { padres: padre, descubrimiento, finalizacion });
    return [{ padres: padre, descubrimiento, finalizacion }, tb.traza];
}

/* --- Dijkstra ------------------------------------------------------------ */
function dijkstraTraza(G, origen) {
    if (G.tienePesosNegativos()) {
        throw new Error('Dijkstra no admite pesos negativos; usa Bellman-Ford.');
    }
    const tb = new ConstructorTraza();
    const distancia = { [origen]: 0 };
    /* Map y no objeto: los nodos se insertan en 'padre' a medida que se
     * relajan, y al final se recorre en ese orden para emitir las aristas de
     * la solución. Un objeto con claves numéricas ("0", "1", ...) las recorre
     * en orden ascendente por especificación de JS, no de inserción, y las
     * aristas salían en un orden distinto al de la versión Python. */
    const padre = new Map([[origen, null]]);
    const finalizado = new Set();
    const cola = new ColaPrioridad();
    cola.push(0, origen);

    tb.emitir('visitar_nodo', { nodo: origen, linea: 2, dist: 0 });
    while (!cola.vacia) {
        const [d, u] = cola.pop();
        if (finalizado.has(u)) continue;
        finalizado.add(u);
        tb.emitir('procesar_nodo', { nodo: u, distancia: d, linea: 6 });
        for (const { v, peso } of G.vecinos(u)) {
            tb.emitir('explorar_arista', { u, v, peso, linea: 9 });
            const nueva = distancia[u] + peso;
            if (!(v in distancia) || nueva < distancia[v]) {
                distancia[v] = nueva;
                padre.set(v, u);
                cola.push(nueva, v);
                tb.emitir('relajar', { u, v, nueva_dist: nueva, linea: 10 });
                if (!finalizado.has(v)) {
                    tb.emitir('visitar_nodo', { nodo: v, linea: 11, dist: nueva });
                }
            } else {
                tb.emitir('descartar_arista', { u, v, linea: 9 });
            }
        }
        tb.emitir('nodo_finalizado', { nodo: u, linea: 6 });
    }
    for (const [v, p] of padre) {
        if (p !== null) tb.emitir('arista_solucion', { u: p, v, linea: 12 });
    }
    const padresObj = Object.fromEntries(padre);
    tb.emitir('fin', { distancias: distancia, padres: padresObj });
    return [{ distancias: distancia, padres: padresObj }, tb.traza];
}

/* --- Bellman-Ford -------------------------------------------------------- */
function bellmanFordTraza(G, origen) {
    const tb = new ConstructorTraza();
    const nodos = G.ids;
    const distancia = Object.fromEntries(nodos.map((n) => [n, Infinity]));
    distancia[origen] = 0;
    const padre = Object.fromEntries(nodos.map((n) => [n, null]));

    // En un grafo no dirigido cada arista relaja en los dos sentidos.
    const aristas = [];
    for (const { origen: u, destino: v, peso } of G.aristas) {
        aristas.push([u, v, peso]);
        if (!G.dirigido) aristas.push([v, u, peso]);
    }

    tb.emitir('visitar_nodo', { nodo: origen, linea: 2, dist: 0 });
    for (let i = 0; i < Math.max(nodos.length - 1, 0); i++) {
        let hubo = false;
        for (const [u, v, peso] of aristas) {
            tb.emitir('explorar_arista', { u, v, iteracion: i + 1, linea: 5 });
            if (distancia[u] !== Infinity && distancia[u] + peso < distancia[v]) {
                distancia[v] = distancia[u] + peso;
                padre[v] = u;
                hubo = true;
                tb.emitir('relajar', { u, v, nueva_dist: distancia[v], linea: 6 });
                tb.emitir('visitar_nodo', { nodo: v, linea: 6, dist: distancia[v] });
            } else {
                tb.emitir('descartar_arista', { u, v, linea: 5 });
            }
        }
        if (!hubo) break;
    }

    // Pasada extra: toda arista que todavía relaja delata un ciclo negativo.
    // Se propaga hacia adelante porque el ciclo completo y todo lo alcanzable
    // desde él tampoco tienen distancia mínima bien definida.
    const sospechosos = new Set();
    for (const [u, v, peso] of aristas) {
        if (distancia[u] !== Infinity && distancia[u] + peso < distancia[v]) sospechosos.add(v);
    }
    const sucesores = new Map(nodos.map((n) => [n, new Set()]));
    for (const [u, v] of aristas) sucesores.get(u).add(v);

    const cicloNegativo = new Set();
    const pendientes = [...sospechosos];
    while (pendientes.length) {
        const n = pendientes.pop();
        if (cicloNegativo.has(n)) continue;
        cicloNegativo.add(n);
        tb.emitir('ciclo_negativo', { nodo: n, linea: 9 });
        for (const s of sucesores.get(n)) if (!cicloNegativo.has(s)) pendientes.push(s);
    }

    for (const [v, p] of Object.entries(padre)) {
        if (p !== null && !cicloNegativo.has(v)) tb.emitir('arista_solucion', { u: p, v, linea: 10 });
    }
    tb.emitir('fin', { distancias: distancia, padres: padre, ciclo_negativo: [...cicloNegativo] });
    return [{ distancias: distancia, padres: padre, ciclo_negativo: cicloNegativo }, tb.traza];
}

/* --- Camino mínimo en DAG ------------------------------------------------ */
function dagCaminoMinimoTraza(G, origen) {
    const orden = G.ordenTopologico();
    if (!G.dirigido || orden === null) {
        throw new Error('Este algoritmo requiere un grafo dirigido y acíclico (DAG).');
    }
    const tb = new ConstructorTraza();
    orden.forEach((u, i) => tb.emitir('orden_topologico_nodo', { nodo: u, posicion: i + 1, linea: 2 }));

    const distancia = Object.fromEntries(G.ids.map((n) => [n, Infinity]));
    distancia[origen] = 0;
    const padre = Object.fromEntries(G.ids.map((n) => [n, null]));
    tb.emitir('visitar_nodo', { nodo: origen, linea: 3, dist: 0 });

    for (const u of orden) {
        if (distancia[u] === Infinity) continue;
        tb.emitir('procesar_nodo', { nodo: u, linea: 5 });
        for (const { v, peso } of G.vecinos(u)) {
            tb.emitir('explorar_arista', { u, v, peso, linea: 8 });
            if (distancia[u] + peso < distancia[v]) {
                distancia[v] = distancia[u] + peso;
                padre[v] = u;
                tb.emitir('relajar', { u, v, nueva_dist: distancia[v], linea: 9 });
                tb.emitir('visitar_nodo', { nodo: v, linea: 9, dist: distancia[v] });
            } else {
                tb.emitir('descartar_arista', { u, v, linea: 8 });
            }
        }
        tb.emitir('nodo_finalizado', { nodo: u, linea: 4 });
    }
    for (const [v, p] of Object.entries(padre)) {
        if (p !== null) tb.emitir('arista_solucion', { u: p, v, linea: 10 });
    }
    tb.emitir('fin', { distancias: distancia, padres: padre, orden_topologico: orden });
    return [{ distancias: distancia, padres: padre, orden_topologico: orden }, tb.traza];
}

/* --- Registro ------------------------------------------------------------ */
const ALGORITMOS = {
    bfs: {
        id: 'bfs', nombre: 'BFS (recorrido en anchura)', funcion: bfsTraza,
        permiteNegativos: true, requiereDag: false, complejidad: 'O(V + E)',
        descripcion: 'Recorre el grafo en anchura desde el nodo origen: explora primero todos '
            + 'los vecinos directos antes de avanzar al siguiente nivel, usando una cola FIFO.\n\n'
            + 'No considera el peso de las aristas — el árbol que construye es el de menor '
            + 'número de saltos, no el de menor costo.',
        pseudocodigo: [
            'función BFS(G, origen):',
            '  distancia[origen] ← 0',
            '  marcar origen como visitado; encolar(origen)',
            '  mientras cola no vacía:',
            '    u ← desencolar()',
            '    para cada vecino v de u:',
            '      si v no visitado:',
            '        marcar v como visitado',
            '        distancia[v] ← distancia[u] + 1; padre[v] ← u',
            '        encolar(v)',
            '    fin de procesar u',
        ],
    },
    dfs: {
        id: 'dfs', nombre: 'DFS (recorrido en profundidad)', funcion: dfsTraza,
        permiteNegativos: true, requiereDag: false, complejidad: 'O(V + E)',
        descripcion: 'Recorre el grafo en profundidad desde el nodo origen: avanza por una rama '
            + 'hasta el final antes de retroceder y probar otra.\n\n'
            + 'No calcula caminos mínimos; construye un árbol de descubrimiento con tiempos de '
            + 'entrada y salida por nodo.',
        pseudocodigo: [
            'función DFS(G, u):',
            '  marcar u como visitado',
            '  para cada vecino v de u:',
            '    si v no visitado:',
            '      padre[v] ← u',
            '      DFS(G, v)',
            '  fin de procesar u (nodo completado)',
        ],
    },
    dijkstra: {
        id: 'dijkstra', nombre: 'Dijkstra (camino mínimo)', funcion: dijkstraTraza,
        permiteNegativos: false, requiereDag: false, complejidad: 'O((V + E) log V)',
        descripcion: 'Calcula el camino más corto por peso acumulado desde el origen usando una '
            + 'cola de prioridad: en cada paso extrae el nodo no finalizado con menor distancia '
            + 'tentativa y relaja sus aristas salientes.\n\n'
            + 'Requiere pesos no negativos: con negativos el resultado puede ser incorrecto, por '
            + 'eso no se ofrece en esos grafos.',
        pseudocodigo: [
            'función Dijkstra(G, origen):',
            '  distancia[origen] ← 0; el resto ← infinito',
            '  Q ← cola de prioridad con todos los nodos',
            '  mientras Q no vacía:',
            '    u ← extraer nodo con menor distancia',
            '    marcar u como finalizado',
            '    para cada vecino v de u:',
            '      peso ← G[u][v]',
            '      si distancia[u] + peso < distancia[v]:',
            '        distancia[v] ← distancia[u] + peso; padre[v] ← u',
            '        actualizar v en Q',
            '  reconstruir árbol de caminos mínimos con padre[]',
        ],
    },
    bellman_ford: {
        id: 'bellman_ford', nombre: 'Bellman-Ford (camino mínimo)', funcion: bellmanFordTraza,
        permiteNegativos: true, requiereDag: false, complejidad: 'O(V · E)',
        descripcion: 'Calcula caminos mínimos relajando TODAS las aristas del grafo, V-1 veces.\n\n'
            + 'Más lento que Dijkstra, pero admite pesos negativos; una pasada extra permite '
            + 'detectar ciclos de peso negativo, cuyos nodos se marcan en rojo porque no tienen '
            + 'un camino mínimo bien definido.',
        pseudocodigo: [
            'función BellmanFord(G, origen):',
            '  distancia[origen] ← 0; el resto ← infinito',
            '  repetir (V - 1) veces:',
            '    para cada arista (u, v) con peso w en G:',
            '      si distancia[u] + w < distancia[v]:',
            '        distancia[v] ← distancia[u] + w; padre[v] ← u',
            '  para cada arista (u, v) con peso w en G:',
            '    si distancia[u] + w < distancia[v]:',
            '      marcar v como parte de un ciclo negativo',
            '  reconstruir árbol con padre[] (salvo nodos en ciclo negativo)',
        ],
    },
    dag_sp: {
        id: 'dag_sp', nombre: 'Camino mínimo en DAG (orden topológico)', funcion: dagCaminoMinimoTraza,
        permiteNegativos: true, requiereDag: true, complejidad: 'O(V + E)',
        descripcion: 'Calcula caminos mínimos en un grafo dirigido acíclico en dos fases: primero '
            + 'un orden topológico (algoritmo de Kahn), luego relaja las aristas siguiendo ese '
            + 'orden, una sola vez.\n\n'
            + 'Al no haber ciclos no hace falta reintentar relajaciones como en Bellman-Ford, y '
            + 'admite pesos negativos sin problema.',
        pseudocodigo: [
            'función CaminoMinimoDAG(G, origen):',
            '  orden ← ordenTopológico(G)   // algoritmo de Kahn',
            '  distancia[origen] ← 0',
            '  para cada nodo u en orden:',
            '    si distancia[u] es finita:',
            '      para cada vecino v de u:',
            '        peso ← G[u][v]',
            '        si distancia[u] + peso < distancia[v]:',
            '          distancia[v] ← distancia[u] + peso; padre[v] ← u',
            '  reconstruir camino con padre[]',
        ],
    },
};

/* Motivo por el que un algoritmo no aplica al grafo, o null si sí aplica.
 * Existe para poder EXPLICAR la ausencia en la interfaz en vez de que el
 * algoritmo simplemente desaparezca de la lista. */
function motivoNoDisponible(info, G) {
    if (info.requiereDag && !G.esDAG()) {
        return G.dirigido
            ? 'Requiere un grafo acíclico (DAG); este tiene ciclos.'
            : 'Requiere un grafo dirigido y acíclico; este es no dirigido.';
    }
    if (G.tienePesosNegativos() && !info.permiteNegativos) {
        return 'El grafo tiene pesos negativos y este algoritmo no los admite.';
    }
    return null;
}

function estadoAlgoritmos(G) {
    return Object.values(ALGORITMOS).map((info) => {
        const motivo = motivoNoDisponible(info, G);
        return { id: info.id, nombre: info.nombre, disponible: motivo === null, motivo };
    });
}
