# Versión estática (JavaScript)

Port del visualizador a JavaScript puro, para publicarlo como sitio estático
(GitHub Pages) sin necesidad de un servidor Python.

## Por qué existe

La versión Dash resuelve cada paso de la traza con un callback en el servidor,
así que necesita un proceso Python vivo y GitHub Pages no sirve. Acá todo
ocurre en el navegador.

## Equivalencia con la versión Python

Los algoritmos emiten exactamente la misma traza de eventos que sus gemelos en
`algorithms/`: mismos tipos, mismos campos y mismos números de línea del
pseudocódigo. Se comprobó comparando evento por evento sobre las 6 instancias
de ejemplo: **24 trazas, 2626 eventos, 0 diferencias**.

Dos detalles hicieron falta para lograr esa igualdad:

- La cola de prioridad de Dijkstra desempata por nombre de nodo, igual que
  `heapq` en Python, donde los elementos son tuplas `(distancia, nodo)`.
- `padre` en Dijkstra es un `Map` y no un objeto: las claves numéricas de un
  objeto se recorren en orden ascendente por especificación de JS, no de
  inserción, y las aristas de la solución salían en otro orden.

## Publicar en GitHub Pages

1. Subir esta rama al repositorio.
2. En Settings → Pages, elegir la rama y la carpeta `/web`.

No hace falta build: son archivos estáticos. Cytoscape se carga desde CDN; para
que funcione sin conexión, descargar el archivo a `js/` y cambiar el `src` en
`index.html`.

## Al modificar js/ o css/

Subir el número de `?v=` en las etiquetas de `index.html`, o los visitantes
seguirán ejecutando la versión anterior desde la caché del navegador.

## Probar en local

    python -m http.server 8060

y abrir <http://127.0.0.1:8060/index.html>.
