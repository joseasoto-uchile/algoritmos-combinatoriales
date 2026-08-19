/* Interfaz. Es la única capa que accede al DOM.
 *
 * La tabla T se dibuja completa desde el principio y cada celda se rellena
 * cuando el algoritmo la calcula. Al pulsar una celda (b,i) con i mayor o igual
 * que 1 se marcan las celdas (a,i-1) con a en N⁻(b), que son las que
 * intervienen en la recurrencia, junto con los arcos correspondientes.
 */

const VELOCIDAD_MINIMA = 1, VELOCIDAD_MAXIMA = 100, VELOCIDAD_INICIAL = 4;
const INTERVALO_MINIMO_MS = 16;
const ATAJOS_VELOCIDAD = [1, 4, 15, 50, 100];

/* La aplicación es de demostración: la matriz de largos del editor tiene n²
 * casillas y las tablas T y Pi se leen en pantalla completas. */
const NODOS_MINIMO = 2, NODOS_MAXIMO = 20;
const K_MINIMO = 0, K_MAXIMO = 200, K_POR_OMISION = 6;

/* La traza guarda un evento por cada comparacion del algoritmo. Su tamano es
 * exactamente 3 + k(2n + 2m + 2), donde m cuenta los loops. El limite acota la
 * memoria del navegador: 400.000 eventos son unos 40 MB. */
const EVENTOS_MAXIMO = 400000;

function estimarEventos(n, m, k) { return 3 + k * (2 * n + 2 * m + 2); }

/* Devuelve el valor si esta en rango y lanza un error con el motivo si no lo
 * esta. El valor fuera de rango se rechaza, no se recorta. */
function enRango(valor, minimo, maximo, nombre) {
    if (valor < minimo || valor > maximo) {
        throw new Error(`${nombre} debe estar entre ${minimo} y ${maximo}. Se recibió ${valor}.`);
    }
    return valor;
}

const estado = {
    G: null,
    origen: null,
    k: K_POR_OMISION,
    traza: null,
    T: null,
    Pi: null,
    calculadas: new Set(),
    inicializado: false,
    paseo: null,
    paso: 0,
    reproduciendo: false,
    temporizador: null,
    pasosPorDisparo: 1,
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

/* T y Pi tienen la misma forma, |V| filas por k+1 columnas, y se rellenan a la
 * vez. Se construyen con la misma funcion para que las celdas de una y otra se
 * correspondan posicion a posicion. */
function construirUnaTabla(tabla, titulo, ids, k) {
    const thead = document.createElement('thead');
    const filaEnc = document.createElement('tr');
    const esquina = document.createElement('th');
    esquina.textContent = titulo;
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

function construirTabla() {
    const ids = estado.G.ids;
    construirUnaTabla($('#tabla-t'), 'T', ids, estado.k);
    construirUnaTabla($('#tabla-pi'), 'Π', ids, estado.k);
}

function recalcularTablas() {
    const tablas = estado.G && estado.traza
        ? estadoTablas(estado.traza, estado.paso, estado.G.ids, estado.k)
        : null;
    estado.T = tablas ? tablas.T : null;
    estado.Pi = tablas ? tablas.Pi : null;
    estado.calculadas = tablas ? tablas.calculadas : new Set();
    estado.inicializado = tablas ? tablas.inicializado : false;
}

/* El paseo optimo solo esta definido con la tabla completa: Pi[t,k] necesita
 * todas las columnas. */
function recalcularPaseo() {
    estado.paseo = estado.T && estado.paso >= estado.traza.length - 1
        ? reconstruirPaseo(estado.T, estado.Pi, $('#dd-destino').value, estado.k)
        : null;
}

function pintarTabla() {
    if (!estado.G) return;
    const calculadas = estado.calculadas;
    const inicializado = estado.inicializado;

    const colActual = estado.traza ? columnaActual(estado.traza, estado.paso) : -1;
    const ev = estado.traza
        ? estado.traza[Math.max(0, Math.min(estado.paso, estado.traza.length - 1))]
        : null;
    $('#bloque-pi').hidden = !$('#chk-pi').checked;

    // Celdas de la columna anterior que intervienen en la recurrencia de la
    // celda seleccionada.
    const vecinos = new Set();
    if (estado.seleccion && estado.seleccion.columna >= 1) {
        for (const arco of estado.G.entrantes(estado.seleccion.nodo)) {
            vecinos.add(arco.origen + '|' + (estado.seleccion.columna - 1));
        }
    }

    // Clases de resaltado, comunes a las dos tablas.
    const clasesDe = (b, i) => {
        const c = [];
        if (i === colActual) c.push('columna-actual');
        if (i === colActual - 1) c.push('columna-previa');
        if (ev && ev.nodo === b && ev.columna === i) c.push('celda-activa');
        if (ev && ev.a === b && ev.columna === i + 1) c.push('celda-fuente');
        if (estado.paseo && estado.paseo[i] === b) c.push('celda-paseo');
        if (vecinos.has(b + '|' + i)) c.push('celda-vecina');
        if (estado.seleccion && estado.seleccion.nodo === b
            && estado.seleccion.columna === i) c.push('celda-seleccionada');
        return c;
    };

    for (const td of $$('#tabla-t tbody td')) {
        const b = td.dataset.nodo;
        const i = Number(td.dataset.columna);
        const clases = clasesDe(b, i);
        td.replaceChildren();
        if (inicializado) {
            td.append(textoValor(estado.T[b][i]));
            if (estado.T[b][i] === Infinity) clases.push('infinito');
            if (!calculadas.has(b + '|' + i)) clases.push('pendiente');
        }
        td.className = clases.join(' ');
    }

    // Pi[b,i] es el penultimo nodo de un paseo optimo. Vale el simbolo de
    // indefinido cuando i = 0 o cuando T[b,i] es infinito, es decir cuando no
    // existe tal paseo.
    for (const td of $$('#tabla-pi tbody td')) {
        const b = td.dataset.nodo;
        const i = Number(td.dataset.columna);
        const clases = clasesDe(b, i);
        td.replaceChildren();
        if (inicializado) {
            const v = estado.Pi[b][i];
            td.append(v === null ? '⊥' : v);
            if (v === null) clases.push('indefinido');
            if (!calculadas.has(b + '|' + i)) clases.push('pendiente');
        }
        td.className = clases.join(' ');
    }

    for (const th of $$('#tabla-t thead th[data-columna], #tabla-pi thead th[data-columna]')) {
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
        if (estado.paseo) marcarPaseo(clasesNodo, clasesArco, estado.paseo);
    }
    aplicarClases(estado.cy, clasesNodo, clasesArco);
}

/* Cytoscape guarda el tamano del contenedor y solo lo relee con resize(). El
 * alto de #cyto depende del panel de tablas, que cambia con k y con el numero
 * de nodos, de modo que hay que releerlo antes de encuadrar. */
function recalcularLayout() {
    estado.cy.resize();
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
    recalcularTablas();
    recalcularPaseo();
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
    const t = $('#dd-destino').value;
    if (!estado.traza || !estado.T || estado.paso < estado.traza.length - 1) {
        salida.textContent = 'Disponible al terminar el cálculo.';
        salida.className = 'txt-ayuda';
        return;
    }
    if (estado.paseo === null) {
        salida.textContent = 'No existe paseo de ' + estado.k + ' arcos entre '
            + estado.origen + ' y ' + t + '.';
        salida.className = 'txt-error';
        return;
    }
    salida.textContent = estado.paseo.join(' → ')
        + '   (largo ' + textoValor(estado.T[t][estado.k]) + ')';
    salida.className = 'txt-formula';
}

/* Anade la clase del paseo sobre los mapas de clases que ya trae el paso
 * actual. Un paseo puede repetir nodos y arcos; el conjunto los absorbe. */
function marcarPaseo(clasesNodo, clasesArco, W) {
    const agregar = (m, clave) => {
        if (!m.has(clave)) m.set(clave, new Set());
        m.get(clave).add('paseo');
    };
    W.forEach((n) => agregar(clasesNodo, n));
    for (let j = 0; j + 1 < W.length; j++) agregar(clasesArco, idArco(W[j], W[j + 1]));
}

/* --- Ejecución y reproducción -------------------------------------------- */

function ejecutar() {
    const salida = $('#txt-resultado');
    try {
        estado.origen = $('#dd-origen').value;
        estado.k = enRango(entero($('#in-k').value, K_POR_OMISION), K_MINIMO, K_MAXIMO,
            'El número de arcos k');

        const n = estado.G.ids.length, m = estado.G.arcos.size;
        const previstos = estimarEventos(n, m, estado.k);
        if (previstos > EVENTOS_MAXIMO) {
            throw new Error(
                `La traza tendría ${previstos.toLocaleString('es')} pasos, por encima del `
                + `límite de ${EVENTOS_MAXIMO.toLocaleString('es')}. `
                + `La instancia tiene ${n} nodos y ${m} arcos con k = ${estado.k}. `
                + 'Reduce k o el número de nodos.');
        }
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

/* setInterval no entrega disparos fiables por debajo de INTERVALO_MINIMO_MS.
 * Para las velocidades que lo exigirian se avanzan varios pasos por disparo. */
function cadencia() {
    const v = velocidadValida($('#in-velocidad').value);
    const pasos = Math.max(1, Math.ceil((v * INTERVALO_MINIMO_MS) / 1000));
    return { ms: Math.round((1000 * pasos) / v), pasos };
}

function arrancarTemporizador() {
    const c = cadencia();
    estado.pasosPorDisparo = c.pasos;
    estado.temporizador = setInterval(avanzarAutomatico, c.ms);
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
    arrancarTemporizador();
}

/* Reproducir ejecuta el algoritmo si aun no hay traza, o si el origen o k
 * cambiaron desde la ultima ejecucion. */
function alternarPlay() {
    const kPedido = entero($('#in-k').value, K_POR_OMISION);
    const origenPedido = $('#dd-origen').value;
    const desactualizada = !estado.traza
        || estado.k !== kPedido
        || estado.origen !== origenPedido;
    if (desactualizada) { ejecutar(); return; }
    if (estado.reproduciendo) pausar();
    else reproducir();
}

function avanzarAutomatico() {
    if (!estado.traza) { pausar(); return; }
    estado.paso += estado.pasosPorDisparo;
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

/* Primer paso de una columna. El evento inicio_columna marca ese punto. La
 * columna 0 no tiene ese evento: corresponde al comienzo de la traza. */
function pasoInicioColumna(columna) {
    if (columna <= 0) return 0;
    const traza = estado.traza;
    for (let p = 0; p < traza.length; p++) {
        if (traza[p].tipo === 'inicio_columna' && traza[p].columna === columna) return p;
    }
    return traza.length - 1;
}

/* Va al primer paso de la columna contigua. */
function saltarColumna(direccion) {
    if (!estado.traza) return;
    if (estado.reproduciendo) pausar();
    estado.seleccion = null;
    estado.paso = pasoInicioColumna(columnaActual(estado.traza, estado.paso) + direccion);
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
    estado.k = entero($('#in-k').value, K_POR_OMISION);

    estado.cy.elements().remove();
    estado.cy.add(digrafoAElementos(G));

    // La tabla se construye antes de encuadrar: su alto determina el que le
    // queda a #cyto.
    construirTabla();
    recalcularLayout();
    $('#txt-resultado').textContent = '';
    $('#txt-resultado').className = 'txt-estado';
    pintarTodo();
}

function generarInstancia() {
    const salida = $('#txt-generar');
    try {
        const n = enRango(entero($('#in-n').value, 6), NODOS_MINIMO, NODOS_MAXIMO,
            'El número de nodos');
        const densidad = enRango(parseFloat($('#in-densidad').value) || 0, 0, 1,
            'La densidad');
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
        cargarGrafo(G.agregarLoops(), { origen: ids[0] });
        const arcosPropios = G.arcos.size - n;   // sin contar los loops
        salida.textContent = `Instancia con ${n} nodos y ${arcosPropios} arcos, `
            + `más ${n} loops de largo 0.`;
        salida.className = 'txt-estado';
    } catch (e) {
        salida.textContent = e.message;
        salida.className = 'txt-error';
    }
}

/* --- Archivo ------------------------------------------------------------- */

/* El objeto URL se libera en el siguiente ciclo de eventos. Revocarlo en la
 * misma vuelta deja la descarga dependiendo de que el navegador capture el
 * blob de forma sincrona al pulsar. */
function descargar(nombre, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo || 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* RFC 4180: un campo con coma, comilla o salto de línea va entre comillas, y
 * las comillas de dentro se duplican. Los nombres de nodo los escribe el
 * usuario y pueden contener cualquiera de esos caracteres. */
function campoCSV(valor) {
    const texto = String(valor);
    return /[",\r\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
}

function exportarTablaCSV() {
    const encabezado = ['nodo'];
    for (let i = 0; i <= estado.k; i++) encabezado.push('i=' + i);
    const filas = [encabezado.join(',')];
    for (const b of estado.G.ids) {
        const fila = [campoCSV(b)];
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
    iniciarEditor();
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
    $('#btn-editar').addEventListener('click', () => {
        pausar();
        abrirEditor(estado.G, (G) => {
            cargarGrafo(G, { origen: estado.origen });
            $('#txt-resultado').textContent =
                'Instancia editada: ' + G.ids.length + ' nodos, '
                + [...G.arcos.values()].filter((a) => a.origen !== a.destino).length
                + ' arcos sin contar los loops.';
        });
    });
    $('#btn-k-igual-n').addEventListener('click', () => {
        $('#in-k').value = estado.G ? estado.G.ids.length : K_POR_OMISION;
    });
    $('#btn-play').addEventListener('click', alternarPlay);
    $('#btn-siguiente').addEventListener('click', () => controlPaso(1));
    $('#btn-anterior').addEventListener('click', () => controlPaso(-1));
    $('#btn-reiniciar').addEventListener('click', () => controlPaso(null));
    $('#btn-col-siguiente').addEventListener('click', () => saltarColumna(1));
    $('#btn-col-anterior').addEventListener('click', () => saltarColumna(-1));
    $('#btn-centrar').addEventListener('click', recalcularLayout);
    $('#chk-pi').addEventListener('change', pintarTabla);
    $('#dd-destino').addEventListener('change', pintarTodo);
    $('#in-velocidad').addEventListener('change', () => {
        if (estado.reproduciendo) {
            clearInterval(estado.temporizador);
            arrancarTemporizador();
        }
    });
    $('#atajos-velocidad').addEventListener('click', (ev) => {
        const b = ev.target.closest('button');
        if (!b) return;
        $('#in-velocidad').value = b.dataset.velocidad;
        $('#in-velocidad').dispatchEvent(new Event('change'));
    });
    $('#tabla-t').addEventListener('click', alPulsarCelda);
    $('#tabla-pi').addEventListener('click', alPulsarCelda);

    $('#btn-guardar').addEventListener('click', () =>
        descargar('digrafo.json', JSON.stringify(estado.G.aObjeto(), null, 2)));
    $('#in-cargar').addEventListener('change', (ev) => {
        const archivo = ev.target.files[0];
        if (!archivo) return;
        const lector = new FileReader();
        lector.onload = () => {
            const salida = $('#txt-archivo');
            try {
                const G = Digrafo.desdeObjeto(JSON.parse(lector.result));
                if (G.ids.length > NODOS_MAXIMO) {
                    throw new Error(`El archivo tiene ${G.ids.length} nodos y la `
                        + `aplicación admite hasta ${NODOS_MAXIMO}.`);
                }
                cargarGrafo(G);
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

    // El alto de #cyto depende del panel de tablas, que cambia al reconstruirlas
    // con otro k o con otro numero de nodos. El observador cubre eso y tambien
    // el cambio de tamano de la ventana.
    new ResizeObserver(() => estado.cy.resize()).observe($('#cyto'));

    const inicial = EJEMPLOS.negativos;
    cargarGrafo(construirEjemplo('negativos'), { origen: inicial.origen, k: inicial.k });
    $('#dd-ejemplo').value = 'negativos';
    $('#txt-ejemplo').textContent = inicial.descripcion;
}

document.addEventListener('DOMContentLoaded', iniciar);
