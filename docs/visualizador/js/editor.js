/* Editor de la instancia: matriz de pesos.
 *
 * La edición ocurre en un diálogo modal sobre una copia del digrafo. Nada
 * cambia hasta pulsar Aplicar, de modo que el grafo en pantalla no se altera
 * mientras se escribe.
 *
 * Filas: nodo de origen. Columnas: nodo de destino. Una casilla vacía significa
 * que el arco no existe. La diagonal es editable: un arco de un nodo a sí mismo
 * es válido en este modelo.
 *
 * La matriz tiene n² casillas, de modo que el editor admite menos nodos que el
 * generador. Por encima de ese tope se edita el archivo JSON.
 */

const EDITOR_NODOS_MAXIMO = 20;
const EDITOR_NODOS_MINIMO = 2;

/* Modelo de trabajo: una fila por nodo, con su posición en el lienzo, y la
 * matriz con el texto de cada casilla. Se conserva el texto para poder señalar
 * en el mensaje la casilla que no es un peso válido. */
const editor = {
    filas: [],   // [{nombre, pos}]
    P: [],       // P[i][j] = texto de la casilla
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
    const peso = new Map(G.aristas.map((a) => [`${a.origen}>${a.destino}`, a.peso]));
    editor.filas = ids.map((id) => ({ nombre: id, pos: G.nodos.get(id).pos || null }));
    editor.P = ids.map((u) => ids.map((v) => {
        const p = peso.get(`${u}>${v}`);
        return p === undefined ? '' : String(p);
    }));
}

/* Traslada al modelo lo que hay escrito en la tabla. Se llama antes de cada
 * cambio de estructura y antes de aplicar. */
function _sincronizarEd() {
    for (const entrada of _tablaEd().querySelectorAll('input[data-fila]')) {
        const i = Number(entrada.dataset.fila);
        if (entrada.dataset.columna === undefined) editor.filas[i].nombre = entrada.value;
        else editor.P[i][Number(entrada.dataset.columna)] = entrada.value;
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
    esquina.textContent = 'ℓ';
    esquina.title = 'Filas: origen. Columnas: destino.';
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
            if (i === j) celda.className = 'celda-diagonal';
            celda.setAttribute('aria-label',
                `Peso del arco ${fila.nombre} a ${editor.filas[j].nombre}`);
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
        `${n} nodos. Máximo ${EDITOR_NODOS_MAXIMO}.`;
    document.getElementById('btn-editor-agregar').disabled = n >= EDITOR_NODOS_MAXIMO;
}

function _agregarNodoEd() {
    _sincronizarEd();
    if (editor.filas.length >= EDITOR_NODOS_MAXIMO) return;
    editor.filas.push({ nombre: _nombreLibreEd(new Set(editor.filas.map((f) => f.nombre))),
                        pos: null });
    editor.P.forEach((fila) => fila.push(''));
    editor.P.push(new Array(editor.filas.length).fill(''));
    _mensajeEd('');
    _dibujarMatrizEd();
}

function _eliminarNodoEd(i) {
    _sincronizarEd();
    if (editor.filas.length <= EDITOR_NODOS_MINIMO) {
        _mensajeEd(`El digrafo debe tener al menos ${EDITOR_NODOS_MINIMO} nodos.`);
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

/* Construye el objeto del digrafo a partir del modelo. Lanza un error con el
 * primer problema encontrado, señalando la casilla o el nombre concreto. */
function _objetoDesdeModeloEd() {
    const n = editor.filas.length;
    if (n < EDITOR_NODOS_MINIMO) {
        throw new Error(`El digrafo debe tener al menos ${EDITOR_NODOS_MINIMO} nodos.`);
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
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            const texto = editor.P[i][j].trim();
            if (texto === '') continue;
            const peso = Number(texto);
            if (!Number.isFinite(peso)) {
                throw new Error(`El peso del arco ${nombres[i]} → ${nombres[j]} `
                    + `no es un número: "${texto}".`);
            }
            aristas.push({ origen: nombres[i], destino: nombres[j], weight: peso });
        }
    }
    return { dirigido: true, nodos, aristas };
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

/* Abre el editor sobre el digrafo dado. alAplicar recibe el digrafo nuevo. */
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
