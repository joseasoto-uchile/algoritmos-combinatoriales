/* Algoritmos y su registro.
 *
 * Cada algoritmo emite una traza de eventos con el mismo vocabulario y con el
 * número de línea del pseudocódigo que le corresponde, de modo que la capa de
 * dibujo sirve para todos sin distinguir cuál se está ejecutando.
 */

class ConstructorTraza {
    constructor() { this.traza = []; this.paso = 0; }
    emitir(tipo, datos = {}) {
        this.paso += 1;
        this.traza.push({ tipo, paso: this.paso, ...datos });
    }
}

/* --- BFS ---------------------------------------------------------------- */
function bfsTraza(G, origen) {
    const tb = new ConstructorTraza();
    const visitado = new Set([origen]);
    const padre = { [origen]: null };
    const distancia = { [origen]: 0 };
    const cola = [origen];

    tb.emitir('inicializar', { linea: 2 });
    tb.emitir('visitar_nodo', { nodo: origen, linea: 3, dist: 0, padre: null });
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
                tb.emitir('visitar_nodo', { nodo: v, linea: 8, dist: distancia[v], padre: u });
                tb.emitir('arista_solucion', { u, v, linea: 9 });
            } else {
                tb.emitir('descartar_arista', { u, v, linea: 7 });
            }
        }
        tb.emitir('nodo_finalizado', { nodo: u, linea: 11 });
    }
    tb.emitir('fin', { distancias: distancia, padres: padre, linea: 11 });
    return [{ distancias: distancia, padres: padre }, tb.traza];
}

/* --- DFS ---------------------------------------------------------------- */
/* Recursivo. La profundidad está acotada por el número de nodos, por debajo
 * del límite de pila del navegador. */
function dfsTraza(G, origen) {
    const tb = new ConstructorTraza();
    const visitado = new Set();
    const padre = { [origen]: null };
    const descubrimiento = {}, finalizacion = {};
    let reloj = 0;

    tb.emitir('inicializar', { linea: 1 });

    const visitar = (u) => {
        visitado.add(u);
        descubrimiento[u] = ++reloj;
        tb.emitir('visitar_nodo', { nodo: u, linea: 2, padre: padre[u] ?? null });
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
    tb.emitir('fin', { padres: padre, descubrimiento, finalizacion, linea: 7 });
    return [{ padres: padre, descubrimiento, finalizacion }, tb.traza];
}

/* --- Dijkstra ------------------------------------------------------------ */
/* Version basica: en cada vuelta se elige por barrido el nodo de V \ S con D
 * minimo, sin cola de prioridad. Es el pseudocodigo de la clase.
 *
 * El barrido desempata por el nombre del nodo. Sin ese desempate, con dos
 * nodos a la misma distancia el elegido dependeria del orden de la lista de
 * nodos y la animacion dejaria de ser reproducible. */
function _elegirMinimo(ids, D, S) {
    let mejor = null;
    for (const v of ids) {
        if (S.has(v)) continue;
        if (mejor === null || D[v] < D[mejor]
            || (D[v] === D[mejor] && String(v) < String(mejor))) mejor = v;
    }
    return mejor;
}

function dijkstraTraza(G, origen) {
    if (G.tienePesosNegativos()) {
        throw new Error('Dijkstra no admite pesos negativos; usa Bellman-Ford.');
    }
    const tb = new ConstructorTraza();
    const ids = G.ids;
    const D = {}, Pi = {};
    for (const v of ids) { D[v] = Infinity; Pi[v] = null; }
    tb.emitir('inicializar', { linea: 2 });

    D[origen] = 0;
    /* Map y no un objeto: los nodos se insertan a medida que se relajan, y las
     * aristas de la solucion se emiten en ese orden. Un objeto con claves
     * numericas las recorre en orden ascendente por especificacion del
     * lenguaje, no en orden de insercion. */
    const padre = new Map([[origen, null]]);
    const S = new Set();
    tb.emitir('visitar_nodo', { nodo: origen, linea: 3, dist: 0 });

    while (S.size < ids.length) {
        const a = _elegirMinimo(ids, D, S);
        tb.emitir('procesar_nodo', { nodo: a, distancia: D[a], linea: [4, 5] });
        if (D[a] === Infinity) {
            // Los nodos que quedan son inalcanzables desde el origen.
            tb.emitir('interrumpir', { nodo: a, restantes: ids.length - S.size, linea: 6 });
            break;
        }
        for (const { v: b, peso } of G.vecinos(a)) {
            tb.emitir('explorar_arista', { u: a, v: b, peso, linea: [7, 8] });
            const candidato = D[a] + peso;
            if (candidato < D[b]) {
                D[b] = candidato;
                Pi[b] = a;
                padre.set(b, a);
                tb.emitir('relajar', { u: a, v: b, nueva_dist: candidato, linea: [9, 10] });
                if (!S.has(b)) tb.emitir('visitar_nodo', { nodo: b, linea: 9, dist: candidato });
            } else {
                tb.emitir('descartar_arista', { u: a, v: b, linea: 8 });
            }
        }
        S.add(a);
        tb.emitir('nodo_finalizado', { nodo: a, linea: 11 });
    }

    for (const [v, p] of padre) {
        if (p !== null) tb.emitir('arista_solucion', { u: p, v, linea: 12 });
    }
    const padresObj = Object.fromEntries(padre);
    tb.emitir('fin', { distancias: D, padres: padresObj, linea: 12 });
    return [{ distancias: D, padres: padresObj }, tb.traza];
}

/* --- Bellman-Ford -------------------------------------------------------- */
function bellmanFordTraza(G, origen) {
    const tb = new ConstructorTraza();
    const nodos = G.ids;
    const distancia = Object.fromEntries(nodos.map((n) => [n, Infinity]));
    distancia[origen] = 0;
    const padre = Object.fromEntries(nodos.map((n) => [n, null]));

    const aristas = G.aristas.map(({ origen: u, destino: v, peso }) => [u, v, peso]);

    tb.emitir('inicializar', { linea: 1 });
    tb.emitir('visitar_nodo', { nodo: origen, linea: 2, dist: 0, padre: null });
    const totalIteraciones = Math.max(nodos.length - 1, 0);
    let cortoAnticipado = false;
    for (let i = 0; i < totalIteraciones; i++) {
        // Marca el comienzo de cada pasada. Es el único evento que distingue
        // una pasada de otra, ya que todas repiten los mismos eventos sobre
        // las mismas aristas. La interfaz lo usa para mostrar la iteración.
        tb.emitir('inicio_iteracion', {
            iteracion: i + 1, total_iteraciones: totalIteraciones, linea: 3,
        });
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
        if (!hubo) {
            // Una pasada sin cambios implica que las siguientes tampoco los
            // producirán. El algoritmo termina y lo indica en la traza.
            tb.emitir('fin_iteraciones', {
                iteracion: i + 1, total_iteraciones: totalIteraciones,
                anticipado: true, linea: 3,
            });
            cortoAnticipado = true;
            break;
        }
    }
    if (!cortoAnticipado) {
        tb.emitir('fin_iteraciones', {
            iteracion: totalIteraciones, total_iteraciones: totalIteraciones,
            anticipado: false, linea: 3,
        });
    }

    // Pasada adicional: toda arista que aún se puede relajar indica un ciclo de
    // peso negativo. La marca se propaga hacia adelante desde esos extremos,
    // porque el ciclo completo y los nodos alcanzables desde él tampoco tienen
    // distancia mínima definida.
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
    tb.emitir('fin', { distancias: distancia, padres: padre, ciclo_negativo: [...cicloNegativo], linea: 10 });
    return [{ distancias: distancia, padres: padre, ciclo_negativo: cicloNegativo }, tb.traza];
}

/* --- Camino mínimo en DAG ------------------------------------------------ */
function dagCaminoMinimoTraza(G, origen) {
    const orden = G.ordenTopologico();
    if (orden === null) {
        throw new Error('Este algoritmo requiere un digrafo acíclico (DAG).');
    }
    const tb = new ConstructorTraza();
    orden.forEach((u, i) => tb.emitir('orden_topologico_nodo', { nodo: u, posicion: i + 1, linea: 2 }));

    const distancia = Object.fromEntries(G.ids.map((n) => [n, Infinity]));
    distancia[origen] = 0;
    const padre = Object.fromEntries(G.ids.map((n) => [n, null]));
    tb.emitir('inicializar', { linea: 3 });
    tb.emitir('visitar_nodo', { nodo: origen, linea: 3, dist: 0, padre: null });

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
    tb.emitir('fin', { distancias: distancia, padres: padre, orden_topologico: orden, linea: 10 });
    return [{ distancias: distancia, padres: padre, orden_topologico: orden }, tb.traza];
}

/* --- Registro ------------------------------------------------------------ */
const ALGORITMOS = {
    bfs: {
        id: 'bfs', nombre: 'BFS (recorrido en anchura)', funcion: bfsTraza,
        vectores: ['D', 'Π'], nombreCerrados: 'Finalizados', aristasNoSeRevisitan: true,
        permiteNegativos: true, requiereDag: false, complejidad: 'O(V + E)',
        descripcion: 'Recorre el grafo en anchura desde el nodo origen: explora primero todos '
            + 'los vecinos directos antes de avanzar al siguiente nivel, usando una cola FIFO.\n\n'
            + 'No considera el peso de las aristas. El árbol resultante es el de menor '
            + 'número de aristas, no el de menor costo.',
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
        vectores: ['Π'], nombreCerrados: 'Finalizados', aristasNoSeRevisitan: true,
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
        permiteNegativos: false, requiereDag: false, complejidad: 'O(V² + E)',
        vectores: ['D', 'Π'], nombreCerrados: 'S', aristasNoSeRevisitan: true,
        descripcion: 'Calcula el camino de menor peso acumulado desde el origen. En cada '
            + 'vuelta elige el nodo de V∖S con D mínimo y relaja sus arcos salientes. El '
            + 'nodo elegido entra en S y no se vuelve a tocar.\n\n'
            + 'La elección del mínimo es por barrido sobre V∖S, sin cola de prioridad, '
            + 'que es la versión del pseudocódigo de la clase.\n\n'
            + 'Requiere pesos no negativos. Con pesos negativos el resultado puede ser '
            + 'incorrecto, por lo que no se ofrece en esos grafos.',
        pseudocodigo: [
            'Dijkstra(G, s, ℓ)',
            '  D[v] ← +∞;  Π[v] ← ⊥  para todo v ∈ V',
            '  D[s] ← 0;  S ← ∅',
            '  mientras S ≠ V:',
            '      elegir a ∈ V∖S que minimice D[a]',
            '      si D[a] = +∞: interrumpir el ciclo',
            '      para cada (a,b) ∈ δ⁺(a):',
            '          si D[a] + ℓ(a,b) < D[b]:',
            '              D[b] ← D[a] + ℓ(a,b)',
            '              Π[b] ← a',
            '      S ← S ∪ {a}',
            '  devolver (D, Π)',
        ],
    },
    bellman_ford: {
        id: 'bellman_ford', nombre: 'Bellman-Ford (camino mínimo)', funcion: bellmanFordTraza,
        vectores: ['D', 'Π'], nombreCerrados: null,
        permiteNegativos: true, requiereDag: false, complejidad: 'O(V · E)',
        descripcion: 'Calcula caminos mínimos relajando todas las aristas del grafo, V-1 '
            + 'veces.\n\n'
            + 'Es más lento que Dijkstra, pero admite pesos negativos. Una pasada adicional '
            + 'detecta ciclos de peso negativo. Los nodos alcanzados por un ciclo de ese tipo no '
            + 'tienen camino mínimo definido, y se marcan en rojo.',
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
        vectores: ['D', 'Π'], nombreCerrados: 'Procesados', aristasNoSeRevisitan: true,
        permiteNegativos: true, requiereDag: true, complejidad: 'O(V + E)',
        descripcion: 'Calcula caminos mínimos en un digrafo acíclico en dos fases. '
            + 'Primero obtiene un orden topológico con el algoritmo de Kahn, y después relaja '
            + 'las aristas siguiendo ese orden, una sola vez.\n\n'
            + 'Al no haber ciclos no es necesario repetir las relajaciones como en Bellman-Ford. '
            + 'Admite pesos negativos.',
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

/* Motivo por el que un algoritmo no es aplicable al grafo, o null si lo es. La
 * interfaz muestra este texto junto al algoritmo que no ofrece. */
function motivoNoDisponible(info, G) {
    if (info.requiereDag && !G.esDAG()) {
        return 'Requiere un digrafo acíclico (DAG); este tiene ciclos.';
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
