/* Barras divisorias arrastrables entre las tres columnas.
 *
 * Dash no trae un componente "splitter", así que el ancho de las columnas
 * laterales vive en dos variables CSS (--ancho-controles / --ancho-codigo)
 * sobre .fila-principal, y este script las modifica al arrastrar. La columna
 * del grafo no tiene ancho propio: ocupa lo que sobra.
 *
 * El ancho elegido se guarda en localStorage porque, si no, cada recarga de
 * Dash (que en modo debug ocurre a cada rato) devolvía las columnas al
 * tamaño por omisión y había que reacomodarlas de nuevo.
 */
(function () {
    "use strict";

    var LIMITES = { controles: [180, 560], codigo: [160, 640] };
    var VARIABLE = { controles: "--ancho-controles", codigo: "--ancho-codigo" };
    var POR_OMISION = { controles: 280, codigo: 300 };
    var CLAVE_ALMACEN = "grafos:anchos-columnas";

    function leerGuardado() {
        try {
            return JSON.parse(localStorage.getItem(CLAVE_ALMACEN)) || {};
        } catch (e) {
            return {};
        }
    }

    function guardar(anchos) {
        try {
            localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(anchos));
        } catch (e) {
            /* localStorage puede estar deshabilitado; no es motivo para romper
               el arrastre, solo se pierde la persistencia. */
        }
    }

    function acotar(objetivo, valor) {
        var rango = LIMITES[objetivo];
        return Math.min(Math.max(valor, rango[0]), rango[1]);
    }

    function aplicar(fila, objetivo, valor) {
        fila.style.setProperty(VARIABLE[objetivo], acotar(objetivo, valor) + "px");
    }

    /* Cytoscape mide su contenedor una sola vez y no se entera de que la
       columna cambió de ancho: sin esto el lienzo queda del tamaño viejo y el
       grafo aparece cortado o desplazado respecto del puntero. Escucha
       'resize' de window, así que alcanza con emitirlo. */
    var pendiente = null;
    function avisarRedimension() {
        if (pendiente) return;
        pendiente = requestAnimationFrame(function () {
            pendiente = null;
            window.dispatchEvent(new Event("resize"));
        });
    }

    function iniciarArrastre(evento, fila, divisor) {
        var objetivo = divisor.getAttribute("data-objetivo");
        if (!objetivo) return;
        evento.preventDefault();

        var estilos = getComputedStyle(fila);
        var anchoInicial = parseFloat(estilos.getPropertyValue(VARIABLE[objetivo])) ||
            POR_OMISION[objetivo];
        var xInicial = evento.clientX;
        // La columna de código está a la derecha del divisor, así que crece
        // cuando el puntero va hacia la izquierda: el signo se invierte.
        var signo = objetivo === "codigo" ? -1 : 1;

        document.body.classList.add("redimensionando");
        divisor.classList.add("divisor-activo");

        function alMover(e) {
            aplicar(fila, objetivo, anchoInicial + signo * (e.clientX - xInicial));
            avisarRedimension();
        }

        function alSoltar() {
            document.removeEventListener("mousemove", alMover);
            document.removeEventListener("mouseup", alSoltar);
            document.body.classList.remove("redimensionando");
            divisor.classList.remove("divisor-activo");

            var anchos = leerGuardado();
            anchos[objetivo] = parseFloat(
                getComputedStyle(fila).getPropertyValue(VARIABLE[objetivo])
            );
            guardar(anchos);
            avisarRedimension();
        }

        document.addEventListener("mousemove", alMover);
        document.addEventListener("mouseup", alSoltar);
    }

    function restaurarAnchos(fila) {
        var anchos = leerGuardado();
        Object.keys(VARIABLE).forEach(function (objetivo) {
            if (typeof anchos[objetivo] === "number") {
                aplicar(fila, objetivo, anchos[objetivo]);
            }
        });
    }

    /* Dash monta el layout después de cargar este script, y en modo debug lo
       vuelve a montar en cada recarga en caliente. Por eso se delega en
       document (los handlers sobreviven al remontaje) y se observa el DOM
       para restaurar los anchos cuando la fila aparece. */
    document.addEventListener("mousedown", function (evento) {
        var divisor = evento.target.closest(".divisor");
        if (!divisor) return;
        var fila = divisor.closest(".fila-principal");
        if (fila) iniciarArrastre(evento, fila, divisor);
    });

    // Doble clic en un divisor: vuelve al ancho por omisión de esa columna.
    document.addEventListener("dblclick", function (evento) {
        var divisor = evento.target.closest(".divisor");
        if (!divisor) return;
        var fila = divisor.closest(".fila-principal");
        var objetivo = divisor.getAttribute("data-objetivo");
        if (!fila || !objetivo) return;
        aplicar(fila, objetivo, POR_OMISION[objetivo]);
        var anchos = leerGuardado();
        anchos[objetivo] = POR_OMISION[objetivo];
        guardar(anchos);
        avisarRedimension();
    });

    var yaRestaurado = false;
    new MutationObserver(function () {
        var fila = document.querySelector(".fila-principal");
        if (fila && !yaRestaurado) {
            yaRestaurado = true;
            restaurarAnchos(fila);
        } else if (!fila) {
            yaRestaurado = false;
        }
    }).observe(document.documentElement, { childList: true, subtree: true });
})();
