/* Editor de la instancia: matriz de largos.
 *
 * La edición ocurre en un diálogo modal sobre una copia del digrafo. Nada
 * cambia hasta pulsar Aplicar, de modo que el grafo en pantalla no se altera
 * mientras se escribe.
 *
 * Filas: nodo de origen. Columnas: nodo de destino. Una celda vacía significa
 * que el arco no existe. La diagonal corresponde a los loops de largo 0 que
 * añade el preprocesamiento y no es editable.
 *
 * El tope de nodos es el de la aplicación, NODOS_MAXIMO.
 */

/* Modelo de trabajo: una fila por nodo, con su posición en el lienzo, y la
 * matriz de valores tal como están escritos. Se guarda el texto y no el número
 * para poder señalar la casilla concreta que no es un largo válido. */
const editor = {
    filas: [],   // [{nombre, pos}]
    L: [],       // L[i][j] = texto de la casilla
    alAplicar: null,
};

function _tablaEditor() { return document.getElementById('tabla-editor'); }
function _dialogoEditor() { return document.getElementById('dlg-editor'); }

function _mensajeEditor(texto) {
    const salida = document.getElementById('txt-editor');
    salida.textContent = texto || '';
    salida.className = texto ? 'txt-error' : '';
}

/* Nombre libre para un nodo nuevo: la primera letra o número no usado. */
function _nombreLibre(usados) {
    const abecedario = 'abcdefghijklmnopqrstuvwxyz';
    for (const c of abecedario) if (!usados.has(c)) return c;
    for (let j = 1; ; j++) if (!usados.has(String(j))) return String(j);
}

function _cargarModelo(G) {
    const ids = G.ids;
    editor.filas = ids.map((id) => ({ nombre: id, pos: G.nodos.get(id).pos || null }));
    editor.L = ids.map((u) => ids.map((v) => {
        const largo = G.largo(u, v);
        return largo === Infinity ? '' : String(largo);
    }));
}

/* Traslada al modelo lo que hay escrito en la tabla. Se llama antes de cada
 * cambio de estructura y antes de aplicar. */
function _sincronizarDesdeDOM() {
    const tabla = _tablaEditor();
    for (const entrada of tabla.querySelectorAll('input[data-fila]')) {
        const i = Number(entrada.dataset.fila);
        if (entrada.dataset.columna === undefined) editor.filas[i].nombre = entrada.value;
        else editor.L[i][Number(entrada.dataset.columna)] = entrada.value;
    }
}

function _dibujarMatriz() {
    const tabla = _tablaEditor();
    const n = editor.filas.length;
    tabla.replaceChildren();

    const thead = document.createElement('thead');
    const filaCabecera = document.createElement('tr');
    const esquina = document.createElement('th');
    esquina.className = 'esquina';
    esquina.textContent = 'ℓ';
    esquina.title = 'Filas: origen. Columnas: destino.';
    filaCabecera.append(esquina);
    editor.filas.forEach((f, j) => {
        const th = document.createElement('th');
        th.textContent = f.nombre;
        th.dataset.cabecera = String(j);
        filaCabecera.append(th);
    });
    filaCabecera.append(document.createElement('th'));
    thead.append(filaCabecera);
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
            const cabecera = tabla.querySelector(`th[data-cabecera="${i}"]`);
            if (cabecera) cabecera.textContent = nombre.value;
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
            if (i === j) {
                celda.value = String(LARGO_LOOP);
                celda.readOnly = true;
                celda.className = 'celda-loop';
                celda.title = 'Loop de largo 0 añadido por el preprocesamiento.';
            } else {
                celda.value = editor.L[i][j];
                celda.setAttribute('aria-label',
                    `Largo del arco ${fila.nombre} a ${editor.filas[j].nombre}`);
            }
            td.append(celda);
            tr.append(td);
        });

        const tdBorrar = document.createElement('td');
        tdBorrar.className = 'celda-borrar';
        const borrar = document.createElement('button');
        borrar.type = 'button';
        borrar.textContent = '×';
        borrar.title = 'Eliminar el nodo ' + fila.nombre;
        borrar.addEventListener('click', () => _eliminarNodo(i));
        tdBorrar.append(borrar);
        tr.append(tdBorrar);

        tbody.append(tr);
    });
    tabla.append(tbody);

    document.getElementById('txt-editor-n').textContent =
        `${n} nodos. Máximo ${NODOS_MAXIMO}.`;
    document.getElementById('btn-editor-agregar').disabled = n >= NODOS_MAXIMO;
}

function _agregarNodo() {
    _sincronizarDesdeDOM();
    if (editor.filas.length >= NODOS_MAXIMO) return;
    const nombre = _nombreLibre(new Set(editor.filas.map((f) => f.nombre)));
    editor.filas.push({ nombre, pos: null });
    editor.L.forEach((fila) => fila.push(''));
    editor.L.push(new Array(editor.filas.length).fill(''));
    _mensajeEditor('');
    _dibujarMatriz();
}

function _eliminarNodo(i) {
    _sincronizarDesdeDOM();
    if (editor.filas.length <= NODOS_MINIMO) {
        _mensajeEditor(`El digrafo debe tener al menos ${NODOS_MINIMO} nodos.`);
        return;
    }
    editor.filas.splice(i, 1);
    editor.L.splice(i, 1);
    editor.L.forEach((fila) => fila.splice(i, 1));
    _mensajeEditor('');
    _dibujarMatriz();
}

/* Reparte en un círculo los nodos que aún no tienen posición. Los que ya la
 * tenían la conservan, de modo que renombrar no mueve el dibujo. */
function _posicionesFinales() {
    const n = editor.filas.length;
    const centro = 380, radio = 210;
    return editor.filas.map((f, i) => f.pos || [
        Math.round(centro + radio * Math.cos((2 * Math.PI * i) / n - Math.PI / 2)),
        Math.round(270 + radio * Math.sin((2 * Math.PI * i) / n - Math.PI / 2)),
    ]);
}

/* Construye el objeto del digrafo a partir del modelo. Lanza un error con el
 * primer problema encontrado, señalando la casilla o el nombre concreto. */
function _objetoDesdeModelo() {
    const n = editor.filas.length;
    if (n < NODOS_MINIMO) throw new Error(`El digrafo debe tener al menos ${NODOS_MINIMO} nodos.`);
    if (n > NODOS_MAXIMO) throw new Error(`La aplicación admite hasta ${NODOS_MAXIMO} nodos.`);

    const nombres = editor.filas.map((f) => f.nombre.trim());
    const vistos = new Set();
    nombres.forEach((nombre, i) => {
        if (nombre === '') throw new Error(`El nodo de la fila ${i + 1} no tiene nombre.`);
        if (vistos.has(nombre)) throw new Error(`El nombre "${nombre}" está repetido.`);
        vistos.add(nombre);
    });

    const posiciones = _posicionesFinales();
    const nodos = nombres.map((id, i) => ({ id, pos: posiciones[i] }));
    const arcos = [];
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const texto = editor.L[i][j].trim();
            if (texto === '') continue;
            const largo = Number(texto);
            if (!Number.isFinite(largo)) {
                throw new Error(`El largo del arco ${nombres[i]} → ${nombres[j]} `
                    + `no es un número: "${texto}".`);
            }
            arcos.push({ origen: nombres[i], destino: nombres[j], largo });
        }
    }
    return { nodos, arcos };
}

function _aplicarEditor() {
    _sincronizarDesdeDOM();
    let G;
    try {
        G = Digrafo.desdeObjeto(_objetoDesdeModelo());
    } catch (e) {
        // validarDatos redacta sus mensajes para un archivo cargado. Aquí no
        // hay archivo.
        _mensajeEditor(e.message.replace(/^JSON inválido: /, ''));
        return;
    }
    _dialogoEditor().close();
    editor.alAplicar(G);
}

/* Abre el editor sobre el digrafo dado. alAplicar recibe el digrafo nuevo. */
function abrirEditor(G, alAplicar) {
    editor.alAplicar = alAplicar;
    _cargarModelo(G);
    _mensajeEditor('');
    _dibujarMatriz();
    _dialogoEditor().showModal();
    const primera = _tablaEditor().querySelector('input:not([readonly])');
    if (primera) primera.focus();
}

function iniciarEditor() {
    document.getElementById('btn-editor-agregar').addEventListener('click', _agregarNodo);
    document.getElementById('btn-editor-aplicar').addEventListener('click', _aplicarEditor);
    document.getElementById('btn-editor-cancelar')
        .addEventListener('click', () => _dialogoEditor().close());
}
