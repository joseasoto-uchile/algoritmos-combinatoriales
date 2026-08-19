# Recorridos y caminos mínimos

Visualizador de cinco algoritmos sobre grafos: BFS, DFS, Dijkstra,
Bellman-Ford y caminos mínimos en un DAG.

## Algoritmos

Cada uno emite una traza de eventos con el mismo vocabulario: `visitar_nodo`,
`procesar_nodo`, `explorar_arista`, `relajar`, `descartar_arista`,
`arista_solucion`, `nodo_finalizado` y `fin`. El campo `linea` indica la línea
del pseudocódigo que se resalta en cada paso.

Bellman-Ford emite además `inicio_iteracion` y `fin_iteraciones`, que la
interfaz usa para mostrar el número de pasada actual y el total, y
`ciclo_negativo` para los nodos sin distancia mínima definida. Los caminos
mínimos en un DAG emiten `orden_topologico_nodo` durante la primera fase.

Dijkstra rechaza los pesos negativos con un mensaje en lugar de devolver un
resultado incorrecto. Los caminos mínimos en un DAG rechazan un grafo que no
sea dirigido y acíclico.

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

## Reproducción

La velocidad se expresa en pasos por segundo. `setInterval` no entrega disparos
fiables por debajo de 16 ms, de modo que para velocidades mayores a unos 62
pasos por segundo cada disparo avanza varios pasos. Los puntos de interrupción
se comprueban en cada paso intermedio del disparo.

## Ejecución local

```bash
python -m http.server 8060
```

desde `docs/`, y abrir <http://127.0.0.1:8060/visualizador/>.
