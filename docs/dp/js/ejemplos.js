/* Instancias de ejemplo. Todas son digrafos; los loops de largo 0 los añade
 * Digrafo.agregarLoops y no se declaran aquí. */

const ESCALA = 700;

function _ciclo4() {
    const G = new Digrafo();
    const pos = { '1': [140, 140], '2': [420, 140], '3': [420, 400], '4': [140, 400] };
    for (const [id, p] of Object.entries(pos)) G.agregarNodo(id, { pos: p });
    [['1', '2', 3], ['2', '3', 2], ['3', '4', 1], ['4', '1', 4], ['1', '3', 9]]
        .forEach(([u, v, l]) => G.agregarArco(u, v, l));
    return G.agregarLoops();
}

function _pesosNegativos() {
    const G = new Digrafo();
    const pos = { 's': [90, 270], 'a': [280, 130], 'b': [280, 410], 'c': [470, 270], 't': [650, 270] };
    for (const [id, p] of Object.entries(pos)) G.agregarNodo(id, { pos: p });
    [['s', 'a', 4], ['s', 'b', 2], ['a', 'c', -3], ['b', 'c', 3],
     ['c', 't', 2], ['b', 'a', 1], ['t', 'c', -3]]
        .forEach(([u, v, l]) => G.agregarArco(u, v, l));
    return G.agregarLoops();
}

function _cicloNegativo() {
    const G = new Digrafo();
    const pos = { 's': [90, 270], 'x': [300, 140], 'y': [500, 270], 'z': [300, 400] };
    for (const [id, p] of Object.entries(pos)) G.agregarNodo(id, { pos: p });
    [['s', 'x', 2], ['x', 'y', 3], ['y', 'z', -6], ['z', 'x', 1], ['x', 'z', 4]]
        .forEach(([u, v, l]) => G.agregarArco(u, v, l));
    return G.agregarLoops();
}

function _camino5() {
    const G = new Digrafo();
    const ids = ['1', '2', '3', '4', '5'];
    ids.forEach((id, j) => G.agregarNodo(id, { pos: [90 + j * 145, 270] }));
    [['1', '2', 2], ['2', '3', 2], ['3', '4', 2], ['4', '5', 2], ['5', '1', 1]]
        .forEach(([u, v, l]) => G.agregarArco(u, v, l));
    return G.agregarLoops();
}

function _inalcanzable() {
    const G = new Digrafo();
    const pos = { 's': [120, 180], 'a': [340, 180], 'b': [560, 180], 'u': [340, 400], 'v': [560, 400] };
    for (const [id, p] of Object.entries(pos)) G.agregarNodo(id, { pos: p });
    [['s', 'a', 1], ['a', 'b', 1], ['u', 'v', 1], ['v', 'u', 1]]
        .forEach(([u, v, l]) => G.agregarArco(u, v, l));
    return G.agregarLoops();
}

const EJEMPLOS = {
    ciclo4: {
        nombre: 'Ciclo de 4 nodos',
        constructor: _ciclo4,
        origen: '1',
        k: 6,
        descripcion: 'Los loops permiten que T no aumente al avanzar de columna.',
    },
    negativos: {
        nombre: 'Pesos negativos',
        constructor: _pesosNegativos,
        origen: 's',
        k: 6,
        descripcion: 'El ciclo c → t → c tiene largo -1: T decrece cada dos columnas.',
    },
    ciclo_negativo: {
        nombre: 'Ciclo de largo negativo',
        constructor: _cicloNegativo,
        origen: 's',
        k: 8,
        descripcion: 'El ciclo x → y → z → x suma -2. Los valores decrecen sin cota al crecer k.',
    },
    camino5: {
        nombre: 'Camino dirigido de 5 nodos',
        constructor: _camino5,
        origen: '1',
        k: 6,
        descripcion: 'La columna i alcanza un nodo nuevo en cada paso.',
    },
    inalcanzable: {
        nombre: 'Nodos inalcanzables',
        constructor: _inalcanzable,
        origen: 's',
        k: 6,
        descripcion: 'Los nodos u y v no son alcanzables desde s. Su fila queda en +∞.',
    },
};

function construirEjemplo(clave) {
    if (!EJEMPLOS[clave]) throw new Error(`No existe la instancia de ejemplo '${clave}'.`);
    return EJEMPLOS[clave].constructor();
}
