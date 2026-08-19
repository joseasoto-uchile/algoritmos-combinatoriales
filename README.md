# Algoritmos combinatoriales

Visualizadores de algoritmos sobre grafos para el curso MA3705 de la
Universidad de Chile. Se ejecutan por completo en el navegador, sin servidor.

<https://joseasoto-uchile.github.io/algoritmos-combinatoriales/>

## Aplicaciones

`docs/` contiene el sitio publicado. Cada aplicación es independiente: tiene su
propio HTML, CSS y JavaScript, y no importa código de la otra. Lo único
compartido es `docs/js/cytoscape.min.js`.

### 1. Programación dinámica (`docs/dp/`)

Algoritmo 2 de la clase 04: tabulación de T y Π para paseos de largo mínimo con
exactamente k arcos, sobre un digrafo con loops de largo 0. Muestra las dos
tablas mientras se calculan columna a columna, marca las celdas de las que
depende una celda al pulsarla, y reconstruye el paseo óptimo por el Algoritmo 3.
Incluye un editor de la instancia por matriz de largos. Ver `docs/dp/README.md`.

### 2. Recorridos y caminos mínimos (`docs/visualizador/`)

BFS, DFS, Dijkstra, Bellman-Ford y caminos mínimos en un DAG. Cada algoritmo
emite una traza de eventos que la interfaz reproduce paso a paso, con el
pseudocódigo resaltado y puntos de interrupción por línea. Ver
`docs/visualizador/README.md`.

## Arquitectura

Las dos aplicaciones siguen el mismo esquema. El algoritmo no dibuja: produce
una lista de eventos, uno por cada paso que se quiere mostrar.

    {"tipo": "relajar", "u": "A", "v": "B", "nueva_dist": 7, "paso": 4}

La capa de dibujo es la única que traduce esos eventos en clases de Cytoscape.
La animación no puede desviarse de lo que el algoritmo hace, porque no existe
una segunda implementación del algoritmo para la animación.

Reproducir un paso hacia atrás no deshace el estado: se reconstruye desde el
principio de la traza hasta el paso pedido.

## Ejecución local

```bash
python -m http.server 8060
```

desde `docs/`, y abrir <http://127.0.0.1:8060/>. Cualquier servidor de archivos
estáticos sirve; no hay compilación ni dependencias que instalar.

## Caché del navegador

Al modificar un archivo de `js/` o `css/`, incrementar el valor de `?v=` en la
etiqueta correspondiente del `index.html` de esa aplicación. En caso contrario
los visitantes ejecutan la versión anterior desde la caché.

## Seguridad

Cada `index.html` declara una Content-Security-Policy con `script-src 'self'`.
Los identificadores de nodo son datos de entrada: llegan de los archivos que
carga el usuario y nunca se concatenan dentro de `innerHTML`. Los desplegables y
las tablas se construyen con la API del DOM.

Cytoscape está incluido en el repositorio, no se carga de un CDN, de modo que
las páginas funcionan sin acceso a red externa. Versión 3.30.2:

    sha256: 83e8c54a6bec655bfd81df07df605649c268af69aeca67a5ea2da54ea42dac81

`.gitattributes` lo marca como binario para que git no altere sus fines de
línea y su hash siga coincidiendo con el del archivo publicado por el CDN.

## Versión Python

El repositorio empezó como una aplicación Dash en Python, con los mismos cinco
algoritmos del visualizador de recorridos y una herramienta que comparaba traza
a traza las dos implementaciones. Está en la rama `python-deprecado` y no recibe
mantenimiento. La versión oficial es la de este árbol.

## Publicación

GitHub Pages sirve `docs/` de la rama `main`. GitHub Pages solo admite la raíz
del repositorio o `docs/` como origen, de ahí el nombre de la carpeta.

## Licencia

MIT. Uso educativo. © 2026 José A. Soto, Universidad de Chile.
Asistido por Claude (Anthropic).
