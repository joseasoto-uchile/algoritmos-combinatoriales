/* Conversión del digrafo a elementos de Cytoscape y estados de dibujo.
 *
 * Es la única capa que conoce a la vez el formato de los eventos de la traza y
 * el de Cytoscape.
 *
 * Los colores son los de las diapositivas de la clase 04. */

const COLORES = {
    fondo: '#F8FAFC',
    texto: '#0F172A',
    azulOscuro: '#1E293B',
    azulMedio: '#2563EB',
    celeste: '#EFF6FF',
    verde: '#059669',
    verdeSuave: '#ECFDF5',
    naranja: '#DC2626',
    naranjaSuave: '#FEF2F2',
    gris: '#E2E8F0',
};

const ESTILOS = [
    { selector: 'node', style: {
        content: 'data(id)', 'text-valign': 'center', 'text-halign': 'center',
        'background-color': COLORES.celeste, 'border-color': COLORES.azulOscuro,
        'border-width': 2, color: COLORES.texto, 'font-size': '13px',
        width: '38px', height: '38px' } },
    { selector: 'edge', style: {
        content: 'data(etiqueta)', 'curve-style': 'bezier',
        'line-color': '#94A3B8', 'target-arrow-color': '#94A3B8',
        'target-arrow-shape': 'triangle', width: 1.6,
        'font-size': '11px', color: '#475569',
        'text-background-color': COLORES.fondo, 'text-background-opacity': 1,
        'text-background-padding': '2px' } },
    /* Los loops de largo 0 son parte del preprocesamiento, no de la instancia
     * que escribe el usuario. Se dibujan más tenues. */
    { selector: 'edge.loop', style: {
        'curve-style': 'bezier', 'loop-direction': '0deg', 'loop-sweep': '40deg',
        'line-color': COLORES.gris, 'target-arrow-color': COLORES.gris,
        'line-style': 'dashed', width: 1.2, color: '#94A3B8' } },
    { selector: 'node.origen', style: {
        'border-color': COLORES.verde, 'border-width': 4, 'background-color': COLORES.verdeSuave } },
    /* Nodo b cuya celda se está calculando. */
    { selector: 'node.destino', style: {
        'background-color': COLORES.verdeSuave, 'border-color': COLORES.verde, 'border-width': 4 } },
    /* Nodo a en N^-(b) que se examina en este paso. */
    { selector: 'node.predecesor', style: {
        'background-color': '#BFDBFE', 'border-color': COLORES.azulMedio, 'border-width': 3 } },
    /* Todos los elementos de N^-(b), al seleccionar una celda. */
    { selector: 'node.vecino', style: {
        'background-color': '#DBEAFE', 'border-color': COLORES.azulMedio, 'border-width': 3 } },
    { selector: 'edge.examinado', style: {
        'line-color': COLORES.azulMedio, 'target-arrow-color': COLORES.azulMedio, width: 3 } },
    { selector: 'edge.mejora', style: {
        'line-color': COLORES.verde, 'target-arrow-color': COLORES.verde, width: 3.5 } },
    { selector: 'edge.descartado', style: {
        'line-color': COLORES.naranja, 'target-arrow-color': COLORES.naranja, width: 2.5,
        'line-style': 'dotted' } },
    { selector: 'edge.vecino', style: {
        'line-color': COLORES.azulMedio, 'target-arrow-color': COLORES.azulMedio, width: 2.5 } },
    { selector: 'edge.paseo', style: {
        'line-color': COLORES.verde, 'target-arrow-color': COLORES.verde, width: 4 } },
    { selector: 'node.paseo', style: {
        'background-color': COLORES.verdeSuave, 'border-color': COLORES.verde, 'border-width': 3 } },
];

function idArco(u, v) { return `${u}__${v}`; }

function digrafoAElementos(G, incluirPosiciones = true) {
    const elementos = [];
    for (const nodo of G.nodos.values()) {
        const el = { data: { id: nodo.id } };
        if (incluirPosiciones && nodo.pos) el.position = { x: nodo.pos[0], y: nodo.pos[1] };
        elementos.push(el);
    }
    for (const arco of G.arcos.values()) {
        const esLoop = arco.origen === arco.destino;
        elementos.push({
            data: {
                id: idArco(arco.origen, arco.destino),
                source: arco.origen, target: arco.destino,
                etiqueta: String(arco.largo),
            },
            classes: esLoop ? 'loop' : '',
        });
    }
    return elementos;
}

/* Clases de dibujo que corresponden al evento en `pasoActual`. Solo dependen
 * de ese evento: el estado acumulado vive en la tabla, no en el grafo. */
function clasesPaso(traza, pasoActual, origen) {
    const clasesNodo = new Map(), clasesArco = new Map();
    const agregar = (m, k, c) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(c); };
    if (origen) agregar(clasesNodo, String(origen), 'origen');
    if (!traza || !traza.length) return [clasesNodo, clasesArco];

    const ev = traza[Math.max(0, Math.min(pasoActual, traza.length - 1))];
    if (ev.nodo !== undefined && ev.tipo !== 'caso_base') agregar(clasesNodo, ev.nodo, 'destino');
    if (ev.a !== undefined) {
        agregar(clasesNodo, ev.a, 'predecesor');
        const clase = ev.tipo === 'mejorar' ? 'mejora'
            : ev.tipo === 'descartar' ? 'descartado' : 'examinado';
        agregar(clasesArco, idArco(ev.a, ev.nodo), clase);
    }
    return [clasesNodo, clasesArco];
}

/* Clases para la selección manual de una celda: marca N^-(b) completo. */
function clasesSeleccion(G, nodo) {
    const clasesNodo = new Map(), clasesArco = new Map();
    const agregar = (m, k, c) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(c); };
    agregar(clasesNodo, nodo, 'destino');
    for (const arco of G.entrantes(nodo)) {
        agregar(clasesNodo, arco.origen, 'vecino');
        agregar(clasesArco, idArco(arco.origen, nodo), 'vecino');
    }
    return [clasesNodo, clasesArco];
}

function aplicarClases(cy, clasesNodo, clasesArco) {
    cy.batch(() => {
        cy.nodes().forEach((n) => {
            const c = [...(clasesNodo.get(n.id()) || [])];
            n.classes(c.join(' '));
        });
        cy.edges().forEach((e) => {
            const base = e.data('source') === e.data('target') ? ['loop'] : [];
            const c = [...base, ...(clasesArco.get(e.id()) || [])];
            e.classes(c.join(' '));
        });
    });
}

/* Texto de una celda de T. */
function textoValor(v) {
    if (v === Infinity) return '∞';
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}
