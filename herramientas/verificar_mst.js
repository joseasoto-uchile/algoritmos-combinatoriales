/* Comprobación cruzada de los tres algoritmos de MST.
 *
 * Los tres deben devolver el mismo peso total sobre toda instancia y, sobre
 * instancias de pesos distintos, además el mismo conjunto de aristas, porque
 * ahí el árbol de expansión mínima es único.
 *
 * Se compara también contra un Kruskal de referencia escrito en este archivo,
 * que no comparte código con la aplicación: sin él, un mismo error en las tres
 * implementaciones pasaría inadvertido.
 *
 *   node herramientas/verificar_mst.js [instancias aleatorias]
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'docs', 'mst', 'js');
const fuente = ['grafo.js', 'algoritmos.js']
    .map((f) => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');

const clave = (u, v) => (String(u) < String(v) ? `${u}|${v}` : `${v}|${u}`);
const conjunto = (pares) => new Set(pares.map(([u, v]) => clave(u, v)));
const iguales = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

/* MST de referencia: Kruskal con union-find sin compresión, escrito aparte. */
function referencia(G) {
    const padre = new Map(G.ids.map((v) => [v, v]));
    const buscar = (v) => { while (padre.get(v) !== v) v = padre.get(v); return v; };
    const aristas = G.aristas.map((a, i) => [a.peso, i, a.origen, a.destino])
        .sort((x, y) => (x[0] - y[0]) || (x[1] - y[1]));
    let peso = 0;
    const T = [];
    for (const [w, , u, v] of aristas) {
        const a = buscar(u), b = buscar(v);
        if (a === b) continue;
        padre.set(a, b); peso += w; T.push([u, v]);
    }
    return { peso, T: conjunto(T) };
}

const CUERPO = `
const pesosDistintos = (G) => new Set(G.aristas.map((a) => a.peso)).size === G.aristas.length;
let casos = 0, fallos = 0;

function probar(nombre, G) {
    casos++;
    const ref = referencia(G);
    const res = {
        prim: primTraza(G, G.ids[0])[0],
        kruskal: kruskalTraza(G)[0],
        boruvka: boruvkaTraza(G)[0],
    };
    const errores = [];
    for (const [k, r] of Object.entries(res)) {
        if (r.peso !== ref.peso) errores.push(k + ': peso ' + r.peso + ' != ' + ref.peso);
        if (r.aristas.length !== G.ids.length - 1) {
            errores.push(k + ': ' + r.aristas.length + ' aristas, se esperaban ' + (G.ids.length - 1));
        }
        const T = conjunto(r.aristas);
        if (T.size !== r.aristas.length) errores.push(k + ': arista repetida en el árbol');
        if (pesosDistintos(G) && !iguales(T, ref.T)) {
            errores.push(k + ': con pesos distintos el árbol es único y este difiere');
        }
    }
    // Jarník-Prim desde cualquier raíz debe dar el mismo peso.
    for (const r of G.ids) {
        const p = primTraza(G, r)[0].peso;
        if (p !== ref.peso) errores.push('prim desde ' + r + ': peso ' + p + ' != ' + ref.peso);
    }
    if (errores.length) {
        fallos++;
        console.log('FALLA ' + nombre);
        for (const e of errores) console.log('  ' + e);
    }
}

for (const [k, e] of Object.entries(EJEMPLOS)) probar('ejemplo ' + k, e.constructor());

for (let s = 0; s < N; s++) {
    const G = generarAleatorio({
        n: 2 + (s % 15), densidad: (s % 10) / 10, semilla: s,
        permitirNegativos: s % 4 === 0, pesoMax: s % 3 === 0 ? 3 : 20,
    });
    if (!G.esConexo()) { console.log('FALLA generador: grafo no conexo, semilla ' + s); fallos++; }
    probar('aleatorio semilla ' + s, G);
}

// La instancia de la clase tiene una respuesta conocida.
const clase = construirEjemplo('clase');
const esperado = conjunto([['a','b'],['b','c'],['d','e'],['f','g'],['c','e'],['e','g']]);
for (const [k, f] of [['prim', () => primTraza(clase, 'a')[0]],
                      ['kruskal', () => kruskalTraza(clase)[0]],
                      ['boruvka', () => boruvkaTraza(clase)[0]]]) {
    const r = f();
    const ok = r.peso === 24 && iguales(conjunto(r.aristas), esperado);
    console.log('instancia de la clase, ' + k + ': peso ' + r.peso + ', árbol ' + (ok ? 'correcto' : 'INCORRECTO'));
    if (!ok) fallos++;
}
console.log('');
console.log(casos + ' instancias, ' + fallos + ' fallos');
resultado = fallos;
`;

const N = Number(process.argv[2] || 500);
let resultado = 0;
// eslint-disable-next-line no-eval
eval(fuente + CUERPO);
process.exit(resultado === 0 ? 0 : 1);
