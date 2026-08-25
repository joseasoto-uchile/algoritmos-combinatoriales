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
    origenEjecutado: null,
    destino: null,
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

/* --- Origen por omisión -------------------------------------------------- */
function origenPorOmision(G) {
    const ids = G.ids;
    if (!ids.length) return null;
    // Se elige el nodo con mayor grado de salida. La opción "conexo" solo
    // garantiza conexidad débil, de modo que el primer nodo puede no tener
    // arcos salientes y producir un recorrido de tres pasos.
    return ids.reduce((mejor, n) => (G.gradoSalida(n) > G.gradoSalida(mejor) ? n : mejor), ids[0]);
}

/* --- Render del grafo ---------------------------------------------------- */
function elementosActuales() {
    const layout = $('#dd-layout').value;
    // Solo el layout 'preset' utiliza las coordenadas guardadas. Cytoscape
    // aplica las que recibe en cada actualización de elementos, es decir en
    // cada paso de la traza.
    let elementos = grafoAElementos(estado.G, layout === 'preset');
    if (estado.traza) {
        const paso = Math.max(0, Math.min(estado.paso, estado.traza.length - 1));
        const info = ALGORITMOS[estado.algEjecutado] || {};
        const [cn, ca] = calcularEstado(estado.traza, paso, Boolean(info.aristasNoSeRevisitan));
        marcarCaminoYSeleccion(cn, ca, paso);
        elementos = aplicarClases(elementos, cn, ca, $('#dd-origen').value);
        const d = calcularDistancias(estado.traza, paso);
        if (d !== null) elementos = aplicarDistancias(elementos, d);
    } else {
        elementos = aplicarClases(elementos, new Map(), new Map(), $('#dd-origen').value);
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

/* Anade al dibujo el camino hasta el destino elegido y los arcos que entran al
 * nodo seleccionado. Se calculan aparte de la traza: dependen de lo que el
 * usuario elige, no del paso. */
function marcarCaminoYSeleccion(clasesNodo, clasesArista, paso) {
    const agregar = (m, k, c) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(c); };
    const v = vectoresDelPaso(paso);
    if (v === null) return;

    if (estado.destino !== null) {
        const { camino, ciclo } = reconstruirCamino(v.Pi, estado.destino, $('#dd-origen').value);
        if (camino) {
            camino.forEach((n) => agregar(clasesNodo, n, 'camino'));
            for (let j = 0; j + 1 < camino.length; j++) {
                agregar(clasesArista, idArista(camino[j], camino[j + 1]), 'camino');
            }
        } else if (ciclo) {
            ciclo.forEach((n) => agregar(clasesNodo, n, 'ciclo'));
            for (const [u, w] of arcosDelCiclo(ciclo)) {
                agregar(clasesArista, idArista(u, w), 'ciclo');
            }
        }
    }

    if (estado.seleccion !== null) {
        agregar(clasesNodo, estado.seleccion, 'entrante');
        for (const a of estado.G.aristas) {
            if (a.destino !== estado.seleccion) continue;
            agregar(clasesArista, idArista(a.origen, a.destino), 'entrante');
            agregar(clasesNodo, a.origen, 'entrante');
        }
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
    pintarVectores();
}

function reconstruirGrafo({ recalcular = true } = {}) {
    estado.cy.elements().remove();
    estado.cy.add(elementosActuales());
    if (recalcular) recalcularLayout();
    actualizarTextoPaso();
    resaltarPseudocodigo();
    pintarVectores();
}

/* --- Vectores D y Pi ------------------------------------------------------ */

/* Una fila por vector, una columna por nodo. Se reconstruyen desde la traza en
 * cada paso, igual que las clases del grafo. Cada algoritmo declara en el
 * registro qué vectores mantiene: DFS no calcula distancias, solo el padre. */
function pintarVectores() {
    const panel = $('#panel-vectores');
    const info = ALGORITMOS[estado.algEjecutado] || {};
    const cuales = info.vectores || [];
    const mostrar = cuales.length > 0 && estado.traza
        && $('#dd-algoritmo').value === estado.algEjecutado;
    // Aparecer o desaparecer cambia el alto de #cyto. Se reencuadra la vista en
    // el cuadro siguiente, sin volver a correr el layout, que movería los nodos.
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
    const v = vectoresDelPaso(paso);

    const ids = estado.G.ids;
    const reconstruccion = estado.destino === null ? {}
        : reconstruirCamino(v.Pi, estado.destino, $('#dd-origen').value);
    const enCamino = new Set(reconstruccion.camino || []);
    const enCiclo = new Set(reconstruccion.ciclo || []);
    const entrantes = new Set();
    if (estado.seleccion !== null) {
        entrantes.add(estado.seleccion);
        for (const a of estado.G.aristas) {
            if (a.destino === estado.seleccion) entrantes.add(a.origen);
        }
    }

    const clasesDe = (id) => {
        const c = [];
        if (v.cerrados.has(id)) c.push('cerrado');
        if (v.sinMinimo.has(id)) c.push('sin-minimo');
        if (enCamino.has(id)) c.push('camino');
        if (enCiclo.has(id)) c.push('ciclo');
        if (entrantes.has(id)) c.push('entrante');
        if (id === v.activo) c.push('activo');
        if (id === v.destino) c.push('destino');
        return c.join(' ');
    };

    const thead = document.createElement('thead');
    const filaEnc = document.createElement('tr');
    const esquina = document.createElement('th');
    esquina.className = 'esquina';
    esquina.textContent = 'v';
    filaEnc.append(esquina);
    for (const id of ids) {
        const th = document.createElement('th');
        th.textContent = id;
        th.className = clasesDe(id);
        th.dataset.nodo = id;
        th.title = `Arcos que entran a ${id}`;
        filaEnc.append(th);
    }
    thead.append(filaEnc);

    const FILAS = { 'D': [v.D, '∞'], 'Π': [v.Pi, '⊥'] };
    const tbody = document.createElement('tbody');
    for (const nombre of cuales) {
        const [mapa, vacio] = FILAS[nombre];
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.textContent = nombre;
        th.className = 'fila-nombre';
        tr.append(th);
        for (const id of ids) {
            const td = document.createElement('td');
            const valor = mapa.get(id);
            const indefinido = valor === undefined || valor === null || valor === Infinity;
            // Sin distancia mínima definida no se muestra el valor de la última
            // pasada, que no es una respuesta.
            let texto;
            if (!v.inicializado) texto = '';
            else if (v.sinMinimo.has(id)) texto = nombre === 'D' ? '−∞' : vacio;
            else texto = indefinido ? vacio : String(valor);
            td.textContent = texto;
            td.className = [clasesDe(id),
                v.inicializado && indefinido && !v.sinMinimo.has(id) ? 'indefinido' : '']
                .filter(Boolean).join(' ');
            tr.append(td);
        }
        tbody.append(tr);
    }
    $('#tabla-vectores').replaceChildren(thead, tbody);

    // Un destino elegido es una pregunta concreta y su respuesta manda sobre
    // el estado general del conjunto de nodos cerrados.
    const lista = [...v.cerrados];
    let texto = '';
    if (estado.destino !== null) {
        texto = textoCamino(reconstruccion, v);
    } else if (v.sinMinimo.size) {
        texto = `Sin distancia mínima definida: ${[...v.sinMinimo].join(', ')}. `
            + 'Son alcanzables desde un ciclo de peso negativo.';
    } else if (v.interrumpido) {
        texto = `${info.nombreCerrados} = {${lista.join(', ')}}. El ciclo se interrumpió: `
            + 'los nodos que faltan son inalcanzables.';
    } else if (info.nombreCerrados) {
        // El recuento va delante porque es lo que sobrevive al recorte cuando
        // la lista no cabe en la línea.
        texto = `${lista.length} de ${ids.length} nodos. `
            + `${info.nombreCerrados} = {${lista.join(', ')}}`;
    }
    $('#txt-vectores').textContent = texto;
    actualizarTextoSeleccion(v);
}

/* Camino reconstruido y su largo, el ciclo encontrado, o el motivo de que no
 * haya ninguno de los dos. */
function textoCamino({ camino, ciclo }, v) {
    const t = estado.destino;
    if (camino) {
        const d = v.D.get(t);
        const largo = d === undefined || d === Infinity ? '' : `  (largo ${d})`;
        return `Camino a ${t}:  ${camino.join(' → ')}${largo}`;
    }
    if (ciclo) {
        const peso = arcosDelCiclo(ciclo).reduce((suma, [u, w]) => {
            const a = estado.G.aristas.find((x) => x.origen === u && x.destino === w);
            return suma + (a ? a.peso : 0);
        }, 0);
        const cerrado = [...ciclo].reverse();
        return `Π forma un ciclo desde ${t}:  ${cerrado.join(' → ')} → ${cerrado[0]}`
            + `  (peso ${peso})`;
    }
    if (v.sinMinimo.has(t)) {
        return `${t} no tiene camino mínimo definido: es alcanzable desde un ciclo `
            + 'de peso negativo.';
    }
    return `Todavía no hay camino del origen a ${t}.`;
}

/* Expresion del minimo para el nodo seleccionado, con los valores del paso. */
function actualizarTextoSeleccion(v) {
    const salida = $('#txt-seleccion');
    const b = estado.seleccion;
    if (b === null) {
        salida.textContent = 'Pulsa una columna para ver los arcos que entran a ese nodo.';
        return;
    }
    const entrantes = estado.G.aristas.filter((a) => a.destino === b);
    if (!entrantes.length) {
        salida.textContent = `A ${b} no entra ningún arco.`;
        return;
    }
    const val = (x) => (x === Infinity || x === undefined ? '∞' : String(x));
    const terminos = entrantes.map((a) => {
        const signo = a.peso < 0 ? ' - ' : ' + ';
        return `D[${a.origen}]${signo}${Math.abs(a.peso)} = ${val(v.D.get(a.origen) === Infinity
            ? Infinity : v.D.get(a.origen) + a.peso)}`;
    });
    salida.textContent = `D[${b}] = ${val(v.D.get(b))}  ←  mín { ${terminos.join(',  ')} }`;
}

function actualizarTextoPaso() {
    const t = $('#txt-paso');
    const it = $('#txt-iteracion');
    if (!estado.traza) {
        t.textContent = 'Sin traza. Ejecuta un algoritmo.';
        it.textContent = '';
        return;
    }
    const paso = Math.max(0, Math.min(estado.paso, estado.traza.length - 1));
    t.textContent = `Paso ${paso + 1}/${estado.traza.length}: ${estado.traza[paso].tipo}`;
    it.textContent = textoIteracion(calcularIteracion(estado.traza, paso));
}

/* --- Instancias ---------------------------------------------------------- */
function cargarGrafo(G, { layout = null } = {}) {
    estado.G = G;
    estado.traza = null;
    estado.algEjecutado = null;
    estado.origenEjecutado = null;
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
        // Con parámetros incoherentes se muestra el motivo y se conserva el
        // grafo anterior.
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

    const origen = $('#dd-origen');
    llenarDesplegable(origen, estado.G.ids.map((n) => [n, n]));
    origen.value = origenPorOmision(estado.G);

    // El camino y la selección se olvidan: los nodos pueden ser otros.
    llenarDesplegable($('#dd-destino'), [['', 'ninguno'], ...estado.G.ids.map((n) => [n, n])]);
    estado.destino = null;
    estado.seleccion = null;

    const noDisp = estados.filter((e) => !e.disponible);
    $('#lista-no-disponibles').innerHTML = noDisp.length
        ? `<div>No aplican a este grafo:</div>${noDisp.map((e) =>
            `<div class="item-no-disponible"><span class="nombre-no-disponible">${e.nombre}</span>`
            + `<span>: ${e.motivo}</span></div>`).join('')}`
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
        estado.origenEjecutado = origen;
        estado.paso = 0;
        pausar();
        salida.textContent = `${info.nombre} desde ${origen}, ${traza.length} pasos de traza.`;
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
    arrancarTemporizador();
}

/* Reproducir ejecuta el algoritmo si aun no hay traza, o si el algoritmo o el
 * origen cambiaron desde la ultima ejecucion. */
function alternarPlay() {
    const desactualizada = !estado.traza
        || estado.algEjecutado !== $('#dd-algoritmo').value
        || estado.origenEjecutado !== $('#dd-origen').value;
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
        // visible, lo que permite examinar el estado del grafo. Se comprueba
        // en cada paso intermedio del disparo.
        if (lineasDelPaso(estado.traza[estado.paso]).some((n) => estado.breakpoints.has(n))) {
            pausar();
            break;
        }
    }
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
/* El objeto URL se libera en el siguiente ciclo de eventos. Revocarlo en la
 * misma vuelta deja la descarga dependiendo de que el navegador capture el
 * blob de forma sincrona al pulsar. */
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
        + '<span class="muestra-dist">d=7</span></span>'
        + '<span class="leyenda-nombre">Etiqueta</span>'
        + '<span class="leyenda-detalle">: nombre del nodo arriba, distancia actual abajo. El símbolo de infinito indica que el nodo no se ha alcanzado.</span>'
        + `</div>${muestras}`;
}

/* --- Columna de controles plegable ---------------------------------------- */

/* El estado se guarda: quien trabaja con la columna plegada la encuentra igual
 * al volver. */
const CLAVE_PLEGADO = 'grafos:controles-plegados';

function aplicarPlegado(plegados) {
    document.querySelector('.fila-principal').classList.toggle('controles-plegados', plegados);
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
    // Abierta salvo que se haya cerrado antes.
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
        $('#dd-origen').value = ev.target.id();
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
    $('#dd-algoritmo').addEventListener('change', renderPseudocodigo);
    $('#dd-destino').addEventListener('change', () => {
        estado.destino = $('#dd-destino').value || null;
        pintarEstado();
    });
    // La cabecera de una columna marca los arcos que entran a ese nodo. Volver
    // a pulsarla quita la marca.
    $('#tabla-vectores').addEventListener('click', (ev) => {
        const th = ev.target.closest('th[data-nodo]');
        if (!th) return;
        estado.seleccion = estado.seleccion === th.dataset.nodo ? null : th.dataset.nodo;
        pintarEstado();
    });
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
                + `${G.aristas.length} arcos.`;
            salida.className = 'txt-estado';
        });
    });
    generarInstancia();
    // En DOMContentLoaded el navegador aun no ha fijado el alto definitivo de
    // #cyto, de modo que el primer encuadre se repite ya con la pagina medida.
    requestAnimationFrame(recalcularLayout);
}

document.addEventListener('DOMContentLoaded', iniciar);
