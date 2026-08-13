/* Capa de interacción: la única que toca el DOM.
 *
 * Port de app.py. En la versión Dash cada paso de la traza era un callback al
 * servidor; acá todo ocurre en el navegador, así que la página se puede
 * publicar como sitio estático (GitHub Pages) sin backend.
 */

const LAYOUTS = ['circle', 'breadthfirst', 'grid', 'cose', 'preset'];
const URL_LICENCIA = 'https://github.com/joseasoto-uchile/algoritmos-combinatoriales/blob/main/LICENSE';
const VELOCIDAD_MINIMA = 1, VELOCIDAD_MAXIMA = 100, VELOCIDAD_INICIAL = 5;
const ATAJOS_VELOCIDAD = [1, 5, 15, 50];

const estado = {
    G: null,
    traza: null,
    algEjecutado: null,
    paso: 0,
    reproduciendo: false,
    temporizador: null,
    breakpoints: new Set(),
    cy: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* --- Utilidades de lectura de formulario -------------------------------- */
function entero(valor, defecto) {
    // No se usa `valor || defecto`: 0 es falsy y un peso mínimo de 0 escrito
    // por el usuario se convertiría silenciosamente en el valor por omisión.
    if (valor === null || valor === undefined || valor === '') return defecto;
    const n = parseInt(valor, 10);
    return Number.isNaN(n) ? defecto : n;
}
function decimal(valor, defecto) {
    if (valor === null || valor === undefined || valor === '') return defecto;
    const n = parseFloat(valor);
    return Number.isNaN(n) ? defecto : n;
}
function velocidadValida(valor) {
    const n = parseInt(valor, 10);
    if (Number.isNaN(n)) return VELOCIDAD_INICIAL;
    return Math.min(Math.max(n, VELOCIDAD_MINIMA), VELOCIDAD_MAXIMA);
}

/* --- Origen por omisión -------------------------------------------------- */
function origenPorOmision(G) {
    const ids = G.ids;
    if (!ids.length) return null;
    if (G.dirigido) {
        // En un dirigido, "conexo" solo garantiza conexidad débil: el primer
        // nodo puede no tener salidas y el recorrido queda en tres pasos, que
        // se lee como si la aplicación estuviera rota.
        return ids.reduce((mejor, n) => (G.gradoSalida(n) > G.gradoSalida(mejor) ? n : mejor), ids[0]);
    }
    return ids.find((n) => G.vecinos(n).length > 0) ?? ids[0];
}

/* --- Render del grafo ---------------------------------------------------- */
function elementosActuales() {
    const layout = $('#dd-layout').value;
    // Solo 'preset' quiere las coordenadas guardadas: con cualquier otro
    // layout, mandarlas hace que Cytoscape las reaplique en cada paso y el
    // grafo salte de vuelta a las posiciones viejas.
    let elementos = grafoAElementos(estado.G, layout === 'preset');
    if (estado.traza) {
        const paso = Math.max(0, Math.min(estado.paso, estado.traza.length - 1));
        const [cn, ca] = calcularEstado(estado.traza, paso, estado.G.dirigido);
        elementos = aplicarClases(elementos, cn, ca, $('#dd-origen').value);
        const d = calcularDistancias(estado.traza, paso);
        if (d !== null) elementos = aplicarDistancias(elementos, d);
    } else {
        elementos = aplicarClases(elementos, new Map(), new Map(), $('#dd-origen').value);
    }
    return elementos;
}

function recalcularLayout() {
    estado.cy.layout({
        name: $('#dd-layout').value || 'circle', fit: true, padding: 30, animate: false,
    }).run();
}

/* Redibuja el estado sin recalcular posiciones. Cytoscape conserva las
 * coordenadas de los nodos que ya existen, así que solo cambian clases y
 * etiquetas: es lo que evita que el grafo salte entre pasos. */
function pintarEstado() {
    const elementos = elementosActuales();
    const porId = new Map(elementos.map((e) => [e.data.id, e]));
    estado.cy.batch(() => {
        estado.cy.elements().forEach((el) => {
            const nuevo = porId.get(el.id());
            if (!nuevo) return;
            el.classes(nuevo.classes || '');
            if (nuevo.data.label !== undefined) el.data('label', nuevo.data.label);
        });
    });
    actualizarTextoPaso();
    resaltarPseudocodigo();
}

function reconstruirGrafo({ recalcular = true } = {}) {
    estado.cy.elements().remove();
    estado.cy.add(elementosActuales());
    if (recalcular) recalcularLayout();
    actualizarTextoPaso();
    resaltarPseudocodigo();
}

function actualizarTextoPaso() {
    const t = $('#txt-paso');
    if (!estado.traza) { t.textContent = 'Sin traza — ejecuta un algoritmo.'; return; }
    const paso = Math.max(0, Math.min(estado.paso, estado.traza.length - 1));
    t.textContent = `Paso ${paso + 1}/${estado.traza.length} — ${estado.traza[paso].tipo}`;
}

/* --- Instancias ---------------------------------------------------------- */
function cargarGrafo(G, { layout = null } = {}) {
    estado.G = G;
    estado.traza = null;
    estado.algEjecutado = null;
    estado.paso = 0;
    pausar();
    if (layout) $('#dd-layout').value = layout;
    actualizarOpciones();
    reconstruirGrafo();
}

function generarInstancia() {
    const banderas = new Set($$('.bandera:checked').map((c) => c.value));
    const err = $('#txt-generar');
    try {
        const G = generarAleatorio({
            n: entero($('#in-n').value, 10),
            densidad: decimal($('#in-densidad').value, 0.3),
            dirigido: banderas.has('dirigido'),
            dag: banderas.has('dag'),
            conexo: banderas.has('conexo'),
            pesoMin: entero($('#in-peso-min').value, 1),
            pesoMax: entero($('#in-peso-max').value, 10),
            permitirNegativos: banderas.has('negativos'),
            semilla: $('#in-seed').value === '' ? null : entero($('#in-seed').value, 0),
        });
        err.textContent = '';
        err.className = '';
        cargarGrafo(G);
    } catch (e) {
        // Parámetros incoherentes: se avisa y se conserva el grafo anterior en
        // lugar de dejar la aplicación sin instancia.
        err.textContent = e.message;
        err.className = 'txt-error';
    }
}

/* --- Algoritmos ---------------------------------------------------------- */
function actualizarOpciones() {
    const estados = estadoAlgoritmos(estado.G);
    const disponibles = estados.filter((e) => e.disponible);
    const sel = $('#dd-algoritmo');
    const previo = sel.value;
    sel.innerHTML = disponibles.map((e) => `<option value="${e.id}">${e.nombre}</option>`).join('');
    // Conserva el algoritmo elegido si el grafo nuevo también lo admite.
    sel.value = disponibles.some((e) => e.id === previo) ? previo : (disponibles[0]?.id ?? '');

    const origen = $('#dd-origen');
    origen.innerHTML = estado.G.ids.map((n) => `<option value="${n}">${n}</option>`).join('');
    origen.value = origenPorOmision(estado.G);

    const noDisp = estados.filter((e) => !e.disponible);
    $('#lista-no-disponibles').innerHTML = noDisp.length
        ? `<div>No aplican a este grafo:</div>${noDisp.map((e) =>
            `<div class="item-no-disponible"><span class="nombre-no-disponible">${e.nombre}</span>`
            + ` <span>— ${e.motivo}</span></div>`).join('')}`
        : '';
    renderPseudocodigo();
}

function ejecutar() {
    const algId = $('#dd-algoritmo').value;
    const origen = $('#dd-origen').value;
    const salida = $('#txt-resultado');
    if (!algId || origen === null) return;
    const info = ALGORITMOS[algId];
    try {
        const [, traza] = info.funcion(estado.G, origen);
        estado.traza = traza;
        estado.algEjecutado = algId;
        estado.paso = 0;
        pausar();
        salida.textContent = `${info.nombre} desde ${origen} — ${traza.length} pasos de traza.`;
        salida.className = 'txt-estado';
        pintarEstado();
        // Arranca la animación sola: pedir el algoritmo y además tener que
        // apretar ▶ era un paso de más, porque lo que se quiere ver al
        // ejecutar es justamente la animación.
        reproducir();
    } catch (e) {
        // En el camino de error no se toca la reproducción: si había una
        // animación corriendo de una ejecución anterior, se queda como estaba.
        salida.textContent = `Error: ${e.message}`;
        salida.className = 'txt-error';
    }
}

/* --- Reproducción -------------------------------------------------------- */
function intervaloMs() {
    return Math.max(16, Math.round(1000 / velocidadValida($('#in-velocidad').value)));
}

function pausar() {
    estado.reproduciendo = false;
    if (estado.temporizador) { clearInterval(estado.temporizador); estado.temporizador = null; }
    $('#btn-play').textContent = '▶';
}

function reproducir() {
    if (!estado.traza || estado.traza.length < 2) return;
    // Dar play con la traza terminada no hacía nada visible: el primer tic
    // detectaba el final y volvía a pausar. Ahora reinicia solo.
    if (estado.paso >= estado.traza.length - 1) estado.paso = 0;
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
    } else if (estado.breakpoints.has(estado.traza[estado.paso].linea)) {
        // Punto de interrupción: pausa dejando el paso visible, para poder
        // inspeccionar el estado del grafo en ese momento.
        pausar();
    }
    pintarEstado();
}

function controlPaso(delta) {
    if (!estado.traza) return;
    // Tocar un control manual mientras corre la animación hacía que el
    // temporizador siguiera avanzando y peleara con el paso elegido a mano.
    if (estado.reproduciendo) pausar();
    estado.paso = delta === null ? 0
        : Math.max(0, Math.min(estado.paso + delta, estado.traza.length - 1));
    pintarEstado();
}

/* --- Pseudocódigo -------------------------------------------------------- */
function renderPseudocodigo() {
    const algId = $('#dd-algoritmo').value;
    if (!algId || !ALGORITMOS[algId]) return;
    const info = ALGORITMOS[algId];
    $('#pseudocodigo-titulo').textContent = `Pseudocódigo — ${info.nombre}`;
    $('#pseudocodigo-complejidad').innerHTML =
        `<span class="insignia-complejidad">${info.complejidad}</span>`;
    // Los puntos de interrupción son por algoritmo: al cambiar, se limpian.
    estado.breakpoints.clear();
    $('#pseudocodigo-lineas').innerHTML = info.pseudocodigo.map((texto, i) =>
        `<div class="linea-codigo" data-linea="${i + 1}">`
        + `<span class="num-linea">${String(i + 1).padStart(2, ' ')}</span> `
        + `${texto.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`).join('');
    resaltarPseudocodigo();
}

function resaltarPseudocodigo() {
    let lineaActiva = null;
    // Solo se resalta si la traza vigente es de ESTE algoritmo: al cambiar el
    // desplegable sin volver a ejecutar, el código mostrado no se corresponde
    // con los pasos guardados.
    if (estado.traza && $('#dd-algoritmo').value === estado.algEjecutado) {
        const p = Math.max(0, Math.min(estado.paso, estado.traza.length - 1));
        lineaActiva = estado.traza[p].linea;
    }
    $$('#pseudocodigo-lineas .linea-codigo').forEach((el) => {
        const n = Number(el.dataset.linea);
        el.classList.toggle('linea-breakpoint', estado.breakpoints.has(n));
        el.classList.toggle('linea-activa', n === lineaActiva);
    });
}

/* --- Archivo ------------------------------------------------------------- */
function descargar(nombre, contenido, tipo = 'application/json') {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
}

function exportarTrazaCSV() {
    // La traza es heterogénea (cada tipo de evento trae campos distintos), así
    // que el encabezado es la unión de todas las claves.
    const claves = [];
    estado.traza.forEach((ev) => Object.keys(ev).forEach((k) => { if (!claves.includes(k)) claves.push(k); }));
    const escapar = (v) => {
        const s = v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const filas = [claves.join(',')];
    estado.traza.forEach((ev) => filas.push(claves.map((k) => escapar(ev[k])).join(',')));
    return filas.join('\n');
}

/* --- Leyenda y pie ------------------------------------------------------- */
function renderLeyenda() {
    const muestras = ESTADOS_LEYENDA.map(([titulo, detalle, relleno, borde]) =>
        `<div class="leyenda-item"><span class="leyenda-punto" style="background:${relleno};border-color:${borde}"></span>`
        + `<span class="leyenda-nombre">${titulo}</span><span class="leyenda-detalle">· ${detalle}</span></div>`).join('');
    $('#leyenda-contenido').innerHTML =
        '<div class="leyenda-item leyenda-etiqueta">'
        + '<span class="muestra-etiqueta"><span class="muestra-nombre">3</span>'
        + '<span class="muestra-dist">d=7</span></span>'
        + '<span class="leyenda-nombre">Etiqueta</span>'
        + '<span class="leyenda-detalle">· nombre del nodo arriba, distancia actual abajo (∞ = aún no alcanzado)</span>'
        + `</div>${muestras}`;
}

/* --- Columnas redimensionables ------------------------------------------- */
function activarDivisores() {
    const LIMITES = { controles: [180, 560], codigo: [160, 640] };
    const VARIABLE = { controles: '--ancho-controles', codigo: '--ancho-codigo' };
    const OMISION = { controles: 280, codigo: 300 };
    const CLAVE = 'grafos:anchos-columnas';
    const fila = $('.fila-principal');

    const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; } };
    const guardar = (a) => { try { localStorage.setItem(CLAVE, JSON.stringify(a)); } catch { /* deshabilitado */ } };
    const aplicar = (obj, val) => {
        const [min, max] = LIMITES[obj];
        fila.style.setProperty(VARIABLE[obj], `${Math.min(Math.max(val, min), max)}px`);
    };

    const guardados = leer();
    Object.keys(VARIABLE).forEach((o) => { if (typeof guardados[o] === 'number') aplicar(o, guardados[o]); });

    document.addEventListener('mousedown', (ev) => {
        const div = ev.target.closest('.divisor');
        if (!div) return;
        const obj = div.dataset.objetivo;
        ev.preventDefault();
        const inicial = parseFloat(getComputedStyle(fila).getPropertyValue(VARIABLE[obj])) || OMISION[obj];
        const x0 = ev.clientX;
        // La columna de código está a la derecha del divisor: crece cuando el
        // puntero va hacia la izquierda, así que el signo se invierte.
        const signo = obj === 'codigo' ? -1 : 1;
        document.body.classList.add('redimensionando');

        const mover = (e) => {
            aplicar(obj, inicial + signo * (e.clientX - x0));
            estado.cy.resize();
        };
        const soltar = () => {
            document.removeEventListener('mousemove', mover);
            document.removeEventListener('mouseup', soltar);
            document.body.classList.remove('redimensionando');
            const a = leer();
            a[obj] = parseFloat(getComputedStyle(fila).getPropertyValue(VARIABLE[obj]));
            guardar(a);
            estado.cy.resize();
        };
        document.addEventListener('mousemove', mover);
        document.addEventListener('mouseup', soltar);
    });

    document.addEventListener('dblclick', (ev) => {
        const div = ev.target.closest('.divisor');
        if (!div) return;
        const obj = div.dataset.objetivo;
        aplicar(obj, OMISION[obj]);
        const a = leer(); a[obj] = OMISION[obj]; guardar(a);
        estado.cy.resize();
    });
}

/* --- Arranque ------------------------------------------------------------ */
function iniciar() {
    $('#dd-layout').innerHTML = LAYOUTS.map((l) =>
        `<option value="${l}"${l === 'circle' ? ' selected' : ''}>${l}</option>`).join('');
    $('#dd-ejemplo').innerHTML = '<option value="">Elegir ejemplo</option>'
        + Object.entries(EJEMPLOS).map(([k, v]) => `<option value="${k}">${v.nombre}</option>`).join('');
    $('#atajos-velocidad').innerHTML = ATAJOS_VELOCIDAD.map((v) =>
        `<button type="button" data-velocidad="${v}" title="${v} pasos por segundo">${v}</button>`).join('');
    $('#in-velocidad').value = VELOCIDAD_INICIAL;
    $('#pie-credito').href = URL_LICENCIA;
    renderLeyenda();

    estado.cy = cytoscape({
        container: $('#cyto'),
        elements: [],
        style: ESTILOS,
        layout: { name: 'circle' },
    });
    estado.cy.on('tap', 'node', (ev) => {
        $('#dd-origen').value = ev.target.id();
        pintarEstado();
    });

    // --- Eventos de la interfaz ---
    $('#btn-generar').addEventListener('click', generarInstancia);
    $('#btn-ejemplo').addEventListener('click', () => {
        const k = $('#dd-ejemplo').value;
        if (!k) return;
        // Estas instancias traen coordenadas pensadas a mano, así que se
        // fuerza 'preset' para respetarlas.
        cargarGrafo(construirEjemplo(k), { layout: 'preset' });
    });
    $('#dd-ejemplo').addEventListener('change', () => {
        const k = $('#dd-ejemplo').value;
        $('#txt-ejemplo').textContent = k ? EJEMPLOS[k].descripcion : '';
    });
    $('#btn-ejecutar').addEventListener('click', ejecutar);
    $('#dd-algoritmo').addEventListener('change', renderPseudocodigo);
    $('#dd-origen').addEventListener('change', pintarEstado);
    $('#dd-layout').addEventListener('change', () => reconstruirGrafo());
    $('#btn-centrar').addEventListener('click', () => recalcularLayout());
    $('#btn-play').addEventListener('click', alternarPlay);
    $('#btn-siguiente').addEventListener('click', () => controlPaso(1));
    $('#btn-anterior').addEventListener('click', () => controlPaso(-1));
    $('#btn-reiniciar').addEventListener('click', () => controlPaso(null));
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
    $('#pseudocodigo-lineas').addEventListener('click', (ev) => {
        const linea = ev.target.closest('.linea-codigo');
        if (!linea) return;
        const n = Number(linea.dataset.linea);
        if (estado.breakpoints.has(n)) estado.breakpoints.delete(n);
        else estado.breakpoints.add(n);
        resaltarPseudocodigo();
    });
    $('#btn-info-algoritmo').addEventListener('click', () => {
        const info = ALGORITMOS[$('#dd-algoritmo').value];
        if (!info) return;
        $('#modal-info-titulo').textContent = info.nombre;
        $('#modal-info-texto').textContent = info.descripcion;
        $('#modal-info').style.display = 'flex';
    });
    $('#btn-cerrar-info').addEventListener('click', () => { $('#modal-info').style.display = 'none'; });
    $('#btn-guardar').addEventListener('click', () =>
        descargar('grafo.json', JSON.stringify(estado.G.aObjeto(), null, 2)));
    $('#in-cargar').addEventListener('change', (ev) => {
        const archivo = ev.target.files[0];
        if (!archivo) return;
        const lector = new FileReader();
        lector.onload = () => {
            try {
                cargarGrafo(Grafo.desdeObjeto(JSON.parse(lector.result)));
                $('#txt-archivo').textContent = `Cargado: ${archivo.name}`;
            } catch (e) {
                $('#txt-archivo').textContent = `No se pudo leer ${archivo.name}: ${e.message}`;
            }
        };
        lector.readAsText(archivo);
    });
    $('#btn-traza-json').addEventListener('click', () => {
        if (!estado.traza) { $('#txt-traza').textContent = 'No hay traza: ejecuta un algoritmo primero.'; return; }
        descargar(`${estado.algEjecutado}.json`, JSON.stringify(estado.traza, null, 2));
        $('#txt-traza').textContent = `Exportados ${estado.traza.length} pasos en JSON.`;
    });
    $('#btn-traza-csv').addEventListener('click', () => {
        if (!estado.traza) { $('#txt-traza').textContent = 'No hay traza: ejecuta un algoritmo primero.'; return; }
        descargar(`${estado.algEjecutado}.csv`, exportarTrazaCSV(), 'text/csv');
        $('#txt-traza').textContent = `Exportados ${estado.traza.length} pasos en CSV.`;
    });

    activarDivisores();
    window.addEventListener('resize', () => estado.cy.resize());
    generarInstancia();
}

document.addEventListener('DOMContentLoaded', iniciar);
