/* Algoritmo 2 (programación dinámica por tabulación) y Algoritmo 3
 * (reconstrucción del paseo), de la clase 04.
 *
 * T[b][i] = d_i(s,b) es el largo del paseo mínimo de exactamente i arcos entre
 * s y b. Pi[b][i] es un penúltimo nodo de algún paseo óptimo, o null.
 *
 * Cada paso emite un evento. El campo "linea" indica la línea del pseudocódigo
 * que aparece en PSEUDOCODIGO, o la lista de líneas si el paso ejecuta varias.
 * Todos los eventos lo llevan: un paso sin línea deja el pseudocódigo apagado.
 */

const PSEUDOCODIGO = [
    'Entrada: G = (V,E) con loops, ℓ, s y k',
    'para b ∈ V, 0 ≤ i ≤ k:',
    '    T[b,i] ← +∞;  Π[b,i] ← ⊥',
    'T[s,0] ← 0',
    'para i = 1, …, k:',
    '    para b ∈ V:',
    '        para a ∈ N⁻(b):',
    '            si T[a,i-1] + ℓ(a,b) < T[b,i]:',
    '                T[b,i] ← T[a,i-1] + ℓ(a,b)',
    '                Π[b,i] ← a',
    'devolver (T, Π)',
];

class ConstructorTraza {
    constructor() { this.traza = []; this.paso = 0; }
    emitir(tipo, datos = {}) {
        this.paso += 1;
        this.traza.push({ tipo, paso: this.paso, ...datos });
    }
}

function programacionDinamica(G, s, k) {
    if (!G.nodos.has(s)) throw new Error(`El nodo origen "${s}" no existe.`);
    if (!Number.isInteger(k) || k < 0) throw new Error('k debe ser un entero mayor o igual que 0.');

    const tb = new ConstructorTraza();
    const ids = G.ids;
    const T = {}, Pi = {};
    for (const b of ids) {
        T[b] = new Array(k + 1).fill(Infinity);
        Pi[b] = new Array(k + 1).fill(null);
    }
    tb.emitir('inicializar', { linea: [2, 3] });

    T[s][0] = 0;
    tb.emitir('caso_base', { nodo: s, columna: 0, valor: 0, linea: 4 });

    for (let i = 1; i <= k; i++) {
        tb.emitir('inicio_columna', { columna: i, total: k, linea: 5 });
        for (const b of ids) {
            tb.emitir('inicio_celda', { nodo: b, columna: i, linea: 6 });
            for (const arco of G.entrantes(b)) {
                const a = arco.origen;
                const previo = T[a][i - 1];
                const candidato = previo === Infinity ? Infinity : previo + arco.largo;
                tb.emitir('examinar', {
                    a, nodo: b, columna: i, largo: arco.largo,
                    previo, candidato, actual: T[b][i], linea: [7, 8],
                });
                if (candidato < T[b][i]) {
                    T[b][i] = candidato;
                    Pi[b][i] = a;
                    tb.emitir('mejorar', { a, nodo: b, columna: i, valor: candidato, linea: [9, 10] });
                } else {
                    tb.emitir('descartar', { a, nodo: b, columna: i, candidato, linea: 8 });
                }
            }
            tb.emitir('fin_celda', { nodo: b, columna: i, valor: T[b][i], pi: Pi[b][i], linea: 6 });
        }
        tb.emitir('fin_columna', { columna: i, total: k, linea: 5 });
    }

    tb.emitir('fin', { linea: 11 });
    return { T, Pi, traza: tb.traza };
}

/* Algoritmo 3. Devuelve la sucesión de nodos del paseo de k arcos, o null si
 * no existe paseo de esa longitud entre s y t. */
function reconstruirPaseo(T, Pi, t, k) {
    if (T[t] === undefined || T[t][k] === Infinity) return null;
    const W = [t];
    let b = t;
    for (let j = k; j >= 1; j--) {
        const a = Pi[b][j];
        if (a === null) return null;
        W.unshift(a);
        b = a;
    }
    return W;
}

/* Reconstruye T y Pi tal como estaban en `pasoActual`, reproduciendo los
 * eventos en orden. La traza guarda los cambios, no las tablas. */
function estadoTablas(traza, pasoActual, ids, k) {
    const T = {}, Pi = {};
    for (const b of ids) {
        T[b] = new Array(k + 1).fill(Infinity);
        Pi[b] = new Array(k + 1).fill(null);
    }
    // La primera linea del algoritmo asigna +infinito a toda la tabla y el
    // simbolo de indefinido a todo Pi. A partir de ese evento las dos tablas
    // se muestran completas.
    let inicializado = false;
    // Celdas cuyo valor ya es definitivo, en formato "nodo|columna". Se
    // distinguen de las que siguen en su valor inicial, que tambien es
    // +infinito.
    const calculadas = new Set();
    const tope = Math.max(0, Math.min(pasoActual, traza.length - 1));
    for (let p = 0; p <= tope; p++) {
        const ev = traza[p];
        if (ev.tipo === 'inicializar') {
            inicializado = true;
        } else if (ev.tipo === 'caso_base') {
            T[ev.nodo][ev.columna] = ev.valor;
            for (const b of ids) calculadas.add(b + '|0');
        } else if (ev.tipo === 'mejorar') {
            T[ev.nodo][ev.columna] = ev.valor;
            Pi[ev.nodo][ev.columna] = ev.a;
        } else if (ev.tipo === 'fin_celda') {
            calculadas.add(ev.nodo + '|' + ev.columna);
        }
    }
    return { T, Pi, calculadas, inicializado };
}

/* Columna que el algoritmo está calculando en `pasoActual`, o 0 si aún no ha
 * empezado el bucle principal. */
function columnaActual(traza, pasoActual) {
    const tope = Math.max(0, Math.min(pasoActual, traza.length - 1));
    let col = 0;
    for (let p = 0; p <= tope; p++) {
        const ev = traza[p];
        if (ev.columna !== undefined) col = ev.columna;
    }
    return col;
}
