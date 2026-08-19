/* Convierte (grafo, traza, paso actual) en elementos de Cytoscape.
 *
 * Port de viz/. Es la única capa que conoce a la vez el formato de la traza y
 * el de Cytoscape. Los algoritmos no dependen de ella.
 */

const COLORES = {
    base: '#b0bec5', base_borde: '#78909c',
    visitado: '#90caf9', visitado_borde: '#42a5f5',
    finalizado: '#5c6bc0', finalizado_borde: '#3949ab',
    solucion: '#66bb6a', solucion_borde: '#2e7d32',
    ciclo_negativo: '#ef5350', ciclo_negativo_borde: '#b71c1c',
    activo: '#ffb74d', activo_borde: '#e65100',
    origen_borde: '#f57f17',
};

// La leyenda de la interfaz se construye a partir de estos valores.
const ESTADOS_LEYENDA = [
    ['Sin visitar', 'Todavía no alcanzado', COLORES.base, COLORES.base_borde],
    ['Origen', 'Nodo de partida elegido', COLORES.base, COLORES.origen_borde],
    ['Visitado', 'Descubierto, aún puede mejorar', COLORES.visitado, COLORES.visitado_borde],
    ['Finalizado', 'Procesado por completo', COLORES.finalizado, COLORES.finalizado_borde],
    ['Activo', 'Lo que ocurre en este paso', COLORES.activo, COLORES.activo_borde],
    ['Solución', 'Parte del árbol de caminos', COLORES.solucion, COLORES.solucion_borde],
    ['Ciclo negativo', 'Sin distancia mínima definida', COLORES.ciclo_negativo, COLORES.ciclo_negativo_borde],
];

const ESTILOS = [
    { selector: 'node', style: {
        content: 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
        'background-color': COLORES.base, color: '#1a1a1a', 'font-size': '12px',
        width: '34px', height: '34px', 'border-width': '2px', 'border-color': COLORES.base_borde } },
    { selector: 'edge', style: {
        content: 'data(label)', 'curve-style': 'bezier', 'line-color': COLORES.base,
        'target-arrow-color': COLORES.base, 'target-arrow-shape': 'triangle', width: 2,
        'font-size': '10px', color: '#546e7a', 'text-background-color': '#ffffff',
        'text-background-opacity': 1, 'text-background-padding': '1px' } },
    { selector: 'edge.no_dirigido', style: { 'target-arrow-shape': 'none', 'source-arrow-shape': 'none' } },
    { selector: 'node.visitado', style: {
        'background-color': COLORES.visitado, 'border-color': COLORES.visitado_borde } },
    { selector: 'node.finalizado', style: {
        'background-color': COLORES.finalizado, 'border-color': COLORES.finalizado_borde, color: '#fff' } },
    { selector: 'node.solucion', style: {
        'background-color': COLORES.solucion, 'border-color': COLORES.solucion_borde, color: '#fff' } },
    { selector: 'node.ciclo_negativo', style: {
        'background-color': COLORES.ciclo_negativo, 'border-color': COLORES.ciclo_negativo_borde, color: '#fff' } },
    { selector: 'node.origen', style: {
        'border-width': '4px', 'border-color': COLORES.origen_borde, 'border-style': 'double' } },
    { selector: 'node.activo', style: {
        'background-color': COLORES.activo, 'border-color': COLORES.activo_borde, 'border-width': '4px' } },
    { selector: 'edge.solucion', style: {
        'line-color': COLORES.solucion_borde, 'target-arrow-color': COLORES.solucion_borde, width: 4 } },
    { selector: 'edge.activo', style: {
        'line-color': COLORES.activo_borde, 'target-arrow-color': COLORES.activo_borde, width: 4 } },
    /* Cytoscape.js admite una sola etiqueta por elemento. El nombre del nodo y
     * la distancia son los dos renglones de un mismo texto, situado bajo el
     * nodo, y comparten color.
     *
     * Esta regla debe declararse después de las de estado, que fijan texto
     * blanco para los nodos oscuros. Aquí el texto va sobre el fondo del
     * lienzo. */
    { selector: 'node.con_distancia', style: {
        'text-wrap': 'wrap', 'line-height': 1.15, 'text-valign': 'bottom',
        'text-halign': 'center', 'text-margin-y': '4px', 'font-size': '11px',
        color: '#263238', 'text-background-color': '#ffffff',
        'text-background-opacity': 0.85, 'text-background-padding': '2px',
        'text-background-shape': 'roundrectangle' } },
];

/* Identificador estable de arista. No depende del orden en que el algoritmo
 * recorra sus extremos, lo que es necesario en grafos no dirigidos. */
function idArista(u, v, dirigido) {
    return dirigido ? `${u}__${v}` : [String(u), String(v)].sort().join('__');
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
                id: idArista(origen, destino, G.dirigido),
                source: origen, target: destino,
                label: peso === undefined || peso === null ? '' : String(peso),
            },
            classes: G.dirigido ? '' : 'no_dirigido',
        });
    }
    return elementos;
}

const EVENTOS_PERSISTENTES_NODO = {
    visitar_nodo: 'visitado',
    nodo_finalizado: 'finalizado',
    ciclo_negativo: 'ciclo_negativo',
};
const EVENTOS_TRANSITORIOS_ARISTA = new Set(['explorar_arista', 'relajar', 'descartar_arista']);

function calcularEstado(traza, pasoActual, dirigido) {
    const clasesNodo = new Map(), clasesArista = new Map();
    const agregar = (m, k, c) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(c); };
    const tope = traza.length ? Math.max(0, Math.min(pasoActual, traza.length - 1)) : -1;

    for (let i = 0; i <= tope; i++) {
        const ev = traza[i];
        if (EVENTOS_PERSISTENTES_NODO[ev.tipo]) {
            agregar(clasesNodo, ev.nodo, EVENTOS_PERSISTENTES_NODO[ev.tipo]);
        } else if (ev.tipo === 'arista_solucion') {
            agregar(clasesArista, idArista(ev.u, ev.v, dirigido), 'solucion');
            agregar(clasesNodo, ev.v, 'solucion');
        }
    }
    if (tope >= 0 && tope < traza.length) {
        const ev = traza[tope];
        if (EVENTOS_TRANSITORIOS_ARISTA.has(ev.tipo)) {
            agregar(clasesArista, idArista(ev.u, ev.v, dirigido), 'activo');
            agregar(clasesNodo, ev.u, 'activo');
            agregar(clasesNodo, ev.v, 'activo');
        } else if (ev.tipo === 'procesar_nodo') {
            agregar(clasesNodo, ev.nodo, 'activo');
        }
    }
    return [clasesNodo, clasesArista];
}

function aplicarClases(elementos, clasesNodo, clasesArista, origen = null) {
    return elementos.map((el) => {
        const nuevo = { ...el, data: { ...el.data } };
        // Une las clases estructurales, como 'no_dirigido', con las de estado.
        const clases = new Set((el.classes || '').split(' ').filter(Boolean));
        if ('source' in nuevo.data) {
            (clasesArista.get(nuevo.data.id) || []).forEach((c) => clases.add(c));
        } else {
            (clasesNodo.get(nuevo.data.id) || []).forEach((c) => clases.add(c));
            if (origen !== null && nuevo.data.id === String(origen)) clases.add('origen');
        }
        nuevo.classes = [...clases].sort().join(' ');
        return nuevo;
    });
}

/* Reconstruye la distancia conocida de cada nodo en `pasoActual`. Devuelve
 * null si la traza no contiene ninguna, que es el caso de DFS. La etiqueta
 * secundaria aparece solo en los algoritmos que calculan distancias. */
function calcularDistancias(traza, pasoActual) {
    if (!traza || !traza.length) return null;
    const distancias = new Map();
    let hubo = false;
    const tope = Math.max(0, Math.min(pasoActual, traza.length - 1));
    for (let i = 0; i <= tope; i++) {
        const ev = traza[i];
        if ('dist' in ev && 'nodo' in ev) { distancias.set(ev.nodo, ev.dist); hubo = true; }
        else if (ev.tipo === 'relajar' && 'nueva_dist' in ev) { distancias.set(ev.v, ev.nueva_dist); hubo = true; }
    }
    if (!hubo) {
        // El algoritmo puede calcular distancias y no haber emitido ninguna
        // en los primeros pasos, de modo que se examina la traza completa.
        const lleva = traza.some((ev) => 'dist' in ev || (ev.tipo === 'relajar' && 'nueva_dist' in ev));
        if (!lleva) return null;
    }
    return distancias;
}

/* Estado del contador de iteraciones en `pasoActual`. Devuelve null si el
 * algoritmo no trabaja por iteraciones. Solo Bellman-Ford las emite. */
function calcularIteracion(traza, pasoActual) {
    if (!traza || !traza.length) return null;
    const tope = Math.max(0, Math.min(pasoActual, traza.length - 1));
    let estado = null;
    for (let i = 0; i <= tope; i++) {
        const ev = traza[i];
        if (ev.tipo === 'inicio_iteracion') {
            estado = { iteracion: ev.iteracion, total: ev.total_iteraciones,
                       terminado: false, anticipado: false };
        } else if (ev.tipo === 'fin_iteraciones') {
            estado = { iteracion: ev.iteracion, total: ev.total_iteraciones,
                       terminado: true, anticipado: Boolean(ev.anticipado) };
        }
    }
    if (estado === null) {
        // El algoritmo puede iterar y no haber empezado la primera pasada, de
        // modo que se examina la traza completa.
        const primera = traza.find((ev) => ev.tipo === 'inicio_iteracion');
        if (!primera) return null;
        return { iteracion: 0, total: primera.total_iteraciones,
                 terminado: false, anticipado: false };
    }
    return estado;
}

function textoIteracion(estado) {
    if (estado === null) return '';
    if (estado.terminado) {
        return estado.anticipado
            ? `Iteraciones: ${estado.iteracion} de ${estado.total}. Terminó antes por una pasada sin cambios.`
            : `Iteraciones: ${estado.iteracion} de ${estado.total}. Completadas.`;
    }
    if (estado.iteracion === 0) return `Iteración 0 de ${estado.total}. El bucle no ha comenzado.`;
    return `Iteración ${estado.iteracion} de ${estado.total}`;
}

function aplicarDistancias(elementos, distancias) {
    return elementos.map((el) => {
        if ('source' in el.data) return el;
        const nuevo = { ...el, data: { ...el.data } };
        const v = distancias.get(nuevo.data.id);
        const texto = (v === undefined || v === Infinity) ? '∞' : String(v);
        nuevo.data.dist = texto;
        // El prefijo 'd=' identifica el renglón.
        nuevo.data.label = `${nuevo.data.label}\nd=${texto}`;
        const clases = new Set((el.classes || '').split(' ').filter(Boolean));
        clases.add('con_distancia');
        nuevo.classes = [...clases].sort().join(' ');
        return nuevo;
    });
}
