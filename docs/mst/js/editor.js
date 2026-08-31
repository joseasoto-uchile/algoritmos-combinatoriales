/* Editor de la instancia: matriz de pesos.
 *
 * La edición ocurre en un diálogo modal sobre una copia del grafo. Nada cambia
 * hasta pulsar Aplicar, de modo que el grafo en pantalla no se altera mientras
 * se escribe.
 *
 * La matriz es simétrica porque el grafo no es dirigido: se escribe el
 * triángulo superior y el inferior se copia solo. La diagonal no se edita, ya
 * que un lazo nunca forma parte de un árbol de expansión. Una casilla vacía
 * significa que la arista no existe.
 *
 * El tope de nodos es el de la aplicación, NODOS_MAXIMO.
 */

/* Modelo de trabajo: una fila por nodo, con su posición en el lienzo, y la
 * matriz con el texto de cada casilla. Se conserva el texto para poder señalar
 * en el mensaje la casilla que no es un peso válido. */
const editor = {
    filas: [],   // [{nombre, pos}]
    P: [],       // P[i][j] = texto de la casilla, con P[i][j] = P[j][i]
    alAplicar: null,
};

function _tablaEd() { return document.getElementById('tabla-editor'); }
function _dialogoEd() { return document.getElementById('dlg-editor'); }

function _mensajeEd(texto) {
    const salida = document.getElementById('txt-editor');
    salida.textContent = texto || '';
    salida.className = texto ? 'txt-error' : '';
}

/* Nombre libre para un nodo nuevo: el primer número no usado. */
function _nombreLibreEd(usados) {
    for (let j = 0; ; j++) if (!usados.has(String(j))) return String(j);
}

function _cargarModeloEd(G) {
    const ids = G.ids;
    const peso = new Map(G.aristas.map((a) => [claveArista(a.origen, a.destino), a.peso]));
    editor.filas = ids.map((id) => ({ nombre: id, pos: G.nodos.get(id).pos || null }));
    editor.P = ids.map((u) => ids.map((v) => {
        if (u === v) return '';
        const p = peso.get(claveArista(u, v));
        return p === undefined ? '' : String(p);
    }));
}

/* Traslada al modelo lo que hay escrito en la tabla. Se llama antes de cada
 * cambio de estructura y antes de aplicar.
 *
 * Solo el triángulo superior lleva casillas editables; el inferior se rellena
 * por simetría. */
function _sincronizarEd() {
    for (const entrada of _tablaEd().querySelectorAll('input[data-fila]')) {
        const i = Number(entrada.dataset.fila);
        if (entrada.dataset.columna === undefined) { editor.filas[i].nombre = entrada.value; continue; }
        const j = Number(entrada.dataset.columna);
        if (j <= i) continue;
        editor.P[i][j] = entrada.value;
        editor.P[j][i] = entrada.value;
    }
}

function _dibujarMatrizEd() {
    const tabla = _tablaEd();
    const n = editor.filas.length;
    tabla.replaceChildren();

    const thead = document.createElement('thead');
    const cab = document.createElement('tr');
    const esquina = document.createElement('th');
    esquina.className = 'esquina';
    esquina.textContent = 'w';
    esquina.title = 'La matriz es simétrica: se edita el triángulo superior.';
    cab.append(esquina);
    editor.filas.forEach((f, j) => {
        const th = document.createElement('th');
        th.textContent = f.nombre;
        th.dataset.cabecera = String(j);
        cab.append(th);
    });
    cab.append(document.createElement('th'));
    thead.append(cab);
    tabla.append(thead);

    const tbody = document.createElement('tbody');
    editor.filas.forEach((fila, i) => {
        const tr = document.createElement('tr');

        const th = document.createElement('th');
        const nombre = document.createElement('input');
        nombre.type = 'text';
        nombre.value = fila.nombre;
        nombre.dataset.fila = String(i);
        nombre.className = 'nombre-nodo';
        nombre.setAttribute('aria-label', 'Nombre del nodo ' + (i + 1));
        // La cabecera de la columna muestra el mismo nombre.
        nombre.addEventListener('input', () => {
            const c = tabla.querySelector(`th[data-cabecera="${i}"]`);
            if (c) c.textContent = nombre.value;
        });
        th.append(nombre);
        tr.append(th);

        editor.filas.forEach((_, j) => {
            const td = document.createElement('td');
            const celda = document.createElement('input');
            celda.type = 'text';
            celda.inputMode = 'numeric';
            celda.dataset.fila = String(i);
            celda.dataset.columna = String(j);
            celda.value = editor.P[i][j];
            if (i === j) {
                celda.className = 'celda-diagonal';
                celda.disabled = true;
                celda.title = 'Un lazo nunca está en un árbol de expansión.';
            } else if (j < i) {
                celda.className = 'celda-reflejo';
                celda.readOnly = true;
                celda.tabIndex = -1;
                celda.title = 'Copia de la casilla simétrica.';
            } else {
                // Al escribir en el triángulo superior se actualiza el reflejo.
                celda.addEventListener('input', () => {
                    const espejo = tabla.querySelector(
                        `input[data-fila="${j}"][data-columna="${i}"]`);
                    if (espejo) espejo.value = celda.value;
                });
            }
            celda.setAttribute('aria-label',
                `Peso de la arista entre ${fila.nombre} y ${editor.filas[j].nombre}`);
            td.append(celda);
            tr.append(td);
        });

        const tdBorrar = document.createElement('td');
        tdBorrar.className = 'celda-borrar';
        const borrar = document.createElement('button');
        borrar.type = 'button';
        borrar.textContent = '×';
        borrar.title = 'Eliminar el nodo ' + fila.nombre;
        borrar.addEventListener('click', () => _eliminarNodoEd(i));
        tdBorrar.append(borrar);
        tr.append(tdBorrar);

        tbody.append(tr);
    });
    tabla.append(tbody);

    document.getElementById('txt-editor-n').textContent =
        `${n} nodos. Máximo ${NODOS_MAXIMO}.`;
    document.getElementById('btn-editor-agregar').disabled = n >= NODOS_MAXIMO;
}

function _agregarNodoEd() {
    _sincronizarEd();
    if (editor.filas.length >= NODOS_MAXIMO) return;
    editor.filas.push({ nombre: _nombreLibreEd(new Set(editor.filas.map((f) => f.nombre))),
                        pos: null });
    editor.P.forEach((fila) => fila.push(''));
    editor.P.push(new Array(editor.filas.length).fill(''));
    _mensajeEd('');
    _dibujarMatrizEd();
}

function _eliminarNodoEd(i) {
    _sincronizarEd();
    if (editor.filas.length <= NODOS_MINIMO) {
        _mensajeEd(`El grafo debe tener al menos ${NODOS_MINIMO} nodos.`);
        return;
    }
    editor.filas.splice(i, 1);
    editor.P.splice(i, 1);
    editor.P.forEach((fila) => fila.splice(i, 1));
    _mensajeEd('');
    _dibujarMatrizEd();
}

/* Reparte en un círculo los nodos que aún no tienen posición. Los que ya la
 * tenían la conservan, de modo que renombrar no mueve el dibujo. */
function _posicionesEd() {
    const n = editor.filas.length;
    const radio = ESCALA_POSICIONES * 0.4, centro = ESCALA_POSICIONES / 2;
    return editor.filas.map((f, i) => f.pos || [
        Math.round(centro + radio * Math.cos((2 * Math.PI * i) / n - Math.PI / 2)),
        Math.round(centro + radio * Math.sin((2 * Math.PI * i) / n - Math.PI / 2)),
    ]);
}

/* Construye el objeto del grafo a partir del modelo. Lanza un error con el
 * primer problema encontrado, señalando la casilla o el nombre concreto. */
function _objetoDesdeModeloEd() {
    const n = editor.filas.length;
    if (n < NODOS_MINIMO) {
        throw new Error(`El grafo debe tener al menos ${NODOS_MINIMO} nodos.`);
    }
    const nombres = editor.filas.map((f) => f.nombre.trim());
    const vistos = new Set();
    nombres.forEach((nombre, i) => {
        if (nombre === '') throw new Error(`El nodo de la fila ${i + 1} no tiene nombre.`);
        if (vistos.has(nombre)) throw new Error(`El nombre "${nombre}" está repetido.`);
        vistos.add(nombre);
    });

    const posiciones = _posicionesEd();
    const nodos = nombres.map((id, i) => ({ id, label: id, pos: posiciones[i] }));
    const aristas = [];
    // Solo el triángulo superior: la arista {i,j} se declara una vez.
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const texto = editor.P[i][j].trim();
            if (texto === '') continue;
            const peso = Number(texto);
            if (!Number.isFinite(peso)) {
                throw new Error(`El peso de la arista ${nombres[i]} — ${nombres[j]} `
                    + `no es un número: "${texto}".`);
            }
            aristas.push({ origen: nombres[i], destino: nombres[j], weight: peso });
        }
    }
    return { dirigido: false, nodos, aristas };
}

function _aplicarEd() {
    _sincronizarEd();
    let G;
    try {
        G = Grafo.desdeObjeto(_objetoDesdeModeloEd());
    } catch (e) {
        // validarDatosGrafo redacta sus mensajes para un archivo cargado. Aquí
        // no hay archivo.
        _mensajeEd(e.message.replace(/^JSON inválido: /, ''));
        return;
    }
    _dialogoEd().close();
    editor.alAplicar(G);
}

/* Abre el editor sobre el grafo dado. alAplicar recibe el grafo nuevo. */
function abrirEditor(G, alAplicar) {
    editor.alAplicar = alAplicar;
    _cargarModeloEd(G);
    _mensajeEd('');
    _dibujarMatrizEd();
    _dialogoEd().showModal();
    const primera = _tablaEd().querySelector('input');
    if (primera) primera.focus();
}

function iniciarEditor() {
    document.getElementById('btn-editor-agregar').addEventListener('click', _agregarNodoEd);
    document.getElementById('btn-editor-aplicar').addEventListener('click', _aplicarEd);
    document.getElementById('btn-editor-cancelar')
        .addEventListener('click', () => _dialogoEd().close());
}
