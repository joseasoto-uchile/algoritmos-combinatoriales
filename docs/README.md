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
2. En Settings → Pages, elegir la rama y la carpeta `/docs`.

No hace falta build: son archivos estáticos y sin dependencias externas.
Cytoscape va incluido en `js/cytoscape.min.js` (3.30.2) en vez de cargarse
desde un CDN: si la red bloquea el CDN la página salía en blanco, y así además
funciona sin conexión. Para actualizarlo, descargar la versión nueva sobre ese
archivo y subir el `?v=` de su etiqueta en `index.html`.

## Seguridad

`index.html` declara una Content-Security-Policy por `<meta>` con
`script-src 'self'`. Es la segunda capa contra la inyección de HTML: la causa
está corregida en `app.js` —los `<option>` se construyen con la API del DOM,
nunca concatenando identificadores dentro de `innerHTML`— pero la CSP impide
además que un manejador en línea inyectado llegue a ejecutarse.

**Al tocar la interfaz, no usar `innerHTML` con nada que venga del archivo que
carga el usuario.** Los identificadores de nodo son datos de entrada: un nodo
llamado `"><img src=x onerror=...>` ejecutaba código al abrir el archivo.

## Al modificar js/ o css/

Subir el número de `?v=` en las etiquetas de `index.html`, o los visitantes
seguirán ejecutando la versión anterior desde la caché del navegador.

## Probar en local

    python -m http.server 8060

y abrir <http://127.0.0.1:8060/index.html>.
