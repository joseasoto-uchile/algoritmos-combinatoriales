/* Comparador de trazas: Python contra JavaScript.
 *
 * No se ejecuta por separado. herramientas/verificar_paridad.py lo concatena
 * detrás de docs/js/grafo.js y docs/js/algoritmos.js y ejecuta el resultado con
 * Node, de modo que Grafo y ALGORITMOS ya están definidos.
 *
 * La comparación es evento por evento. La aplicación muestra el recorrido, no
 * solo el resultado, de modo que dos implementaciones que lleguen a las mismas
 * distancias por caminos distintos producen animaciones diferentes.
 */
'use strict';

const fs = require('fs');

// Campos que solo aparecen en el evento 'fin' y contienen el resultado
// completo. Se excluyen de la comparación porque su forma serializada difiere
// entre lenguajes, por el infinito y el orden de las claves, sin que eso afecte
// a la animación.
const CAMPOS_RESULTADO = new Set(['distancias', 'padres', 'orden_topologico', 'ciclo_negativo']);

function normalizar(ev) {
    const o = {};
    for (const k of Object.keys(ev).sort()) {
        if (!CAMPOS_RESULTADO.has(k)) o[k] = ev[k];
    }
    return JSON.stringify(o);
}

/* Forma canónica del grafo construido. Equivale a _huella de
 * verificar_paridad.py. Las posiciones no intervienen: no afectan a ningún
 * algoritmo. */
function huella(G) {
    const aristas = G.aristas.map(({ origen, destino, peso }) => {
        const [a, b] = G.dirigido ? [origen, destino] : [origen, destino].sort();
        return `${a}>${b}:${peso}`;
    });
    return {
        dirigido: G.dirigido,
        nodos: [...G.nodos.keys()].sort(),
        aristas: aristas.sort(),
    };
}

/* Los archivos malformados forman la otra parte del contrato: las dos
 * versiones deben rechazarlos con el mismo mensaje. Cuando lo aceptan, además
 * deben construir el mismo grafo: coincidir en el veredicto no basta. */
function compararRechazos(casos) {
    const fallos = [];
    for (const { nombre, datos, mensajePython, huellaPython } of casos) {
        let mensajeJs = null, huellaJs = null;
        try {
            huellaJs = huella(Grafo.desdeObjeto(datos));
        } catch (e) {
            mensajeJs = e.message;
        }
        // Si mensajePython es null, Python acepta el archivo. Es el caso de los
        // identificadores que contienen marcado: son texto válido y las dos
        // versiones deben aceptarlos.
        if (mensajeJs !== mensajePython) {
            const desc = (m) => (m === null ? '(lo acepta)' : m);
            fallos.push({
                nombre,
                motivo: `veredictos distintos\n      JavaScript: ${desc(mensajeJs)}\n      Python    : ${desc(mensajePython)}`,
            });
            continue;
        }
        if (mensajeJs === null
            && JSON.stringify(huellaJs) !== JSON.stringify(huellaPython)) {
            fallos.push({
                nombre,
                motivo: 'las dos lo aceptan pero construyen grafos distintos'
                    + `\n      JavaScript: ${JSON.stringify(huellaJs)}`
                    + `\n      Python    : ${JSON.stringify(huellaPython)}`,
            });
        }
    }
    return fallos;
}

function comparar(rutaReferencia) {
    const ref = JSON.parse(fs.readFileSync(rutaReferencia, 'utf8'));
    const casosInvalidos = ref.__invalidos__ || [];
    delete ref.__invalidos__;
    let idénticas = 0, eventos = 0;
    const fallos = [];

    for (const [clave, datos] of Object.entries(ref)) {
        const G = Grafo.desdeObjeto(datos.grafo);
        for (const [algId, trazaPy] of Object.entries(datos.trazas)) {
            eventos += trazaPy.length;
            let trazaJs;
            try {
                [, trazaJs] = ALGORITMOS[algId].funcion(G, datos.origen);
            } catch (e) {
                fallos.push({ clave, algId, motivo: `excepción: ${e.message}` });
                continue;
            }
            if (trazaJs.length !== trazaPy.length) {
                fallos.push({ clave, algId, motivo: `largo ${trazaJs.length} vs ${trazaPy.length} (Python)` });
                continue;
            }
            let dif = null;
            for (let i = 0; i < trazaPy.length; i++) {
                if (normalizar(trazaJs[i]) !== normalizar(trazaPy[i])) {
                    dif = { i, js: normalizar(trazaJs[i]), py: normalizar(trazaPy[i]) };
                    break;
                }
            }
            if (dif) fallos.push({ clave, algId, dif });
            else idénticas++;
        }
    }

    const total = idénticas + fallos.length;
    console.log(`Trazas comparadas: ${total}  ·  eventos: ${eventos.toLocaleString('es')}`);

    const fallosRechazo = compararRechazos(casosInvalidos);
    console.log(`Archivos invalidos comparados: ${casosInvalidos.length}`);
    if (fallosRechazo.length) {
        console.log(`FALLA: ${fallosRechazo.length} archivo(s) no se rechazan igual.\n`);
        for (const f of fallosRechazo) console.log(`  [${f.nombre}] ${f.motivo}`);
        console.log('');
    }

    if (!fallos.length && !fallosRechazo.length) {
        console.log('OK: trazas identicas y mismos rechazos en ambas implementaciones.');
        return 0;
    }
    if (!fallos.length) return 1;
    console.log(`FALLA: ${fallos.length} traza(s) difieren.\n`);
    for (const f of fallos.slice(0, 10)) {
        console.log(`  [${f.clave}] ${f.algId}`);
        if (f.motivo) {
            console.log(`      ${f.motivo}`);
        } else {
            console.log(`      primer evento distinto: índice ${f.dif.i}`);
            console.log(`      JavaScript: ${f.dif.js}`);
            console.log(`      Python    : ${f.dif.py}`);
        }
    }
    if (fallos.length > 10) console.log(`  ... y ${fallos.length - 10} más.`);
    return 1;
}

process.exit(comparar(process.argv[2]));
