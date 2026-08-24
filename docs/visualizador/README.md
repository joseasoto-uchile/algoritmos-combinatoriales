# Recorridos y caminos mínimos

Visualizador de cinco algoritmos sobre grafos: BFS, DFS, Dijkstra,
Bellman-Ford y caminos mínimos en un DAG.

## Algoritmos

Cada uno emite una traza de eventos con el mismo vocabulario: `visitar_nodo`,
`procesar_nodo`, `explorar_arista`, `relajar`, `descartar_arista`,
`arista_solucion`, `nodo_finalizado` y `fin`. El campo `linea` indica la línea
del pseudocódigo que se resalta en cada paso, o la lista de líneas si el paso
ejecuta varias. Todos los eventos lo llevan: un paso sin línea deja el
pseudocódigo apagado.

Bellman-Ford emite además `inicio_iteracion` y `fin_iteraciones`, que la
interfaz usa para mostrar el número de pasada actual y el total, y
`ciclo_negativo` para los nodos sin distancia mínima definida. Los caminos
mínimos en un DAG emiten `orden_topologico_nodo` durante la primera fase.

Dijkstra rechaza los pesos negativos con un mensaje en lugar de devolver un
resultado incorrecto. Los caminos mínimos en un DAG rechazan un grafo que no
sea dirigido y acíclico.

## Dijkstra

Sigue el pseudocódigo de la clase, con la elección del mínimo por barrido sobre
V∖S y sin cola de prioridad. El costo es O(V² + E).

    Dijkstra(G, s, ℓ)
      D[v] ← +∞;  Π[v] ← ⊥  para todo v ∈ V
      D[s] ← 0;  S ← ∅
      mientras S ≠ V:
          elegir a ∈ V∖S que minimice D[a]
          si D[a] = +∞: interrumpir el ciclo
          para cada (a,b) ∈ δ⁺(a):
              si D[a] + ℓ(a,b) < D[b]:
                  D[b] ← D[a] + ℓ(a,b)
                  Π[b] ← a
          S ← S ∪ {a}
      devolver (D, Π)

El barrido desempata por el nombre del nodo. Sin ese desempate, con dos nodos a
la misma distancia el elegido dependería del orden de la lista de nodos y la
animación dejaría de ser reproducible.

Bajo el grafo aparece una tabla con los vectores D y Π, una columna por nodo,
reconstruida desde la traza en cada paso. Los nodos ya cerrados aparecen
sombreados, el elegido en el paso actual con borde naranjo y aquel cuya casilla
se evalúa con borde azul. El texto de al lado indica el contenido de S.

Las aristas ya examinadas quedan en gris: en este algoritmo el nodo elegido
entra en S y sus arcos no se vuelven a mirar. Bellman-Ford recorre todas las
aristas en cada pasada, de modo que ahí no se marcan; el registro de cada
algoritmo lo indica con `aristasNoSeRevisitan`.

## Archivos

- `js/grafo.js` — modelo de grafo, generador aleatorio con semilla, instancias
  de ejemplo y validación del formato de archivo.
- `js/algoritmos.js` — los cinco algoritmos y sus pseudocódigos.
- `js/viz.js` — traducción de eventos a clases de Cytoscape.
- `js/app.js` — interfaz. Es la única capa que accede al DOM.

## Formato de archivo

```json
{
  "dirigido": true,
  "nodos": [{"id": "0", "label": "0", "pos": [120.5, 340.2]}],
  "aristas": [{"origen": "0", "destino": "1", "weight": 4}]
}
```

`dirigido` es opcional y su omisión significa dirigido. `label` y `pos` también
son opcionales; si `pos` aparece, debe ser una lista de dos números finitos. El
peso se declara como `weight` o como `peso`, y un valor `null` equivale a la
ausencia de la clave.

`Grafo.desdeObjeto` valida el archivo antes de construir el grafo y lo rechaza
con un mensaje que indica el primer problema encontrado. Se rechaza el archivo
completo en lugar de corregirlo: un archivo corregido en silencio produce un
grafo distinto del que el usuario escribió.

Se guardan las posiciones de cada nodo para que al recargar el archivo el
dibujo quede igual.

## Seguridad

`index.html` declara una Content-Security-Policy mediante una etiqueta `<meta>`
con `script-src 'self'`.

Los identificadores de nodo son datos de entrada. Al modificar la interfaz, no
usar `innerHTML` con datos procedentes del archivo que carga el usuario: un
nodo llamado `"><img src=x onerror=...>` inyecta marcado si se concatena. Los
elementos `<option>` se construyen con `document.createElement` y `textContent`.

## Altura de la barra

El texto del paso ocupa una línea de alto fija y no cambia con su contenido. La
barra de control está encima del lienzo del grafo, de modo que cualquier cambio
en su alto encoge o agranda el lienzo y mueve el grafo en mitad de la
animación. Lo mismo vale para el contador de iteraciones de Bellman-Ford.

## Reproducción

La velocidad se expresa en pasos por segundo. `setInterval` no entrega disparos
fiables por debajo de 16 ms, de modo que para velocidades mayores a unos 62
pasos por segundo cada disparo avanza varios pasos. Los puntos de interrupción
se comprueban en cada paso intermedio del disparo.

## Ejecución local

Con el servidor de archivos estáticos del README de la raíz en marcha, la
aplicación queda en <http://127.0.0.1:8060/visualizador/>.
