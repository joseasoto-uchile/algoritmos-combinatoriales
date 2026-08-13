/* Comparador de trazas: Python contra JavaScript.
 *
 * No se ejecuta suelto. herramientas/verificar_paridad.py lo concatena detrás
 * de docs/js/grafo.js y docs/js/algoritmos.js y corre el resultado con Node, de
 * modo que acá ya están definidos Grafo y ALGORITMOS.
 *
 * Se compara evento por evento y no solo el resultado final: la gracia del
 * visualizador es el recorrido, así que dos implementaciones que lleguen a las
 * mismas distancias por caminos distintos mostrarían animaciones diferentes y
 * ya no serían la misma herramienta.
 */
'use strict';

const fs = require('fs');

// Campos que solo aparecen en el evento 'fin' y guardan el resultado completo.
// Se excluyen de la comparación porque su forma serializada difiere entre
// lenguajes (infinito, orden de claves) sin que eso afecte a la animación.
const CAMPOS_RESULTADO = new Set(['distancias', 'padres', 'orden_topologico', 'ciclo_negativo']);

function normalizar(ev) {
    const o = {};
    for (const k of Object.keys(ev).sort()) {
        if (!CAMPOS_RESULTADO.has(k)) o[k] = ev[k];
    }
    return JSON.stringify(o);
}

function comparar(rutaReferencia) {
    const ref = JSON.parse(fs.readFileSync(rutaReferencia, 'utf8'));
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
    if (!fallos.length) {
        console.log('OK: las dos implementaciones producen trazas idénticas.');
        return 0;
    }
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
