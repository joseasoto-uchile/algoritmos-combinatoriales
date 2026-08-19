/* Modelo de digrafo con largos para el algoritmo de programación dinámica.
 *
 * El algoritmo supone que todo nodo tiene un loop de largo 0. Con esa
 * hipótesis, un paseo de a lo más k arcos equivale a uno de exactamente k
 * arcos, que es lo que calcula la tabla T.
 *
 * No se admiten arcos paralelos. Si el mismo par aparece dos veces, se
 * conserva el de menor largo, que es el preprocesamiento descrito en la clase.
 */

const LARGO_LOOP = 0;

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
        entero: (min, max) => min + Math.floor(siguiente() * (max - min + 1)),
        elegir: (arr) => arr[Math.floor(siguiente() * arr.length)],
    };
}

class Digrafo {
    constructor() {
        this.nodos = new Map();   // id -> {id, pos:[x,y]}
        this.arcos = new Map();   // "u>v" -> {origen, destino, largo}
        this._entrantes = null;
    }

    agregarNodo(id, datos = {}) {
        this.nodos.set(String(id), { id: String(id), ...datos });
        this._entrantes = null;
    }

    /* Inserta el arco. Si ya existe, conserva el de menor largo. */
    agregarArco(u, v, largo) {
        const clave = `${u}>${v}`;
        const previo = this.arcos.get(clave);
        if (previo === undefined || largo < previo.largo) {
            this.arcos.set(clave, { origen: String(u), destino: String(v), largo });
        }
        this._entrantes = null;
    }

    get ids() { return [...this.nodos.keys()]; }

    /* Añade el loop de largo 0 a los nodos que no lo tienen. */
    agregarLoops() {
        for (const id of this.nodos.keys()) {
            if (!this.arcos.has(`${id}>${id}`)) this.agregarArco(id, id, LARGO_LOOP);
        }
        return this;
    }

    /* N^-(b): lista de arcos que entran a b, en orden de identificador. */
    entrantes(b) {
        if (!this._entrantes) {
            const m = new Map([...this.nodos.keys()].map((n) => [n, []]));
            for (const arco of this.arcos.values()) m.get(arco.destino).push(arco);
            for (const lista of m.values()) {
                lista.sort((x, y) => x.origen.localeCompare(y.origen, 'en', { numeric: true }));
            }
            this._entrantes = m;
        }
        return this._entrantes.get(b) || [];
    }

    largo(u, v) {
        const arco = this.arcos.get(`${u}>${v}`);
        return arco === undefined ? Infinity : arco.largo;
    }

    aObjeto() {
        return {
            nodos: [...this.nodos.values()],
            arcos: [...this.arcos.values()],
        };
    }

    static desdeObjeto(datos) {
        validarDatos(datos);
        const G = new Digrafo();
        for (const n of datos.nodos) G.agregarNodo(n.id, { pos: n.pos });
        for (const a of datos.arcos) G.agregarArco(a.origen, a.destino, a.largo);
        return G.agregarLoops();
    }
}

/* Rechaza un objeto que no cumple el formato. Se informa el primer problema. */
function validarDatos(datos) {
    if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
        throw new Error('JSON inválido: el contenido debe ser un objeto.');
    }
    for (const clave of ['nodos', 'arcos']) {
        if (!(clave in datos)) throw new Error(`JSON inválido: falta la clave "${clave}".`);
        if (!Array.isArray(datos[clave])) {
            throw new Error(`JSON inválido: "${clave}" debe ser una lista.`);
        }
    }
    const ids = new Set();
    for (const n of datos.nodos) {
        if (n === null || typeof n !== 'object' || !('id' in n)) {
            throw new Error('JSON inválido: hay un nodo sin la clave "id".');
        }
        const tipo = typeof n.id;
        if (tipo !== 'string' && tipo !== 'number') {
            throw new Error('JSON inválido: hay un nodo con un identificador que no es texto ni número.');
        }
        const id = String(n.id);
        if (id === '') throw new Error('JSON inválido: hay un nodo con el identificador vacío.');
        if (ids.has(id)) throw new Error(`JSON inválido: el nodo "${id}" está declarado dos veces.`);
        ids.add(id);
    }
    /* La capa de dibujo identifica el arco (u,v) como "u__v". Un nodo con ese
       nombre produce dos elementos con el mismo identificador. */
    for (const a of datos.arcos) {
        if (a !== null && typeof a === 'object' && 'origen' in a && 'destino' in a) {
            const interno = `${a.origen}__${a.destino}`;
            if (ids.has(interno)) {
                throw new Error(`JSON inválido: el nodo "${interno}" choca con el `
                    + `identificador interno del arco ${a.origen} -> ${a.destino}. Renómbralo.`);
            }
        }
    }
    for (const a of datos.arcos) {
        if (a === null || typeof a !== 'object' || !('origen' in a) || !('destino' in a)) {
            throw new Error('JSON inválido: hay un arco sin "origen" o sin "destino".');
        }
        const u = String(a.origen), v = String(a.destino);
        for (const extremo of [u, v]) {
            if (!ids.has(extremo)) {
                throw new Error(`JSON inválido: el arco ${u} -> ${v} apunta al nodo "${extremo}", que no está declarado.`);
            }
        }
        if (typeof a.largo !== 'number' || !Number.isFinite(a.largo)) {
            throw new Error(`JSON inválido: el arco ${u} -> ${v} tiene un largo no numérico o no finito.`);
        }
    }
}
