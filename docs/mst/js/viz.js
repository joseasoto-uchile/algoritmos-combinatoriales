/* Convierte (grafo, traza, paso actual) en elementos de Cytoscape.
 *
 * Es la única capa que conoce a la vez el formato de la traza y el de
 * Cytoscape. Los algoritmos no dependen de ella.
 */

const COLORES = {
    base: '#b0bec5', base_borde: '#78909c',
    activo: '#ffb74d', activo_borde: '#e65100',
    solucion: '#66bb6a', solucion_borde: '#1b5e20',
    /* Las aristas llevan su propio juego de colores, aparte del de los nodos:
       gris oscuro sin examinar, celeste ya examinada, roja punteada
       descartada y verde gruesa dentro del árbol. */
    arista: '#546e7a',
    arista_procesada: '#4fc3f7',
    arista_descartada: '#e53935',
    incidente: '#1565c0',
    raiz_borde: '#f57f17',
};

/* Un color por componente de (V, F). Las componentes de un solo nodo no se
 * pintan: lo que interesa ver es cuáles se han unido ya.
 *
 * Con más de ocho componentes los colores se repiten, de modo que el color es
 * una pista y el dato está en la tabla y en el texto. */
const COLORES_COMPONENTE = [
    ['#90caf9', '#1565c0'], ['#a5d6a7', '#2e7d32'], ['#ce93d8', '#6a1b9a'],
    ['#80cbc4', '#00695c'], ['#f48fb1', '#ad1457'], ['#fff59d', '#f9a825'],
    ['#bcaaa4', '#4e342e'], ['#9fa8da', '#283593'],
];

// La leyenda de la interfaz se construye a partir de estos valores.
const ESTADOS_LEYENDA = [
    ['Fuera del bosque', 'Componente de un solo nodo', COLORES.base, COLORES.base_borde],
    ['Raíz', 'Nodo de partida de Jarník–Prim', COLORES.base, COLORES.raiz_borde],
    ['Componente', 'Nodos ya unidos por F, un color cada una', COLORES_COMPONENTE[0][0], COLORES_COMPONENTE[0][1]],
    ['Activo', 'Lo que ocurre en este paso', COLORES.activo, COLORES.activo_borde],
    ['Arista sin examinar', 'Todavía no considerada', COLORES.arista, COLORES.arista],
    ['Arista examinada', 'Ya considerada en este algoritmo', COLORES.arista_procesada, COLORES.arista_procesada],
    ['Arista descartada', 'Cerraría un ciclo, o no mejora D[v]', COLORES.arista_descartada, COLORES.arista_descartada],
    ['Arista de F', 'Dentro del árbol de expansión mínima', COLORES.solucion_borde, COLORES.solucion_borde],
    ['Arista incidente', 'Toca el nodo elegido en la tabla', COLORES.incidente, COLORES.incidente],
];

const ESTILOS = [
    { selector: 'node', style: {
        content: 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
        'background-color': COLORES.base, color: '#1a1a1a', 'font-size': '12px',
        width: '34px', height: '34px', 'border-width': '2px', 'border-color': COLORES.base_borde } },
    /* Sin punta de flecha: el grafo no es dirigido y el orden en que se
       escribieron los extremos de una arista no significa nada. */
    { selector: 'edge', style: {
        content: 'data(label)', 'curve-style': 'bezier', 'line-color': COLORES.arista,
        width: 2,
        'font-size': '10px', color: '#546e7a', 'text-background-color': '#ffffff',
        'text-background-opacity': 1, 'text-background-padding': '1px' } },
    // Un selector por color de componente, generados más abajo.
    ...COLORES_COMPONENTE.map(([fondo, borde], i) => ({
        selector: `node.comp_${i}`, style: { 'background-color': fondo, 'border-color': borde },
    })),
    { selector: 'node.raiz', style: {
        'border-width': '4px', 'border-color': COLORES.raiz_borde, 'border-style': 'double' } },
    { selector: 'node.activo', style: {
        'background-color': COLORES.activo, 'border-color': COLORES.activo_borde, 'border-width': '4px' } },
    { selector: 'edge.procesada', style: {
        'line-color': COLORES.arista_procesada, width: 2.5 } },
    { selector: 'edge.descartada', style: {
        'line-color': COLORES.arista_descartada, 'line-style': 'dashed', width: 2.5 } },
    /* F es la respuesta: va más gruesa y más oscura que el resto, que es lo que
       la separa del celeste de las ya examinadas. */
    { selector: 'edge.solucion', style: {
        'line-color': COLORES.solucion_borde, width: 5, 'line-style': 'solid' } },
    { selector: 'edge.activa', style: {
        'line-color': COLORES.activo_borde, width: 4, 'line-style': 'solid' } },
    { selector: 'edge.incidente', style: {
        'line-color': COLORES.incidente, width: 4 } },
    { selector: 'node.incidente', style: {
        'border-color': COLORES.incidente, 'border-width': '4px' } },
    /* Cytoscape.js admite una sola etiqueta por elemento. El nombre del nodo y
     * el valor de D son los dos renglones de un mismo texto, situado bajo el
     * nodo, y comparten color.
     *
     * Esta regla debe declararse después de las de estado, que fijan colores de
     * fondo. Aquí el texto va sobre el fondo del lienzo. */
    { selector: 'node.con_distancia', style: {
        'text-wrap': 'wrap', 'line-height': 1.15, 'text-valign': 'bottom',
        'text-halign': 'center', 'text-margin-y': '4px', 'font-size': '11px',
        color: '#263238', 'text-background-color': '#ffffff',
        'text-background-opacity': 0.85, 'text-background-padding': '2px',
        'text-background-shape': 'roundrectangle' } },
];

/* Identificador de arista, réplica del que genera grafo.js. */
function idArista(u, v) {
    return String(u) < String(v) ? `${u}__${v}` : `${v}__${u}`;
}

/* Nombre de una arista para mostrarla. Los extremos van ordenados: el que la
 * eligió pudo encontrarla desde cualquiera de los dos, y dos componentes que
 * eligen la misma tienen que escribirla igual. */
function nombreArista(u, v, separador = ' — ') {
    return String(u) < String(v) ? `${u}${separador}${v}` : `${v}${separador}${u}`;
}

function grafoAElementos(G, incluirPosiciones = true) {
    const elementos = [];
    for (const nodo of G.nodos.values()) {
        const el = { data: { id: nodo.id, label: nodo.label ?? nodo.id } };
        if (incluirPosiciones && nodo.pos) el.position = { x: nodo.pos[0], y: nodo.pos[1] };
        elementos.push(el);
    }
    for (const { origen, destino, peso } of G.aristas) {
        elementos.push({
            data: {
                id: idArista(origen, destino),
                source: origen, target: destino,
                label: peso === undefined || peso === null ? '' : String(peso),
            },
        });
    }
    return elementos;
}

/* Clases de nodos y aristas en `pasoActual`.
 *
 * Un paso es un bloque del pseudocódigo, de modo que cada evento trae listas
 * de aristas: las que el bloque examinó, las que descartó y la que entró en F.
 *
 * Las aristas de F son permanentes. Las marcas de examinada y descartada duran
 * lo que dure el algoritmo en Jarník–Prim y Kruskal, que no vuelven sobre una
 * arista. En Borůvka se borran al empezar cada fase: la que no fue la mínima de
 * un corte puede ser la elegida en la fase siguiente, y por lo mismo ahí
 * ninguna queda descartada.
 *
 * El color de componente sale de las componentes de (V, F), que es la
 * definición que usan los tres algoritmos, y no de un evento aparte. */
function calcularEstado(traza, pasoActual, info = {}, ids = []) {
    const clasesNodo = new Map(), clasesArista = new Map();
    const agregar = (m, k, c) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(c); };
    const tope = traza.length ? Math.max(0, Math.min(pasoActual, traza.length - 1)) : -1;
    const persisten = info.aristasNoSeRevisitan !== false;

    let transitorias = new Map();  // id de arista -> 'procesada' | 'descartada'
    const aceptadas = [];
    const marcar = (lista, clase) => {
        for (const [u, v] of lista || []) transitorias.set(idArista(u, v), clase);
    };
    for (let i = 0; i <= tope; i++) {
        const ev = traza[i];
        switch (ev.tipo) {
            case 'iteracion':
                // Kruskal: la vuelta decide una sola arista.
                transitorias.set(idArista(ev.u, ev.v), ev.aceptada ? 'procesada' : 'descartada');
                if (ev.aceptada) aceptadas.push([ev.u, ev.v]);
                break;
            case 'extraer':
                if (ev.arista) aceptadas.push(ev.arista);
                break;
            case 'aumentar':
                marcar(ev.exploradas, 'procesada');
                marcar(ev.descartadas, 'descartada');
                break;
            case 'fase_elegir':
                if (!persisten) transitorias = new Map();
                // Ninguna queda descartada: la que no es mínima de este corte
                // puede ser la elegida en la fase siguiente.
                marcar(ev.exploradas, 'procesada');
                break;
            case 'fase_unir':
                for (const [u, v] of ev.aristas) aceptadas.push([u, v]);
                break;
            default:
                break;
        }
    }
    for (const [id, clase] of transitorias) agregar(clasesArista, id, clase);
    for (const [u, v] of aceptadas) agregar(clasesArista, idArista(u, v), 'solucion');

    const componentes = componentesDe(ids, aceptadas);
    agruparComponentes(componentes).forEach(([, nodos], i) => {
        if (nodos.length < 2) return;
        for (const v of nodos) agregar(clasesNodo, v, `comp_${i % COLORES_COMPONENTE.length}`);
    });

    if (tope >= 0) {
        const ev = traza[tope];
        const activa = (u, v) => {
            agregar(clasesArista, idArista(u, v), 'activa');
            agregar(clasesNodo, u, 'activo');
            agregar(clasesNodo, v, 'activo');
        };
        // En Borůvka se marcan las aristas y no sus extremos: la elección es de
        // la componente, y pintar los nodos taparía su color.
        if (ev.tipo === 'iteracion') activa(ev.u, ev.v);
        else if (ev.tipo === 'extraer' || ev.tipo === 'aumentar') {
            agregar(clasesNodo, ev.nodo, 'activo');
        } else if (ev.tipo === 'fase_elegir') {
            for (const e of ev.elecciones) agregar(clasesArista, idArista(e.u, e.v), 'activa');
        }
    }
    return [clasesNodo, clasesArista, componentes];
}

function aplicarClases(elementos, clasesNodo, clasesArista, raiz = null) {
    return elementos.map((el) => {
        const nuevo = { ...el, data: { ...el.data } };
        // Une las clases que ya trae el elemento con las de estado.
        const clases = new Set((el.classes || '').split(' ').filter(Boolean));
        if ('source' in nuevo.data) {
            (clasesArista.get(nuevo.data.id) || []).forEach((c) => clases.add(c));
        } else {
            (clasesNodo.get(nuevo.data.id) || []).forEach((c) => clases.add(c));
            if (raiz !== null && nuevo.data.id === String(raiz)) clases.add('raiz');
        }
        nuevo.classes = [...clases].sort().join(' ');
        return nuevo;
    });
}

/* Aristas de F y su peso en `pasoActual`. */
function calcularSolucion(traza, pasoActual) {
    const aristas = [];
    let peso = 0;
    const tope = traza.length ? Math.max(0, Math.min(pasoActual, traza.length - 1)) : -1;
    for (let i = 0; i <= tope; i++) {
        const ev = traza[i];
        if (ev.tipo === 'iteracion') {
            if (ev.aceptada) { aristas.push([ev.u, ev.v]); peso += ev.peso; }
        } else if (ev.tipo === 'extraer' && ev.arista) {
            aristas.push(ev.arista); peso += ev.peso;
        } else if (ev.tipo === 'fase_unir') {
            for (const [u, v, w] of ev.aristas) { aristas.push([u, v]); peso += w; }
        }
    }
    return { aristas, peso };
}

/* Estado de los vectores D y Π en `pasoActual`, reconstruido desde la traza.
 *
 * Solo Jarník–Prim los mantiene, y en dos pasos: `extraer` fija la casilla del
 * nodo que sale de la cola y `aumentar` las de sus vecinos. Los eventos guardan
 * los cambios, no una copia de los vectores, de modo que se reproducen en
 * orden.
 *
 * `cerrados` son los nodos que ya salieron de la cola, es decir U. `activo` es
 * el nodo de este paso y `actualizados` aquellos cuya casilla cambió en él.
 *
 * `inicializado` indica si la línea que asigna los valores iniciales ya se
 * ejecutó. Las casillas van vacías hasta entonces, de modo que ese paso también
 * se ve. */
function calcularVectores(traza, pasoActual, ids) {
    if (!traza || !traza.length) return null;
    const D = new Map(ids.map((v) => [v, Infinity]));
    const Pi = new Map(ids.map((v) => [v, null]));
    const cerrados = new Set();
    let inicializado = false, activo = null;
    let actualizados = new Set();

    const tope = Math.max(0, Math.min(pasoActual, traza.length - 1));
    for (let i = 0; i <= tope; i++) {
        const ev = traza[i];
        if (ev.tipo === 'inicializar') { inicializado = true; }
        else if (ev.tipo === 'extraer') {
            D.set(ev.nodo, ev.dist);
            Pi.set(ev.nodo, ev.padre);
            cerrados.add(ev.nodo);
        } else if (ev.tipo === 'aumentar') {
            for (const a of ev.actualizadas) { D.set(a.nodo, a.dist); Pi.set(a.nodo, a.padre); }
        }
    }
    const ev = traza[tope];
    if (ev.tipo === 'extraer') activo = ev.nodo;
    else if (ev.tipo === 'aumentar') {
        activo = ev.nodo;
        actualizados = new Set(ev.actualizadas.map((a) => a.nodo));
    }
    return { D, Pi, cerrados, activo, actualizados, inicializado };
}

/* Lista ordenada de aristas con lo que Kruskal decidió sobre cada una.
 *
 * Devuelve null si el algoritmo no recorre una lista ordenada. `estado` es
 * 'pendiente', 'aceptada' o 'rechazada'; `actual` es la que decide este paso. */
function calcularAristas(traza, pasoActual) {
    if (!traza || !traza.length) return null;
    const inicio = traza.find((ev) => ev.tipo === 'inicializar' && Array.isArray(ev.orden));
    if (!inicio) return null;
    const filas = inicio.orden.map(([u, v]) => ({ u, v, estado: 'pendiente' }));
    const indice = new Map(filas.map((f, i) => [idArista(f.u, f.v), i]));

    const tope = Math.max(0, Math.min(pasoActual, traza.length - 1));
    let actual = null;
    for (let i = 0; i <= tope; i++) {
        const ev = traza[i];
        if (ev.tipo !== 'iteracion') continue;
        const j = indice.get(idArista(ev.u, ev.v));
        if (j === undefined) continue;
        filas[j].estado = ev.aceptada ? 'aceptada' : 'rechazada';
        actual = j;
    }
    if (traza[tope].tipo !== 'iteracion') actual = null;
    return { filas, actual };
}

/* Arista mínima que eligió cada componente en la fase en curso.
 *
 * Devuelve null si el algoritmo no trabaja por fases. Las elecciones se borran
 * al empezar cada fase: son las de la fase actual, no las acumuladas. */
function calcularComponentesFase(traza, pasoActual) {
    if (!traza || !traza.length) return null;
    if (!traza.some((ev) => ev.tipo === 'fase_elegir')) return null;
    let elecciones = new Map();  // representante -> {u, v, peso}
    const tope = Math.max(0, Math.min(pasoActual, traza.length - 1));
    for (let i = 0; i <= tope; i++) {
        const ev = traza[i];
        if (ev.tipo !== 'fase_elegir') continue;
        elecciones = new Map(ev.elecciones.map((e) => [e.componente, e]));
    }
    return { elecciones };
}

/* Estado del contador de fases en `pasoActual`. Devuelve null si el algoritmo
 * no trabaja por fases. Solo Borůvka las emite. */
function calcularFase(traza, pasoActual) {
    if (!traza || !traza.length) return null;
    const total = traza.filter((ev) => ev.tipo === 'fase_elegir').length;
    if (!total) return null;
    const tope = Math.max(0, Math.min(pasoActual, traza.length - 1));
    let fase = 0, componentes = null, terminado = false;
    for (let i = 0; i <= tope; i++) {
        const ev = traza[i];
        if (ev.tipo === 'fase_elegir') { fase = ev.fase; componentes = ev.componentes; }
        else if (ev.tipo === 'fin') terminado = true;
    }
    return { fase, total, componentes, terminado };
}

function textoFase(estado) {
    if (estado === null) return '';
    if (estado.terminado) return `Fases: ${estado.total} de ${estado.total}. Completadas.`;
    if (estado.fase === 0) return `Fase 0 de ${estado.total}. El ciclo no ha comenzado.`;
    return `Fase ${estado.fase} de ${estado.total}. Al empezar había ${estado.componentes} componentes.`;
}

function aplicarDistancias(elementos, distancias) {
    return elementos.map((el) => {
        if ('source' in el.data) return el;
        const nuevo = { ...el, data: { ...el.data } };
        const v = distancias.get(nuevo.data.id);
        const texto = (v === undefined || v === Infinity) ? '∞' : String(v);
        nuevo.data.dist = texto;
        // El prefijo 'D=' identifica el renglón.
        nuevo.data.label = `${nuevo.data.label}\nD=${texto}`;
        const clases = new Set((el.classes || '').split(' ').filter(Boolean));
        clases.add('con_distancia');
        nuevo.classes = [...clases].sort().join(' ');
        return nuevo;
    });
}

/* Texto de las componentes de (V, F), en el formato de las láminas. */
function textoComponentes(mapa) {
    const grupos = agruparComponentes(mapa);
    const partes = grupos.map(([, nodos]) => `{${nodos.join(', ')}}`);
    const plural = grupos.length === 1 ? 'componente' : 'componentes';
    return `${grupos.length} ${plural}: ${partes.join(', ')}`;
}

/* Qué hizo el bloque que corresponde a este paso.
 *
 * El tipo de evento nombra el bloque, pero no qué nodos y aristas tocó, que es
 * lo que hace falta para seguir la animación. */
function textoDelPaso(ev) {
    switch (ev.tipo) {
        case 'inicializar':
            return 'valores iniciales';
        case 'iteracion':
            return `iteración ${ev.n}: ${ev.u} — ${ev.v} (${ev.peso}), `
                + (ev.aceptada ? 'aceptada' : 'rechazada, cerraría un ciclo');
        case 'extraer':
            return `iteración ${ev.n}, extraer mínimo: sale ${ev.nodo} de Q`
                + (ev.arista ? `, entra ${nombreArista(...ev.arista)} en F` : ' (es la raíz)');
        case 'aumentar': {
            if (!ev.exploradas.length) {
                return `iteración ${ev.n}, aumentar: ${ev.nodo} no tiene vecinos en Q`;
            }
            const n = ev.actualizadas.length, m = ev.exploradas.length;
            return `iteración ${ev.n}, aumentar: se ${m === 1 ? 'revisa 1 arista' : `revisan ${m} aristas`} `
                + `de ${ev.nodo} hacia Q, ` + (n === 0 ? 'ninguna casilla cambia'
                    : `${n} ${n === 1 ? 'casilla cambia' : 'casillas cambian'}`);
        }
        case 'fase_elegir':
            return `fase ${ev.fase}: las ${ev.componentes} componentes eligen su arista mínima`;
        case 'fase_unir':
            return `fase ${ev.fase}: F ← F ∪ Aux, entran ${ev.aristas.length} `
                + (ev.aristas.length === 1 ? 'arista' : 'aristas');
        case 'fin':
            return `fin: ${ev.aristas.length} aristas, peso ${ev.peso}`;
        default:
            return ev.tipo;
    }
}
