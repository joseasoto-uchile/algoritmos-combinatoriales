/* Capa de interacción. Es la única que accede al DOM.
 *
 * El cálculo ocurre entero en el navegador: la traza se genera al pulsar
 * Ejecutar y cada paso se reconstruye desde ella, sin peticiones a un
 * servidor.
 */

const LAYOUTS = ['circle', 'breadthfirst', 'grid', 'cose', 'preset'];
const URL_LICENCIA = 'https://github.com/joseasoto-uchile/algoritmos-combinatoriales/blob/main/LICENSE';
const VELOCIDAD_MINIMA = 1, VELOCIDAD_MAXIMA = 100, VELOCIDAD_INICIAL = 5;
const INTERVALO_MINIMO_MS = 16;
const ATAJOS_VELOCIDAD = [1, 5, 15, 50, 100];

const estado = {
    G: null,
    traza: null,
    algEjecutado: null,
    raizEjecutada: null,
    seleccion: null,
    paso: 0,
    reproduciendo: false,
    temporizador: null,
    pasosPorDisparo: 1,
    breakpoints: new Set(),
    cy: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* --- Utilidades de lectura de formulario -------------------------------- */
function entero(valor, defecto) {
    // El 0 es un valor válido del formulario y en JavaScript es falsy, así que
    // el campo vacío se comprueba de forma explícita.
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

/* Rellena un elemento select mediante la API del DOM.
 *
 * Los identificadores de nodo proceden del archivo que carga el usuario y no
 * deben concatenarse dentro de innerHTML: permitiría inyectar HTML. Con
 * textContent el navegador trata el valor como texto.
 */
function llenarDesplegable(select, pares) {
    select.replaceChildren(...pares.map(([valor, etiqueta]) => {
        const op = document.createElement('option');
        op.value = valor;
        op.textContent = etiqueta;
        return op;
    }));
}

/* --- Raíz por omisión ----------------------------------------------------- */
/* Solo la usa Jarník–Prim. Se elige el nodo de mayor grado, que es desde el
 * que el árbol crece con más opciones a la vista en los primeros pasos. */
function raizPorOmision(G) {
    const ids = G.ids;
    if (!ids.length) return null;
    return ids.reduce((mejor, n) => (G.grado(n) > G.grado(mejor) ? n : mejor), ids[0]);
}

/* --- Render del grafo ---------------------------------------------------- */
function elementosActuales() {
    const layout = $('#dd-layout').value;
    // Solo el layout 'preset' utiliza las coordenadas guardadas. Cytoscape
    // aplica las que recibe en cada actualización de elementos, es decir en
    // cada paso de la traza.
    let elementos = grafoAElementos(estado.G, layout === 'preset');
    const info = ALGORITMOS[estado.algEjecutado] || {};
    const raiz = info.usaRaiz ? $('#dd-raiz').value : null;
    if (estado.traza) {
        const paso = Math.max(0, Math.min(estado.paso, estado.traza.length - 1));
        const [cn, ca] = calcularEstado(estado.traza, paso, info, estado.G.ids);
        marcarSeleccion(cn, ca);
        elementos = aplicarClases(elementos, cn, ca, raiz);
        // El valor de D bajo el nodo solo tiene sentido donde existe el vector.
        if (info.panel === 'vectores') {
            elementos = aplicarDistancias(elementos, vectoresDelPaso(paso).D);
        }
    } else {
        elementos = aplicarClases(elementos, new Map(), new Map(), raiz);
    }
    return elementos;
}

/* calcularVectores recorre la traza desde el principio, y un repintado la
 * necesita dos veces: para el grafo y para la tabla. Se guarda la del paso
 * actual. */
let _vectores = { traza: null, paso: -1, valor: null };

function vectoresDelPaso(paso) {
    if (_vectores.traza === estado.traza && _vectores.paso === paso) return _vectores.valor;
    const valor = calcularVectores(estado.traza, paso, estado.G.ids);
    _vectores = { traza: estado.traza, paso, valor };
    return valor;
}

/* Marca las aristas incidentes al nodo elegido en la tabla. Se calcula aparte
 * de la traza: depende de lo que el usuario elige, no del paso. */
function marcarSeleccion(clasesNodo, clasesArista) {
    if (estado.seleccion === null) return;
    const agregar = (m, k, c) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(c); };
    agregar(clasesNodo, estado.seleccion, 'incidente');
    for (const a of estado.G.aristas) {
        if (a.origen !== estado.seleccion && a.destino !== estado.seleccion) continue;
        agregar(clasesArista, idArista(a.origen, a.destino), 'incidente');
        agregar(clasesNodo, a.origen === estado.seleccion ? a.destino : a.origen, 'incidente');
    }
}

/* Cytoscape guarda el tamano del contenedor y solo lo relee con resize(). El
 * ancho de #cyto depende de los divisores laterales y su alto de la ventana,
 * de modo que hay que releerlo antes de encuadrar. */
function recalcularLayout() {
    estado.cy.resize();
    estado.cy.layout({
        name: $('#dd-layout').value || 'circle', fit: true, padding: 30, animate: false,
    }).run();
}

/* Redibuja el estado sin recalcular las posiciones. Cytoscape conserva las
 * coordenadas de los nodos existentes, de modo que solo cambian las clases y
 * las etiquetas. */
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
    pintarPanel();
}

function reconstruirGrafo({ recalcular = true } = {}) {
    estado.cy.elements().remove();
    estado.cy.add(elementosActuales());
    if (recalcular) recalcularLayout();
    actualizarTextoPaso();
    resaltarPseudocodigo();
    pintarPanel();
}

/* --- Panel lateral -------------------------------------------------------- */

/* La columna de la izquierda del pseudocódigo muestra la estructura principal
 * del algoritmo, que es distinta en cada uno: los vectores D y Π por nodo en
 * Jarník–Prim, la lista ordenada de aristas en Kruskal y la arista mínima de
 * cada componente en Borůvka. El registro declara cuál con la clave `panel`.
 *
 * Las tres crecen hacia abajo, donde la columna puede desplazarse, y no hacia
 * los lados, que es lo escaso.
 */
const TITULOS_PANEL = {
    vectores: 'Vectores D y Π',
    aristas: 'Aristas ordenadas',
    componentes: 'Componentes',
};

function pesoDeArista(u, v) {
    const a = estado.G.aristas.find((x) => idArista(x.origen, x.destino) === idArista(u, v));
    return a ? a.peso : null;
}

function pintarPanel() {
    const panel = $('#panel-estado');
    const info = ALGORITMOS[estado.algEjecutado] || {};
    const mostrar = Boolean(info.panel) && Boolean(estado.traza)
        && $('#dd-algoritmo').value === estado.algEjecutado;
    const cambia = panel.hidden === mostrar;
    panel.hidden = !mostrar;
    if (cambia && estado.cy) {
        requestAnimationFrame(() => {
            estado.cy.resize();
            estado.cy.fit(undefined, 30);
        });
    }
    if (!mostrar) return;

    const paso = Math.max(0, Math.min(estado.paso, estado.traza.length - 1));
    const sol = calcularSolucion(estado.traza, paso);
    const componentes = componentesDe(estado.G.ids, sol.aristas);
    const faltan = estado.G.ids.length - 1;

    $('#titulo-estado').textContent = TITULOS_PANEL[info.panel] || 'Estado';
    // El recuento va delante: la línea se recorta por el final.
    $('#txt-resumen').textContent =
        `F: ${sol.aristas.length} de ${faltan} aristas, peso ${sol.peso}`;
    $('#txt-componentes').textContent = textoComponentes(componentes);

    if (info.panel === 'vectores') panelVectores(paso, componentes);
    else if (info.panel === 'aristas') panelAristas(paso);
    else panelComponentes(paso, componentes);
}

/* Clases de una fila de nodo, comunes a los paneles que llevan nodos. */
function clasesDeNodo(id, v, incidentes) {
    const c = [];
    if (v && v.cerrados.has(id)) c.push('cerrado');
    if (incidentes.has(id)) c.push('incidente');
    if (v && id === v.activo) c.push('activo');
    if (v && id === v.destino) c.push('destino');
    return c.join(' ');
}

function nodosIncidentes() {
    const incidentes = new Set();
    if (estado.seleccion === null) return incidentes;
    incidentes.add(estado.seleccion);
    for (const a of estado.G.aristas) {
        if (a.origen === estado.seleccion) incidentes.add(a.destino);
        else if (a.destino === estado.seleccion) incidentes.add(a.origen);
    }
    return incidentes;
}

/* Una fila por nodo y una columna por vector. */
function panelVectores(paso) {
    const v = vectoresDelPaso(paso);
    const ids = estado.G.ids;
    const incidentes = nodosIncidentes();
    const cuales = ['D', 'Π'];

    const thead = document.createElement('thead');
    const filaEnc = document.createElement('tr');
    const esquina = document.createElement('th');
    esquina.className = 'esquina';
    esquina.textContent = 'v';
    filaEnc.append(esquina);
    for (const nombre of cuales) {
        const th = document.createElement('th');
        th.textContent = nombre;
        filaEnc.append(th);
    }
    thead.append(filaEnc);

    const FILAS = { 'D': [v.D, '∞'], 'Π': [v.Pi, '⊥'] };
    const tbody = document.createElement('tbody');
    for (const id of ids) {
        const clases = clasesDeNodo(id, v, incidentes);
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.textContent = id;
        th.className = ['fila-nodo', clases].filter(Boolean).join(' ');
        th.dataset.nodo = id;
        th.title = `Aristas incidentes a ${id}`;
        tr.append(th);
        for (const nombre of cuales) {
            const [mapa, vacio] = FILAS[nombre];
            const td = document.createElement('td');
            const valor = mapa.get(id);
            const indefinido = valor === undefined || valor === null || valor === Infinity;
            td.textContent = v.inicializado ? (indefinido ? vacio : String(valor)) : '';
            td.className = [clases, v.inicializado && indefinido ? 'indefinido' : '']
                .filter(Boolean).join(' ');
            tr.append(td);
        }
        tbody.append(tr);
    }
    $('#tabla-estado').replaceChildren(thead, tbody);
    textoDetalleNodo(v);
}

/* La lista de Kruskal, en el orden en que la recorre. Lo rechazado queda
 * tachado en su sitio, de modo que se ve el recorrido completo. */
function panelAristas(paso) {
    const datos = calcularAristas(estado.traza, paso);
    const thead = document.createElement('thead');
    const filaEnc = document.createElement('tr');
    for (const [texto, clase] of [['e', 'esquina'], ['w', ''], ['', '']]) {
        const th = document.createElement('th');
        th.textContent = texto;
        if (clase) th.className = clase;
        filaEnc.append(th);
    }
    thead.append(filaEnc);

    const MARCA = { aceptada: '∈ F', rechazada: 'ciclo', actual: '?', pendiente: '' };
    const tbody = document.createElement('tbody');
    let filaActual = null;
    datos.filas.forEach((f, i) => {
        const tr = document.createElement('tr');
        tr.className = `arista-${f.estado}`;
        const th = document.createElement('th');
        th.textContent = `${f.u} — ${f.v}`;
        th.className = 'fila-nodo';
        const tdPeso = document.createElement('td');
        tdPeso.textContent = String(pesoDeArista(f.u, f.v));
        const tdMarca = document.createElement('td');
        tdMarca.textContent = MARCA[f.estado];
        tr.append(th, tdPeso, tdMarca);
        tbody.append(tr);
        if (i === datos.actual) filaActual = tr;
    });
    $('#tabla-estado').replaceChildren(thead, tbody);

    // La lista completa no cabe: se desplaza para dejar a la vista la arista en
    // examen y las que vienen detrás.
    if (filaActual) {
        const caja = document.querySelector('.estructura-envoltura');
        const dy = filaActual.offsetTop - caja.scrollTop;
        if (dy < 0 || dy > caja.clientHeight - filaActual.offsetHeight) {
            caja.scrollTop = filaActual.offsetTop - caja.clientHeight / 2;
        }
    }

    const cuenta = (e) => datos.filas.filter((f) => f.estado === e).length;
    const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
    $('#txt-detalle').textContent =
        `${plural(cuenta('aceptada'), 'aceptada', 'aceptadas')}, `
        + `${plural(cuenta('rechazada'), 'rechazada', 'rechazadas')}, `
        + `${cuenta('pendiente') + cuenta('actual')} por revisar.`;
}

/* Una fila por componente de (V, F), con la arista mínima que ha elegido en la
 * fase en curso. */
function panelComponentes(paso, componentes) {
    const { elecciones, enExamen } = calcularComponentesFase(estado.traza, paso);
    const incidentes = nodosIncidentes();

    const thead = document.createElement('thead');
    const filaEnc = document.createElement('tr');
    for (const [texto, clase] of [['K', 'esquina'], ['e_K', ''], ['w', '']]) {
        const th = document.createElement('th');
        th.textContent = texto;
        if (clase) th.className = clase;
        filaEnc.append(th);
    }
    thead.append(filaEnc);

    const tbody = document.createElement('tbody');
    for (const [rep, nodos] of agruparComponentes(componentes)) {
        const elegida = elecciones.get(rep);
        const tr = document.createElement('tr');
        if (rep === enExamen) tr.className = 'comp-en-examen';
        else if (elegida) tr.className = 'comp-elegida';
        const th = document.createElement('th');
        th.textContent = `{${nodos.join(',')}}`;
        th.className = ['fila-nodo', nodos.some((n) => incidentes.has(n)) ? 'incidente' : '']
            .filter(Boolean).join(' ');
        th.dataset.nodo = rep;
        th.title = `Aristas incidentes a ${rep}`;
        const tdArista = document.createElement('td');
        tdArista.textContent = elegida ? `${elegida.u} — ${elegida.v}`
            : (rep === enExamen ? '…' : '⊥');
        const tdPeso = document.createElement('td');
        tdPeso.textContent = elegida ? String(elegida.peso) : '';
        tr.append(th, tdArista, tdPeso);
        tbody.append(tr);
    }
    $('#tabla-estado').replaceChildren(thead, tbody);

    const aux = [...new Set([...elecciones.values()].map((e) => `${e.u}—${e.v}`))];
    $('#txt-detalle').textContent = aux.length
        ? `Aux = {${aux.join(', ')}}`
        : 'Aux = ∅. Ninguna componente ha elegido todavía.';
}

/* Aristas incidentes al nodo elegido en la tabla, con sus pesos. */
function textoDetalleNodo(v) {
    const salida = $('#txt-detalle');
    const b = estado.seleccion;
    if (b === null) {
        salida.textContent = 'Pulsa un nodo de la tabla para ver sus aristas incidentes.';
        return;
    }
    const incidentes = estado.G.aristas.filter((a) => a.origen === b || a.destino === b);
    if (!incidentes.length) { salida.textContent = `${b} no tiene aristas incidentes.`; return; }
    const val = (x) => (x === Infinity || x === undefined ? '∞' : String(x));
    const terminos = incidentes.map((a) => {
        const otro = a.origen === b ? a.destino : a.origen;
        return `w(${b}${otro}) = ${a.peso}`;
    });
    salida.textContent = `D[${b}] = ${val(v.D.get(b))}  ←  mín { ${terminos.join(',  ')} }`;
}

function actualizarTextoPaso() {
    const t = $('#txt-paso');
    const it = $('#txt-fase');
    if (!estado.traza) {
        t.textContent = 'Sin traza. Ejecuta un algoritmo.';
        it.textContent = '';
        return;
    }
    const paso = Math.max(0, Math.min(estado.paso, estado.traza.length - 1));
    t.textContent = `Paso ${paso + 1}/${estado.traza.length}: ${estado.traza[paso].tipo}`;
    it.textContent = textoFase(calcularFase(estado.traza, paso));
}

/* --- Instancias ---------------------------------------------------------- */
function cargarGrafo(G, { layout = null } = {}) {
    estado.G = G;
    estado.traza = null;
    estado.algEjecutado = null;
    estado.raizEjecutada = null;
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
            pesoMin: entero($('#in-peso-min').value, 1),
            pesoMax: entero($('#in-peso-max').value, 10),
            permitirNegativos: banderas.has('negativos'),
            semilla: $('#in-seed').value === '' ? null : entero($('#in-seed').value, 0),
        });
        err.textContent = '';
        err.className = '';
        cargarGrafo(G);
    } catch (e) {
        // Con parámetros incoherentes se muestra el motivo y se conserva el
        // grafo anterior.
        err.textContent = e.message;
        err.className = 'txt-error';
    }
}

/* --- Algoritmos ---------------------------------------------------------- */
/* La raíz solo interviene en Jarník–Prim. En los otros dos el desplegable
 * queda desactivado en lugar de desaparecer, para que la barra no cambie de
 * alto al cambiar de algoritmo. */
function ajustarRaiz() {
    const info = ALGORITMOS[$('#dd-algoritmo').value] || {};
    $('#dd-raiz').disabled = !info.usaRaiz;
    $('#txt-raiz').textContent = info.usaRaiz
        ? 'También puedes hacer clic en un nodo del grafo para elegirlo como raíz.'
        : `${info.nombre || 'Este algoritmo'} no parte de una raíz: la elige el propio algoritmo.`;
}

function actualizarOpciones() {
    const estados = estadoAlgoritmos(estado.G);
    const disponibles = estados.filter((e) => e.disponible);
    const sel = $('#dd-algoritmo');
    const previo = sel.value;
    // La lista muestra siempre todos los algoritmos. Los que no aplican a esta
    // instancia quedan desactivados con el motivo, en lugar de desaparecer.
    sel.replaceChildren(...estados.map((e) => {
        const op = document.createElement('option');
        op.value = e.id;
        op.textContent = e.nombre;
        op.disabled = !e.disponible;
        if (e.motivo) op.title = e.motivo;
        return op;
    }));
    // Conserva el algoritmo elegido si el grafo nuevo también lo admite.
    sel.value = disponibles.some((e) => e.id === previo) ? previo : (disponibles[0]?.id ?? '');

    const raiz = $('#dd-raiz');
    llenarDesplegable(raiz, estado.G.ids.map((n) => [n, n]));
    raiz.value = raizPorOmision(estado.G);

    // La selección se olvida: los nodos pueden ser otros.
    estado.seleccion = null;
    ajustarRaiz();
    renderPseudocodigo();
}

function ejecutar() {
    const algId = $('#dd-algoritmo').value;
    const salida = $('#txt-resultado');
    if (!algId) return;
    const info = ALGORITMOS[algId];
    // Kruskal y Borůvka no reciben raíz: recorren el grafo entero.
    const raiz = info.usaRaiz ? $('#dd-raiz').value : null;
    try {
        const [, traza] = info.usaRaiz ? info.funcion(estado.G, raiz) : info.funcion(estado.G);
        estado.traza = traza;
        estado.algEjecutado = algId;
        estado.raizEjecutada = raiz;
        estado.paso = 0;
        pausar();
        salida.textContent = (info.usaRaiz ? `${info.nombre} desde ${raiz}` : info.nombre)
            + `, ${traza.length} pasos de traza.`;
        salida.className = 'txt-estado';
        pintarEstado();
        // La animación empieza sin necesidad de pulsar reproducir.
        reproducir();
    } catch (e) {
        // En caso de error no se modifica la reproducción en curso.
        salida.textContent = `Error: ${e.message}`;
        salida.className = 'txt-error';
    }
}

/* --- Reproducción -------------------------------------------------------- */
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
    if (estado.temporizador) { clearInterval(estado.temporizador); estado.temporizador = null; }
    $('#btn-play').textContent = '▶';
}

function reproducir() {
    if (!estado.traza || estado.traza.length < 2) return;
    // Con la traza terminada se vuelve al principio.
    if (estado.paso >= estado.traza.length - 1) estado.paso = 0;
    estado.reproduciendo = true;
    $('#btn-play').textContent = '⏸';
    // Al reproducir, la columna de la izquierda deja de hacer falta y su ancho
    // pasa al grafo. El botón de la barra la devuelve.
    aplicarPlegado(true);
    arrancarTemporizador();
}

/* Reproducir ejecuta el algoritmo si aun no hay traza, o si el algoritmo o la
 * raiz cambiaron desde la ultima ejecucion. */
function alternarPlay() {
    const info = ALGORITMOS[$('#dd-algoritmo').value] || {};
    const desactualizada = !estado.traza
        || estado.algEjecutado !== $('#dd-algoritmo').value
        || estado.raizEjecutada !== (info.usaRaiz ? $('#dd-raiz').value : null);
    if (desactualizada) { ejecutar(); return; }
    if (estado.reproduciendo) pausar();
    else reproducir();
}

function avanzarAutomatico() {
    if (!estado.traza) { pausar(); return; }
    for (let j = 0; j < estado.pasosPorDisparo; j++) {
        estado.paso += 1;
        if (estado.paso >= estado.traza.length - 1) {
            estado.paso = estado.traza.length - 1;
            pausar();
            break;
        }
        // Punto de interrupción. La reproducción se detiene con el paso
        // visible, y se comprueba en cada paso intermedio del disparo.
        if (lineasDelPaso(estado.traza[estado.paso]).some((n) => estado.breakpoints.has(n))) {
            pausar();
            break;
        }
    }
    pintarEstado();
}

/* Salta al comienzo de la fase siguiente de Borůvka, o al final de la traza si
 * ya es la última. Las fases son la unidad natural del algoritmo y recorrerlas
 * paso a paso es largo. */
function saltarFase() {
    if (!estado.traza) return;
    if (estado.reproduciendo) pausar();
    const desde = Math.min(estado.paso, estado.traza.length - 1);
    const j = estado.traza.findIndex((ev, i) => i > desde && ev.tipo === 'inicio_fase');
    estado.paso = j === -1 ? estado.traza.length - 1 : j;
    pintarEstado();
}

function controlPaso(delta) {
    if (!estado.traza) return;
    // Un control manual detiene la reproducción y deja el paso elegido fijo.
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
    $('#pseudocodigo-titulo').textContent = `Pseudocódigo: ${info.nombre}`;
    $('#pseudocodigo-complejidad').innerHTML =
        `<span class="insignia-complejidad">${info.complejidad}</span>`;
    // Los puntos de interrupción son propios de cada algoritmo.
    estado.breakpoints.clear();
    $('#pseudocodigo-lineas').innerHTML = info.pseudocodigo.map((texto, i) =>
        `<div class="linea-codigo" data-linea="${i + 1}">`
        + `<span class="num-linea">${String(i + 1).padStart(2, ' ')}</span> `
        + `${texto.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`).join('');
    resaltarPseudocodigo();
}

/* Un paso puede ejecutar más de una línea, como la relajación, que asigna D y
 * Π. El campo llega entonces como lista. */
function lineasDelPaso(ev) {
    if (Array.isArray(ev.linea)) return ev.linea;
    return ev.linea === undefined ? [] : [ev.linea];
}

function resaltarPseudocodigo() {
    let activas = [];
    // Solo se resalta si la traza corresponde al algoritmo mostrado. Al
    // cambiar el desplegable sin volver a ejecutar, no se corresponden.
    if (estado.traza && $('#dd-algoritmo').value === estado.algEjecutado) {
        const p = Math.max(0, Math.min(estado.paso, estado.traza.length - 1));
        activas = lineasDelPaso(estado.traza[p]);
    }
    $$('#pseudocodigo-lineas .linea-codigo').forEach((el) => {
        const n = Number(el.dataset.linea);
        el.classList.toggle('linea-breakpoint', estado.breakpoints.has(n));
        el.classList.toggle('linea-activa', activas.includes(n));
    });
}

/* --- Archivo ------------------------------------------------------------- */
/* El objeto URL se libera en el siguiente ciclo de eventos, ya empezada la
 * descarga. */
function descargar(nombre, contenido, tipo = 'application/json') {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportarTrazaCSV() {
    // La traza es heterogénea: cada tipo de evento tiene campos distintos. El
    // encabezado es la unión de todas las claves.
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
        + '<span class="muestra-dist">D=7</span></span>'
        + '<span class="leyenda-nombre">Etiqueta</span>'
        + '<span class="leyenda-detalle">: nombre del nodo arriba y, en Jarník–Prim, el valor de D abajo. El símbolo de infinito indica que ninguna arista lo une todavía con U.</span>'
        + `</div>${muestras}`;
}

/* --- Columna de controles plegable ---------------------------------------- */

/* El estado se guarda: quien trabaja con la columna plegada la encuentra igual
 * al volver. */
const CLAVE_PLEGADO = 'grafos:controles-plegados';

function aplicarPlegado(plegados) {
    const fila = document.querySelector('.fila-principal');
    if (fila.classList.contains('controles-plegados') === plegados) return;
    fila.classList.toggle('controles-plegados', plegados);
    $('#flecha-plegar').textContent = plegados ? '⯈' : '⯇';
    $('#btn-plegar').setAttribute('aria-expanded', String(!plegados));
    // El ancho de #cyto cambia. Se reencuadra la vista en el cuadro siguiente,
    // cuando el navegador ya midió la página, y sin volver a correr el layout,
    // que movería los nodos.
    if (estado.cy) {
        requestAnimationFrame(() => {
            estado.cy.resize();
            estado.cy.fit(undefined, 30);
        });
    }
}

/* La leyenda recuerda si quedo abierta o cerrada. */
const CLAVE_LEYENDA = 'grafos:leyenda-abierta';

function activarLeyenda() {
    const d = document.querySelector('.leyenda');
    try {
        const guardado = localStorage.getItem(CLAVE_LEYENDA);
        if (guardado !== null) d.open = guardado === '1';
    } catch { /* deshabilitado */ }
    d.addEventListener('toggle', () => {
        try { localStorage.setItem(CLAVE_LEYENDA, d.open ? '1' : '0'); } catch { /* deshabilitado */ }
    });
}

function activarPlegado() {
    let plegados = false;
    try { plegados = localStorage.getItem(CLAVE_PLEGADO) === '1'; } catch { /* deshabilitado */ }
    aplicarPlegado(plegados);
    $('#btn-plegar').addEventListener('click', () => {
        const ahora = !document.querySelector('.fila-principal').classList.contains('controles-plegados');
        aplicarPlegado(ahora);
        try { localStorage.setItem(CLAVE_PLEGADO, ahora ? '1' : '0'); } catch { /* deshabilitado */ }
    });
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
        // La columna de código está a la derecha del divisor, de modo que
        // aumenta cuando el puntero se desplaza hacia la izquierda. Por eso se
        // invierte el signo.
        const signo = obj === 'codigo' ? -1 : 1;
        document.body.classList.add('redimensionando');

        const mover = (e) => aplicar(obj, inicial + signo * (e.clientX - x0));
        const soltar = () => {
            document.removeEventListener('mousemove', mover);
            document.removeEventListener('mouseup', soltar);
            document.body.classList.remove('redimensionando');
            const a = leer();
            a[obj] = parseFloat(getComputedStyle(fila).getPropertyValue(VARIABLE[obj]));
            guardar(a);
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
    });
}

/* --- Arranque ------------------------------------------------------------ */
function iniciar() {
    // Estos tres se rellenan con constantes del código. Se construyen con la
    // API del DOM para mantener un solo patrón en el archivo.
    llenarDesplegable($('#dd-layout'), LAYOUTS.map((l) => [l, l]));
    $('#dd-layout').value = 'circle';
    llenarDesplegable($('#dd-ejemplo'), [
        ['', 'Elegir ejemplo'],
        ...Object.entries(EJEMPLOS).map(([k, v]) => [k, v.nombre]),
    ]);
    $('#atajos-velocidad').replaceChildren(...ATAJOS_VELOCIDAD.map((v) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.velocidad = v;
        b.title = `${v} pasos por segundo`;
        b.textContent = v;
        return b;
    }));
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
        // Solo Jarník–Prim usa una raíz; en los otros el clic no cambia nada.
        if ($('#dd-raiz').disabled) return;
        $('#dd-raiz').value = ev.target.id();
        pintarEstado();
    });

    // --- Eventos de la interfaz ---
    $('#btn-generar').addEventListener('click', generarInstancia);
    $('#btn-ejemplo').addEventListener('click', () => {
        const k = $('#dd-ejemplo').value;
        if (!k) return;
        // Estas instancias definen coordenadas explícitas, por lo que se
        // fuerza el layout 'preset'.
        cargarGrafo(construirEjemplo(k), { layout: 'preset' });
    });
    $('#dd-ejemplo').addEventListener('change', () => {
        const k = $('#dd-ejemplo').value;
        $('#txt-ejemplo').textContent = k ? EJEMPLOS[k].descripcion : '';
    });
    $('#btn-ejecutar').addEventListener('click', ejecutar);
    $('#dd-algoritmo').addEventListener('change', () => {
        ajustarRaiz();
        renderPseudocodigo();
        pintarPanel();
    });
    // La celda del nodo marca sus aristas incidentes. Volver a pulsarla quita
    // la marca.
    $('#tabla-estado').addEventListener('click', (ev) => {
        const th = ev.target.closest('th[data-nodo]');
        if (!th) return;
        estado.seleccion = estado.seleccion === th.dataset.nodo ? null : th.dataset.nodo;
        pintarEstado();
    });
    $('#dd-raiz').addEventListener('change', pintarEstado);
    $('#dd-layout').addEventListener('change', () => reconstruirGrafo());
    $('#btn-centrar').addEventListener('click', () => recalcularLayout());
    $('#btn-play').addEventListener('click', alternarPlay);
    $('#btn-siguiente').addEventListener('click', () => controlPaso(1));
    $('#btn-fase').addEventListener('click', saltarFase);
    $('#btn-anterior').addEventListener('click', () => controlPaso(-1));
    $('#btn-reiniciar').addEventListener('click', () => controlPaso(null));
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
            const salida = $('#txt-archivo');
            try {
                cargarGrafo(Grafo.desdeObjeto(JSON.parse(lector.result)));
                salida.textContent = `Cargado: ${archivo.name}`;
                salida.className = 'txt-estado';
            } catch (e) {
                // El mensaje de error se muestra en rojo, con el motivo.
                salida.textContent = e instanceof SyntaxError
                    ? `JSON inválido: ${archivo.name} no es un archivo JSON bien formado.`
                    : e.message;
                salida.className = 'txt-error';
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
    // El tamano de #cyto cambia con la ventana y con los divisores laterales.
    // Un observador cubre las dos vias.
    new ResizeObserver(() => estado.cy.resize()).observe($('#cyto'));
    activarPlegado();
    activarLeyenda();
    iniciarEditor();
    $('#btn-editar').addEventListener('click', () => {
        const salida = $('#txt-editar');
        salida.textContent = '';
        salida.className = 'txt-estado';
        pausar();
        abrirEditor(estado.G, (G) => {
            cargarGrafo(G);
            salida.textContent = `Instancia editada: ${G.ids.length} nodos, `
                + `${G.aristas.length} aristas.`;
            salida.className = 'txt-estado';
        });
    });
    generarInstancia();
    // En DOMContentLoaded el navegador aun no ha fijado el alto definitivo de
    // #cyto, de modo que el primer encuadre se repite ya con la pagina medida.
    requestAnimationFrame(recalcularLayout);
}

document.addEventListener('DOMContentLoaded', iniciar);
