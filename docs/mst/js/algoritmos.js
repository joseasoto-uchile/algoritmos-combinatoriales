/* Algoritmos de árbol de expansión mínima y su registro.
 *
 * Cada algoritmo emite una traza de eventos con el mismo vocabulario y con el
 * número de línea del pseudocódigo que le corresponde, de modo que la capa de
 * dibujo sirve para todos sin distinguir cuál se está ejecutando.
 *
 * La unidad de la traza es un bloque del pseudocódigo, no una arista. Los
 * bloques van marcados en el propio pseudocódigo con una línea de comentario, y
 * cada evento apunta a las líneas del suyo:
 *
 *   Jarník-Prim   % extraer mínimo   % aumentar        dos pasos por vuelta
 *   Kruskal       % decidir                            un paso por arista
 *   Borůvka       % elegir           % aumentar        dos pasos por fase
 *
 * Los tres suponen las aristas totalmente ordenadas: primero por peso y, entre
 * pesos iguales, por el orden en que se declararon. Con ese orden fijo los tres
 * devuelven el mismo árbol y Borůvka es correcto, cosa que no ocurre si dos
 * componentes pueden elegir aristas de igual peso en sentidos opuestos.
 */

class ConstructorTraza {
    constructor() { this.traza = []; this.paso = 0; }
    emitir(tipo, datos = {}) {
        this.paso += 1;
        this.traza.push({ tipo, paso: this.paso, ...datos });
    }
}

/* Posición de cada arista en el orden total, indexada por su clave. Es lo que
 * significa "arista mínima" en los tres algoritmos. */
function _rangoDeAristas(G) {
    const rango = new Map();
    G.aristasOrdenadas().forEach((a, i) => rango.set(claveArista(a.origen, a.destino), i));
    return rango;
}

/* Peso total de un conjunto de aristas dado como lista de pares. */
function _pesoDe(G, pares) {
    const peso = new Map(G.aristas.map((a) => [claveArista(a.origen, a.destino), a.peso]));
    return pares.reduce((s, [u, v]) => s + peso.get(claveArista(u, v)), 0);
}

/* --- Jarník-Prim --------------------------------------------------------- */
/* La cola de prioridad se recorre por barrido. El pseudocódigo la trata como
 * una caja negra con Extraer-mínimo y Reducir-valor, de modo que la animación
 * no muestra su interior; lo que se ve es el efecto sobre D y Π.
 *
 * El empate en D se resuelve por el orden total de las aristas: entre dos nodos
 * con el mismo D sale primero aquel cuya arista hacia U es menor. Un nodo sin
 * arista hacia U todavía (D = +∞) desempata por su nombre. */
function _extraerMinimo(enCola, D, aristaDe, rango) {
    let mejor = null;
    for (const v of enCola) {
        if (mejor === null) { mejor = v; continue; }
        if (D[v] < D[mejor]) { mejor = v; continue; }
        if (D[v] > D[mejor]) continue;
        const rv = aristaDe[v] === null ? Infinity : rango.get(aristaDe[v]);
        const rm = aristaDe[mejor] === null ? Infinity : rango.get(aristaDe[mejor]);
        if (rv < rm || (rv === rm && String(v) < String(mejor))) mejor = v;
    }
    return mejor;
}

function primTraza(G, raiz) {
    const tb = new ConstructorTraza();
    const ids = G.ids;
    const rango = _rangoDeAristas(G);
    const D = {}, Pi = {}, aristaDe = {};
    for (const v of ids) { D[v] = Infinity; Pi[v] = null; aristaDe[v] = null; }
    D[raiz] = 0;
    tb.emitir('inicializar', { linea: [2, 3, 4] });

    const enCola = new Set(ids);
    const arbol = [];
    let n = 0;
    while (enCola.size) {
        const u = _extraerMinimo(enCola, D, aristaDe, rango);
        enCola.delete(u);
        const arista = Pi[u] === null ? null : [Pi[u], u];
        if (arista) arbol.push(arista);
        n += 1;
        tb.emitir('extraer', {
            n, nodo: u, dist: D[u], padre: Pi[u], arista, peso: D[u], linea: [5, 6, 7],
        });

        const exploradas = [], actualizadas = [], descartadas = [];
        for (const { v, peso } of G.vecinos(u)) {
            if (!enCola.has(v)) continue;
            exploradas.push([u, v]);
            if (peso < D[v]) {
                D[v] = peso;
                Pi[v] = u;
                aristaDe[v] = claveArista(u, v);
                actualizadas.push({ nodo: v, dist: peso, padre: u });
            } else {
                descartadas.push([u, v]);
            }
        }
        tb.emitir('aumentar', {
            n, nodo: u, exploradas, actualizadas, descartadas,
            linea: [8, 9, 10, 11, 12, 13],
        });
    }
    const peso = _pesoDe(G, arbol);
    tb.emitir('fin', { aristas: arbol, peso, linea: 14 });
    return [{ aristas: arbol, peso }, tb.traza];
}

/* --- Kruskal ------------------------------------------------------------- */
/* Una vuelta del ciclo por arista de la lista ordenada: se mira dónde están sus
 * extremos y se acepta o se rechaza. */
function kruskalTraza(G) {
    const tb = new ConstructorTraza();
    const uf = new UnionFind(G.ids);
    const orden = G.aristasOrdenadas();
    tb.emitir('inicializar', { orden: orden.map((a) => [a.origen, a.destino]), linea: [2, 3, 4] });

    const arbol = [];
    let n = 0;
    for (const { origen: u, destino: v, peso } of orden) {
        const acepta = !uf.mismaComponente(u, v);
        if (acepta) { uf.unir(u, v); arbol.push([u, v]); }
        tb.emitir('iteracion', {
            n: ++n, u, v, peso, aceptada: acepta,
            linea: acepta ? [5, 6, 7, 8] : [5, 6, 7],
        });
    }
    const peso = _pesoDe(G, arbol);
    tb.emitir('fin', { aristas: arbol, peso, linea: 9 });
    return [{ aristas: arbol, peso }, tb.traza];
}

/* --- Borůvka ------------------------------------------------------------- */
/* Dos pasos por fase, que son las dos mitades del cuerpo del ciclo: primero
 * toda componente elige su arista saliente mínima, y después se agregan todas
 * de una vez.
 *
 * Las elecciones se muestran juntas porque juntas se hacen: es lo que separa a
 * Borůvka de los otros dos. Dos componentes pueden elegir la misma arista, de
 * modo que Aux tiene menos elementos que componentes hay. */
function boruvkaTraza(G) {
    const tb = new ConstructorTraza();
    const ids = G.ids;
    const rango = _rangoDeAristas(G);
    const uf = new UnionFind(ids);
    tb.emitir('inicializar', { linea: [2, 3] });

    const arbol = [];
    let componentes = agruparComponentes(componentesDe(ids, arbol)).length;
    let fase = 0;
    while (componentes > 1) {
        fase += 1;
        const exploradas = [], elecciones = [];
        for (const [rep, nodos] of agruparComponentes(componentesDe(ids, arbol))) {
            const dentro = new Set(nodos);
            let mejor = null;
            for (const u of nodos) {
                for (const { v, peso } of G.vecinos(u)) {
                    // Las aristas internas de la componente no están en δ(K).
                    if (dentro.has(v)) continue;
                    exploradas.push([u, v]);
                    const r = rango.get(claveArista(u, v));
                    if (mejor === null || r < mejor.r) mejor = { u, v, peso, r };
                }
            }
            elecciones.push({ componente: rep, u: mejor.u, v: mejor.v, peso: mejor.peso });
        }
        tb.emitir('fase_elegir', {
            fase, componentes, elecciones, exploradas, linea: [4, 5, 6, 7, 8, 9],
        });

        const aux = new Map();
        for (const e of elecciones) aux.set(claveArista(e.u, e.v), [e.u, e.v, e.peso]);
        for (const [u, v] of aux.values()) { uf.unir(u, v); arbol.push([u, v]); }
        tb.emitir('fase_unir', { fase, aristas: [...aux.values()], linea: [10, 11] });
        componentes = agruparComponentes(componentesDe(ids, arbol)).length;
    }
    const peso = _pesoDe(G, arbol);
    tb.emitir('fin', { aristas: arbol, peso, fases: fase, linea: 12 });
    return [{ aristas: arbol, peso, fases: fase }, tb.traza];
}

/* --- Registro ------------------------------------------------------------ */
/* `panel` indica qué muestra la columna lateral: los vectores D y Π por nodo,
 * la lista ordenada de aristas o la arista mínima de cada componente. Es la
 * estructura principal de cada algoritmo. */
const ALGORITMOS = {
    prim: {
        id: 'prim', nombre: 'Jarník–Prim', funcion: primTraza,
        usaRaiz: true, panel: 'vectores', nombreCerrados: 'U',
        aristasNoSeRevisitan: true, complejidad: 'O(m + n log n)',
        descripcion: 'Mantiene un conjunto U que empieza en la raíz y crece de a un nodo. '
            + 'El corte es δ(U) y en cada vuelta entra su arista de peso mínimo.\n\n'
            + 'La versión que se muestra guarda en D[v] el peso de la arista más liviana que '
            + 'une v con U, y en Π[v] su otro extremo, sobre una cola de prioridad Q. Es la '
            + 'de la lámina que compara Prim con Dijkstra: el pseudocódigo es el mismo salvo '
            + 'la condición del si, que aquí compara w(uv) y allá D[u] + ℓ(u,v).\n\n'
            + 'La arista {Π[u], u} se dibuja como parte del árbol cuando u sale de Q, que es '
            + 'el momento en que deja de poder cambiar.',
        pseudocodigo: [
            'Jarník–Prim(G, r, w)',
            '% inicializar',
            '  para v ∈ V:  D[v] ← +∞;  Π[v] ← ⊥',
            '  D[r] ← 0;  Q ← {(x, D[x]) : x ∈ V}',
            '  mientras Q no esté vacía:',
            '% extraer mínimo',
            '    (u, D[u]) ← Extraer-mínimo(Q)',
            '% aumentar',
            '    para v ∈ N(u) con v en Q:',
            '      si w(uv) < D[v]:',
            '        D[v] ← w(uv)',
            '        Π[v] ← u',
            '        Reducir-valor(Q, v, D[v])',
            '  devolver E_Π',
        ],
    },
    kruskal: {
        id: 'kruskal', nombre: 'Kruskal', funcion: kruskalTraza,
        usaRaiz: false, panel: 'aristas', nombreCerrados: null,
        aristasNoSeRevisitan: true, complejidad: 'O(m log n)',
        descripcion: 'Recorre las aristas de menor a mayor peso y acepta la que une dos '
            + 'componentes distintas del bosque actual. La que tiene sus dos extremos en la '
            + 'misma componente se rechaza: agregarla cerraría un ciclo.\n\n'
            + 'La arista aceptada es la primera de δ(K) para la componente K de uno de sus '
            + 'extremos, de modo que la regla de corte se aplica con ese corte.\n\n'
            + 'El ciclo recorre las m aristas aunque el árbol quede fijado antes.',
        pseudocodigo: [
            'Kruskal(G, w)',
            '% inicializar',
            '  ordenar E = {e₁, …, e_m} de menor a mayor peso',
            '  F ← ∅',
            '  para i ← 1 hasta m:',
            '% decidir',
            '    si los extremos de eᵢ están en componentes distintas de (V, F):',
            '      F ← F + eᵢ',
            '  devolver F',
        ],
    },
    boruvka: {
        id: 'boruvka', nombre: 'Borůvka', funcion: boruvkaTraza,
        usaRaiz: false, panel: 'componentes', nombreCerrados: null,
        aristasNoSeRevisitan: false, complejidad: 'O(m log n)',
        descripcion: 'Trabaja por fases. En cada una, toda componente del bosque actual elige '
            + 'la arista de peso mínimo que sale de ella, y después se agregan todas juntas.\n\n'
            + 'Cada componente se une al menos con otra, de modo que su número se reduce al '
            + 'menos a la mitad en cada fase: hay O(log n) fases y cada una cuesta O(m).\n\n'
            + 'Dos componentes pueden elegir la misma arista, y entonces se agrega una sola '
            + 'vez: en una fase entran menos aristas que componentes había.',
        pseudocodigo: [
            'Borůvka(G, w)',
            '% inicializar',
            '  F ← ∅',
            '  mientras F no sea conexo:',
            '% elegir',
            '    Aux ← ∅',
            '    para cada componente K de (V, F):',
            '      e_K ← arista mínima de δ(K)',
            '    Aux ← {e_K : K componente de (V, F)}',
            '% aumentar',
            '    F ← F ∪ Aux',
            '  devolver F',
        ],
    },
};
