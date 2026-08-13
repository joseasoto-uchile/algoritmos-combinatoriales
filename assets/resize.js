/* Divisores arrastrables entre las tres columnas.
 *
 * El ancho de las columnas laterales está en dos variables CSS,
 * --ancho-controles y --ancho-codigo, declaradas en .fila-principal. Este
 * script las modifica durante el arrastre. La columna del grafo no tiene ancho
 * propio: ocupa el resto.
 *
 * El ancho elegido se guarda en localStorage y se restaura al cargar la
 * página.
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
            /* localStorage puede estar deshabilitado. Se pierde solo la
               persistencia del ancho. */
        }
    }

    function acotar(objetivo, valor) {
        var rango = LIMITES[objetivo];
        return Math.min(Math.max(valor, rango[0]), rango[1]);
    }

    function aplicar(fila, objetivo, valor) {
        fila.style.setProperty(VARIABLE[objetivo], acotar(objetivo, valor) + "px");
    }

    /* Cytoscape mide su contenedor una sola vez y no detecta el cambio de
       ancho de la columna. Escucha el evento 'resize' de window, por lo que
       es suficiente emitirlo para que actualice el tamaño del lienzo. */
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
        // La columna de código está a la derecha del divisor, de modo que
        // aumenta cuando el puntero se desplaza hacia la izquierda. Por eso se
        // invierte el signo.
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

    /* Dash construye el layout después de cargar este script, y lo reconstruye
       en cada recarga. Los manejadores se registran en document, donde
       sobreviven a la reconstrucción, y un MutationObserver restaura los anchos
       cuando aparece la fila. */
    document.addEventListener("mousedown", function (evento) {
        var divisor = evento.target.closest(".divisor");
        if (!divisor) return;
        var fila = divisor.closest(".fila-principal");
        if (fila) iniciarArrastre(evento, fila, divisor);
    });

    // El doble clic en un divisor restablece el ancho por omisión.
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
