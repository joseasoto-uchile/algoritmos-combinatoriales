# Versión estática (JavaScript)

Port del visualizador a JavaScript, para publicarlo como sitio estático en
GitHub Pages sin un servidor Python.

## Motivo

La versión Dash resuelve cada paso de la traza con un callback en el servidor,
por lo que necesita un proceso Python en ejecución. GitHub Pages solo sirve
archivos estáticos. En esta versión el cálculo ocurre en el navegador.

## Equivalencia con la versión Python

Los algoritmos emiten la misma traza de eventos que los de `algorithms/`: los
mismos tipos, los mismos campos y los mismos números de línea del pseudocódigo.
La equivalencia se comprueba comparando evento por evento sobre 12 instancias.

Dos diferencias entre los lenguajes obligan a estos ajustes:

- La cola de prioridad de Dijkstra desempata por nombre de nodo, igual que
  `heapq` en Python, donde los elementos son tuplas `(distancia, nodo)`.
- El diccionario `padre` de Dijkstra es un `Map` y no un objeto. Las claves
  numéricas de un objeto se recorren en orden ascendente por especificación del
  lenguaje, no en orden de inserción, y las aristas de la solución deben
  emitirse en el orden en que se relajaron.

Para ejecutar la comprobación, desde la raíz del repositorio:

```bash
python herramientas/verificar_paridad.py
```

## Seguridad

`index.html` declara una Content-Security-Policy mediante una etiqueta `<meta>`
con `script-src 'self'`. Es la segunda capa frente a la inyección de HTML. La
causa está corregida en `app.js`: los elementos `<option>` se construyen con la
API del DOM y no concatenando identificadores dentro de `innerHTML`. La CSP
impide además que un manejador de eventos en línea llegue a ejecutarse.

Al modificar la interfaz, no usar `innerHTML` con datos procedentes del archivo
que carga el usuario. Los identificadores de nodo son datos de entrada: un nodo
llamado `"><img src=x onerror=...>` inyecta marcado si se concatena.

`Grafo.desdeObjeto` valida el archivo antes de construir el grafo y lo rechaza
con un mensaje que indica el problema. Las reglas coinciden con las de
`graph_model/model.py`.

## Publicación en GitHub Pages

1. Subir la rama `version-estatica` al repositorio.
2. En Settings, Pages, seleccionar esa rama y la carpeta `/docs`.

No requiere compilación ni dependencias externas. Cytoscape está incluido en
`js/cytoscape.min.js`, versión 3.30.2, y no se carga desde un CDN, de modo que
la página funciona sin acceso a red externa. Para actualizarlo, descargar la
versión nueva sobre ese archivo y subir el valor de `?v=` de su etiqueta en
`index.html`.

El archivo `.gitattributes` marca `js/cytoscape.min.js` como binario para que
git no modifique sus fines de línea. De ese modo su hash sigue coincidiendo con
el del archivo publicado por el CDN:

    sha256: 83e8c54a6bec655bfd81df07df605649c268af69aeca67a5ea2da54ea42dac81

## Caché del navegador

Al modificar cualquier archivo de `js/` o `css/`, incrementar el valor de `?v=`
en las etiquetas correspondientes de `index.html`. En caso contrario los
visitantes ejecutan la versión anterior desde la caché.

## Segunda aplicación: programación dinámica

`dp/` contiene un visualizador independiente del Algoritmo 2 de la clase 04,
que tabula las tablas T y Π para paseos de largo mínimo con exactamente k
arcos. No comparte código con esta aplicación, solo `js/cytoscape.min.js`.
Queda publicado en la ruta `/dp/` del mismo sitio. Ver `dp/README.md`.

Incluye un editor de la instancia por matriz de largos, en `dp/js/editor.js`,
limitado a 20 nodos.

## Ejecución local

```bash
python -m http.server 8060
```

desde este directorio, y abrir <http://127.0.0.1:8060/index.html>.
