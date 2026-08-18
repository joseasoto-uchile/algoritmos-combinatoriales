/* Interfaz. Es la única capa que accede al DOM.
 *
 * La tabla T se dibuja completa desde el principio y cada celda se rellena
 * cuando el algoritmo la calcula. Al pulsar una celda (b,i) con i mayor o igual
 * que 1 se marcan las celdas (a,i-1) con a en N⁻(b), que son las que
 * intervienen en la recurrencia, junto con los arcos correspondientes.
 */

const VELOCIDAD_MINIMA = 1, VELOCIDAD_MAXIMA = 100, VELOCIDAD_INICIAL = 4;
const ATAJOS_VELOCIDAD = [1, 4, 15, 50];

const estado = {
    G: null,
    origen: null,
    k: 5,
    traza: null,
    T: null,
    Pi: null,
    paso: 0,
    reproduciendo: false,
    temporizador: null,
    seleccion: null,
    cy: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function entero(valor, defecto) {
    if (valor === null || valor === undefined || valor === '') return defecto;
    const n = parseInt(valor, 10);
    return Number.isNaN(n) ? defecto : n;
}

function velocidadValida(valor) {
    const n = parseInt(valor, 10);
    if (Number.isNaN(n)) return VELOCIDAD_INICIAL;
    return Math.min(Math.max(n, VELOCIDAD_MINIMA), VELOCIDAD_MAXIMA);
}

/* Rellena un select con la API del DOM. Los identificadores de nodo proceden
 * del archivo que carga el usuario y no deben concatenarse en innerHTML. */
function llenarDesplegable(select, pares) {
    select.replaceChildren(...pares.map(([valor, etiqueta]) => {
        const op = document.createElement('option');
        op.value = valor;
        op.textContent = etiqueta;
        return op;
    }));
}

/* --- Tabla T ------------------------------------------------------------- */

function construirTabla() {
    const tabla = $('#tabla-t');
    const ids = estado.G.ids;
    const k = estado.k;

    const thead = document.createElement('thead');
    const filaEnc = document.createElement('tr');
    const esquina = document.createElement('th');
    esquina.textContent = 'T';
    esquina.className = 'esquina';
    filaEnc.appendChild(esquina);
    for (let i = 0; i <= k; i++) {
        const th = document.createElement('th');
        th.textContent = i;
        th.dataset.columna = i;
        filaEnc.appendChild(th);
    }
    thead.appendChild(filaEnc);

    const tbody = document.createElement('tbody');
    for (const b of ids) {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.textContent = b;
        th.className = 'fila-nodo';
        tr.appendChild(th);
        for (let i = 0; i <= k; i++) {
            const td = document.createElement('td');
            td.dataset.nodo = b;
            td.dataset.columna = i;
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    tabla.replaceChildren(thead, tbody);
}

function pintarTabla() {
    if (!estado.G) return;
    const tablas = estado.traza
        ? estadoTablas(estado.traza, estado.paso, estado.G.ids, estado.k)
        : null;
    estado.T = tablas ? tablas.T : null;
    estado.Pi = tablas ? tablas.Pi : null;
    const calculadas = tablas ? tablas.calculadas : new Set();

    const colActual = estado.traza ? columnaActual(estado.traza, estado.paso) : -1;
    const ev = estado.traza
        ? estado.traza[Math.max(0, Math.min(estado.paso, estado.traza.length - 1))]
        : null;
    const mostrarPi = $('#chk-pi').checked;

    // Celdas de la columna anterior que intervienen en la recurrencia de la
    // celda seleccionada.
    const vecinos = new Set();
    if (estado.seleccion && estado.seleccion.columna >= 1) {
        for (const arco of estado.G.entrantes(estado.seleccion.nodo)) {
            vecinos.add(arco.origen + '|' + (estado.seleccion.columna - 1));
        }
    }

    for (const td of $$('#tabla-t tbody td')) {
        const b = td.dataset.nodo;
        const i = Number(td.dataset.columna);
        const clases = [];

        const calculada = estado.T && calculadas.has(b + '|' + i);
        td.replaceChildren();
        if (calculada) {
            td.append(textoValor(estado.T[b][i]));
            if (estado.T[b][i] === Infinity) clases.push('infinito');
            if (mostrarPi && estado.Pi[b][i] !== null) {
                const sub = document.createElement('span');
                sub.className = 'pi';
                sub.textContent = estado.Pi[b][i];
                td.appendChild(sub);
            }
        }

        if (i === colActual) clases.push('columna-actual');
        if (i === colActual - 1) clases.push('columna-previa');
        if (ev && ev.nodo === b && ev.columna === i) clases.push('celda-activa');
        if (ev && ev.a === b && ev.columna === i + 1) clases.push('celda-fuente');
        if (vecinos.has(b + '|' + i)) clases.push('celda-vecina');
        if (estado.seleccion && estado.seleccion.nodo === b
            && estado.seleccion.columna === i) clases.push('celda-seleccionada');
        td.className = clases.join(' ');
    }

    for (const th of $$('#tabla-t thead th[data-columna]')) {
        th.className = Number(th.dataset.columna) === colActual ? 'columna-actual' : '';
    }
}

/* --- Grafo --------------------------------------------------------------- */

function pintarGrafo() {
    let clasesNodo, clasesArco;
    if (estado.seleccion && estado.seleccion.columna >= 1) {
        [clasesNodo, clasesArco] = clasesSeleccion(estado.G, estado.seleccion.nodo);
        if (estado.origen) {
            if (!clasesNodo.has(estado.origen)) clasesNodo.set(estado.origen, new Set());
            clasesNodo.get(estado.origen).add('origen');
        }
    } else {
        [clasesNodo, clasesArco] = clasesPaso(estado.traza, estado.paso, estado.origen);
    }
    aplicarClases(estado.cy, clasesNodo, clasesArco);
}

function recalcularLayout() {
    estado.cy.layout({ name: 'preset', fit: true, padding: 40 }).run();
}

/* --- Texto de estado ----------------------------------------------------- */

function describirEvento(ev) {
    if (!ev) return '';
    const c = textoValor;
    switch (ev.tipo) {
        case 'inicializar':
            return 'Tablas inicializadas en +∞.';
        case 'caso_base':
            return 'T[' + ev.nodo + ',0] ← 0.';
        case 'inicio_columna':
            return 'Comienza la columna ' + ev.columna + ' de ' + ev.total + '.';
        case 'inicio_celda':
            return 'Calculando T[' + ev.nodo + ',' + ev.columna + '].';
        case 'examinar':
            return 'a = ' + ev.a + ':  T[' + ev.a + ',' + (ev.columna - 1) + '] + ℓ('
                + ev.a + ',' + ev.nodo + ') = ' + c(ev.previo) + ' + ' + ev.largo
                + ' = ' + c(ev.candidato) + ',  frente a T[' + ev.nodo + ',' + ev.columna
                + '] = ' + c(ev.actual) + '.';
        case 'mejorar':
            return 'Mejora: T[' + ev.nodo + ',' + ev.columna + '] ← ' + c(ev.valor)
                + ',  Π ← ' + ev.a + '.';
        case 'descartar':
            return 'Sin mejora con a = ' + ev.a + '.';
        case 'fin_celda':
            return 'T[' + ev.nodo + ',' + ev.columna + '] = ' + c(ev.valor) + '.';
        case 'fin_columna':
            return 'Columna ' + ev.columna + ' completa.';
        case 'fin':
            return 'Tablas T y Π completas.';
        default:
            return ev.tipo;
    }
}

function actualizarEstadoTexto() {
    if (!estado.traza) {
        $('#txt-paso').textContent = 'Sin traza. Pulsa Ejecutar.';
        $('#txt-detalle').textContent = '';
        return;
    }
    const p = Math.max(0, Math.min(estado.paso, estado.traza.length - 1));
    const ev = estado.traza[p];
    $('#txt-paso').textContent = 'Paso ' + (p + 1) + '/' + estado.traza.length + ': ' + ev.tipo;
    $('#txt-detalle').textContent = describirEvento(ev);
}

function resaltarPseudocodigo() {
    let activa = null;
    if (estado.traza) {
        const p = Math.max(0, Math.min(estado.paso, estado.traza.length - 1));
        activa = estado.traza[p].linea;
    }
    $$('#pseudocodigo .linea-codigo').forEach((el) => {
        el.classList.toggle('linea-activa', Number(el.dataset.linea) === activa);
    });
}

function pintarTodo() {
    pintarTabla();
    pintarGrafo();
    actualizarEstadoTexto();
    resaltarPseudocodigo();
    actualizarPaseo();
    actualizarSeleccionTexto();
}

/* --- Reconstrucción del paseo -------------------------------------------- */

function actualizarPaseo() {
    const salida = $('#txt-paseo');
    if (!estado.traza || !estado.T || estado.paso < estado.traza.length - 1) {
        salida.textContent = 'Disponible al terminar el cálculo.';
        salida.className = 'txt-ayuda';
        return;
    }
    const t = $('#dd-destino').value;
    const W = reconstruirPaseo(estado.T, estado.Pi, t, estado.k);
    if (W === null) {
        salida.textContent = 'No existe paseo de ' + estado.k + ' arcos entre '
            + estado.origen + ' y ' + t + '.';
        salida.className = 'txt-error';
        return;
    }
    salida.textContent = W.join(' → ') + '   (largo ' + textoValor(estado.T[t][estado.k]) + ')';
    salida.className = 'txt-formula';
}

function marcarPaseoEnGrafo() {
    if (!estado.traza || !estado.T || estado.paso < estado.traza.length - 1) return;
    const t = $('#dd-destino').value;
    const W = reconstruirPaseo(estado.T, estado.Pi, t, estado.k);
    if (!W) return;
    estado.seleccion = null;
    const clasesNodo = new Map(), clasesArco = new Map();
    const agregar = (m, clave, c) => {
        if (!m.has(clave)) m.set(clave, new Set());
        m.get(clave).add(c);
    };
    W.forEach((n) => agregar(clasesNodo, n, 'paseo'));
    for (let j = 0; j + 1 < W.length; j++) agregar(clasesArco, idArco(W[j], W[j + 1]), 'paseo');
    if (estado.origen) agregar(clasesNodo, estado.origen, 'origen');
    aplicarClases(estado.cy, clasesNodo, clasesArco);
}

/* --- Ejecución y reproducción -------------------------------------------- */

function ejecutar() {
    const salida = $('#txt-resultado');
    try {
        estado.origen = $('#dd-origen').value;
        estado.k = entero($('#in-k').value, 5);
        const r = programacionDinamica(estado.G, estado.origen, estado.k);
        estado.traza = r.traza;
        estado.paso = 0;
        estado.seleccion = null;
        pausar();
        construirTabla();
        salida.textContent = 'Origen ' + estado.origen + ', k = ' + estado.k + ', '
            + r.traza.length + ' pasos. Tabla de ' + estado.G.ids.length
            + ' filas por ' + (estado.k + 1) + ' columnas.';
        salida.className = 'txt-estado';
        pintarTodo();
        reproducir();
    } catch (e) {
        salida.textContent = e.message;
        salida.className = 'txt-error';
    }
}

function intervaloMs() {
    return Math.max(16, Math.round(1000 / velocidadValida($('#in-velocidad').value)));
}

function pausar() {
    estado.reproduciendo = false;
    if (estado.temporizador) {
        clearInterval(estado.temporizador);
        estado.temporizador = null;
    }
    $('#btn-play').textContent = '▶';
}

function reproducir() {
    if (!estado.traza || estado.traza.length < 2) return;
    if (estado.paso >= estado.traza.length - 1) estado.paso = 0;
    estado.seleccion = null;
    estado.reproduciendo = true;
    $('#btn-play').textContent = '⏸';
    estado.temporizador = setInterval(avanzarAutomatico, intervaloMs());
}

function alternarPlay() {
    if (!estado.traza) return;
    if (estado.reproduciendo) pausar();
    else reproducir();
}

function avanzarAutomatico() {
    if (!estado.traza) { pausar(); return; }
    estado.paso += 1;
    if (estado.paso >= estado.traza.length - 1) {
        estado.paso = estado.traza.length - 1;
        pausar();
    }
    pintarTodo();
}

function controlPaso(delta) {
    if (!estado.traza) return;
    if (estado.reproduciendo) pausar();
    estado.seleccion = null;
    estado.paso = delta === null
        ? 0
        : Math.max(0, Math.min(estado.paso + delta, estado.traza.length - 1));
    pintarTodo();
}

/* Avanza o retrocede hasta el primer paso de la columna contigua. */
function saltarColumna(direccion) {
    if (!estado.traza) return;
    if (estado.reproduciendo) pausar();
    estado.seleccion = null;
    const objetivo = columnaActual(estado.traza, estado.paso) + direccion;
    let p = estado.paso;
    while (p > 0 && p < estado.traza.length - 1) {
        p += direccion > 0 ? 1 : -1;
        if (columnaActual(estado.traza, p) === objetivo) break;
    }
    estado.paso = Math.max(0, Math.min(p, estado.traza.length - 1));
    pintarTodo();
}

/* --- Instancias ---------------------------------------------------------- */

function cargarGrafo(G, opciones) {
    const origen = opciones && opciones.origen ? opciones.origen : null;
    const k = opciones && opciones.k !== undefined ? opciones.k : null;

    estado.G = G;
    estado.traza = null;
    estado.T = null;
    estado.Pi = null;
    estado.paso = 0;
    estado.seleccion = null;
    pausar();

    const ids = G.ids;
    llenarDesplegable($('#dd-origen'), ids.map((n) => [n, n]));
    llenarDesplegable($('#dd-destino'), ids.map((n) => [n, n]));
    estado.origen = origen && ids.includes(origen) ? origen : ids[0];
    $('#dd-origen').value = estado.origen;
    $('#dd-destino').value = ids[ids.length - 1];
    if (k !== null) $('#in-k').value = k;
    estado.k = entero($('#in-k').value, 5);

    estado.cy.elements().remove();
    estado.cy.add(digrafoAElementos(G));
    recalcularLayout();

    construirTabla();
    $('#txt-resultado').textContent = '';
    $('#txt-resultado').className = 'txt-estado';
    pintarTodo();
}

function generarInstancia() {
    const salida = $('#txt-generar');
    try {
        const n = Math.min(Math.max(entero($('#in-n').value, 5), 2), 12);
        const densidad = Math.min(Math.max(parseFloat($('#in-densidad').value) || 0.35, 0), 1);
        const lmin = entero($('#in-largo-min').value, -2);
        const lmax = entero($('#in-largo-max').value, 8);
        if (lmin > lmax) {
            throw new Error('El largo mínimo (' + lmin + ') no puede ser mayor que el máximo ('
                + lmax + ').');
        }
        const semilla = $('#in-semilla').value === ''
            ? Math.floor(Math.random() * 1e9)
            : entero($('#in-semilla').value, 0);

        const rng = generadorAleatorio(semilla);
        const G = new Digrafo();
        const ids = Array.from({ length: n }, (_, i) => String(i + 1));
        const radio = 230, centro = 300;
        ids.forEach((id, j) => {
            const ang = (2 * Math.PI * j) / n - Math.PI / 2;
            G.agregarNodo(id, {
                pos: [centro + radio * Math.cos(ang) + 60, centro + radio * Math.sin(ang)],
            });
        });
        // Camino dirigido inicial: garantiza que todos los nodos son
        // alcanzables desde el primero.
        for (let j = 1; j < n; j++) G.agregarArco(ids[j - 1], ids[j], rng.entero(lmin, lmax));
        const objetivo = Math.round(densidad * n * (n - 1));
        let intentos = 0;
        while (G.arcos.size < objetivo && intentos < objetivo * 20 + 200) {
            const u = rng.elegir(ids), v = rng.elegir(ids);
            if (u !== v) G.agregarArco(u, v, rng.entero(lmin, lmax));
            intentos++;
        }
        salida.textContent = '';
        salida.className = '';
        cargarGrafo(G.agregarLoops(), { origen: ids[0] });
    } catch (e) {
        salida.textContent = e.message;
        salida.className = 'txt-error';
    }
}

/* --- Archivo ------------------------------------------------------------- */

function descargar(nombre, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo || 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
}

function exportarTablaCSV() {
    const encabezado = ['nodo'];
    for (let i = 0; i <= estado.k; i++) encabezado.push('i=' + i);
    const filas = [encabezado.join(',')];
    for (const b of estado.G.ids) {
        const fila = [b];
        for (let i = 0; i <= estado.k; i++) {
            fila.push(estado.T[b][i] === Infinity ? 'inf' : estado.T[b][i]);
        }
        filas.push(fila.join(','));
    }
    return filas.join('\n');
}

/* --- Selección de celda -------------------------------------------------- */

function actualizarSeleccionTexto() {
    const salida = $('#txt-seleccion');
    if (!estado.seleccion) {
        salida.textContent = 'Pulsa una celda de T para ver de qué celdas depende.';
        salida.className = 'txt-ayuda';
        return;
    }
    const nodo = estado.seleccion.nodo;
    const columna = estado.seleccion.columna;
    if (columna === 0) {
        salida.textContent = 'T[' + nodo + ',0] es caso base y no depende de ninguna celda.';
        salida.className = 'txt-ayuda';
        return;
    }
    const terminos = estado.G.entrantes(nodo).map((arco) => {
        const signo = arco.largo < 0 ? ' - ' : ' + ';
        return 'T[' + arco.origen + ',' + (columna - 1) + ']' + signo + Math.abs(arco.largo);
    });
    salida.textContent = 'T[' + nodo + ',' + columna + '] = mín { ' + terminos.join(',  ') + ' }';
    salida.className = 'txt-formula';
}

function alPulsarCelda(ev) {
    const td = ev.target.closest('td');
    if (!td || !td.dataset.nodo) return;
    const nodo = td.dataset.nodo;
    const columna = Number(td.dataset.columna);
    const misma = estado.seleccion
        && estado.seleccion.nodo === nodo
        && estado.seleccion.columna === columna;
    estado.seleccion = misma ? null : { nodo, columna };
    if (estado.seleccion && estado.reproduciendo) pausar();
    pintarTabla();
    pintarGrafo();
    actualizarSeleccionTexto();
}

/* --- Arranque ------------------------------------------------------------ */

function iniciar() {
    llenarDesplegable($('#dd-ejemplo'), [
        ['', 'Elegir ejemplo'],
        ...Object.entries(EJEMPLOS).map(([clave, info]) => [clave, info.nombre]),
    ]);
    $('#atajos-velocidad').replaceChildren(...ATAJOS_VELOCIDAD.map((v) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.velocidad = v;
        b.title = v + ' pasos por segundo';
        b.textContent = v;
        return b;
    }));
    $('#in-velocidad').value = VELOCIDAD_INICIAL;

    $('#pseudocodigo').replaceChildren(...PSEUDOCODIGO.map((texto, j) => {
        const div = document.createElement('div');
        div.className = 'linea-codigo';
        div.dataset.linea = j + 1;
        const num = document.createElement('span');
        num.className = 'num-linea';
        num.textContent = String(j + 1).padStart(2, ' ');
        div.append(num, ' ' + texto);
        return div;
    }));

    estado.cy = cytoscape({
        container: $('#cyto'),
        elements: [],
        style: ESTILOS,
        layout: { name: 'preset' },
        wheelSensitivity: 0.2,
    });

    $('#btn-ejecutar').addEventListener('click', ejecutar);
    $('#btn-generar').addEventListener('click', generarInstancia);
    $('#dd-ejemplo').addEventListener('change', () => {
        const clave = $('#dd-ejemplo').value;
        $('#txt-ejemplo').textContent = clave ? EJEMPLOS[clave].descripcion : '';
    });
    $('#btn-ejemplo').addEventListener('click', () => {
        const clave = $('#dd-ejemplo').value;
        if (!clave) return;
        const info = EJEMPLOS[clave];
        cargarGrafo(construirEjemplo(clave), { origen: info.origen, k: info.k });
    });
    $('#btn-play').addEventListener('click', alternarPlay);
    $('#btn-siguiente').addEventListener('click', () => controlPaso(1));
    $('#btn-anterior').addEventListener('click', () => controlPaso(-1));
    $('#btn-reiniciar').addEventListener('click', () => controlPaso(null));
    $('#btn-col-siguiente').addEventListener('click', () => saltarColumna(1));
    $('#btn-col-anterior').addEventListener('click', () => saltarColumna(-1));
    $('#btn-centrar').addEventListener('click', recalcularLayout);
    $('#chk-pi').addEventListener('change', pintarTabla);
    $('#dd-destino').addEventListener('change', () => {
        actualizarPaseo();
        marcarPaseoEnGrafo();
    });
    $('#btn-marcar-paseo').addEventListener('click', marcarPaseoEnGrafo);
    $('#in-velocidad').addEventListener('change', () => {
        if (estado.reproduciendo) {
            clearInterval(estado.temporizador);
            estado.temporizador = setInterval(avanzarAutomatico, intervaloMs());
        }
    });
    $('#atajos-velocidad').addEventListener('click', (ev) => {
        const b = ev.target.closest('button');
        if (!b) return;
        $('#in-velocidad').value = b.dataset.velocidad;
        $('#in-velocidad').dispatchEvent(new Event('change'));
    });
    $('#tabla-t').addEventListener('click', alPulsarCelda);

    $('#btn-guardar').addEventListener('click', () =>
        descargar('digrafo.json', JSON.stringify(estado.G.aObjeto(), null, 2)));
    $('#in-cargar').addEventListener('change', (ev) => {
        const archivo = ev.target.files[0];
        if (!archivo) return;
        const lector = new FileReader();
        lector.onload = () => {
            const salida = $('#txt-archivo');
            try {
                cargarGrafo(Digrafo.desdeObjeto(JSON.parse(lector.result)));
                salida.textContent = 'Cargado: ' + archivo.name;
                salida.className = 'txt-estado';
            } catch (e) {
                salida.textContent = e instanceof SyntaxError
                    ? 'JSON inválido: ' + archivo.name + ' no es un archivo JSON bien formado.'
                    : e.message;
                salida.className = 'txt-error';
            }
        };
        lector.readAsText(archivo);
    });
    $('#btn-tabla-csv').addEventListener('click', () => {
        const salida = $('#txt-archivo');
        if (!estado.T) {
            salida.textContent = 'Ejecuta el algoritmo antes de exportar la tabla.';
            salida.className = 'txt-error';
            return;
        }
        descargar('tabla-T.csv', exportarTablaCSV(), 'text/csv');
        salida.textContent = 'Tabla T exportada en CSV.';
        salida.className = 'txt-estado';
    });

    window.addEventListener('resize', () => estado.cy.resize());

    const inicial = EJEMPLOS.negativos;
    cargarGrafo(construirEjemplo('negativos'), { origen: inicial.origen, k: inicial.k });
    $('#dd-ejemplo').value = 'negativos';
    $('#txt-ejemplo').textContent = inicial.descripcion;
}

document.addEventListener('DOMContentLoaded', iniciar);
