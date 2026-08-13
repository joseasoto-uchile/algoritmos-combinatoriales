# algoritmos-combinatoriales

Aplicación web para ejecutar paso a paso algoritmos sobre grafos: BFS, DFS,
Dijkstra, Bellman-Ford y caminos mínimos en DAG.

Stack: Dash (servidor e interfaz), Dash Cytoscape (dibujo del grafo) y
NetworkX (estructura de datos y generación de instancias).

## Dos implementaciones

El repositorio contiene la misma aplicación escrita dos veces:

| Implementación | Ubicación | Uso |
|---|---|---|
| Python con Dash | raíz del repositorio, en las dos ramas | Desarrollo de los algoritmos |
| JavaScript | `docs/`, solo en la rama `version-estatica` | Publicación en GitHub Pages |

La versión Dash resuelve cada paso de la traza con un callback en el servidor,
por lo que necesita un proceso Python en ejecución. GitHub Pages solo sirve
archivos estáticos y no puede alojarla. La versión JavaScript existe por ese
motivo.

La rama `main` contiene solo la versión Python. La rama `version-estatica`
contiene esa versión más los directorios `docs/` (port a JavaScript) y
`herramientas/` (verificador de paridad). Los cambios en los algoritmos se
hacen en `main` y se trasladan con `git merge main`.

### Paridad entre ambas

Los algoritmos de `docs/js/algoritmos.js` emiten la misma traza que los de
`algorithms/`: los mismos tipos de evento, los mismos campos y los mismos
números de línea del pseudocódigo. Esa igualdad es la condición para que las
dos versiones muestren la misma animación.

Un cambio aplicado a una sola de las dos rompe esa igualdad. Antes de publicar
una modificación en cualquier algoritmo, ejecutar desde `version-estatica`:

```bash
python herramientas/verificar_paridad.py
```

Compara evento por evento sobre 12 instancias (las 6 de ejemplo y 6 aleatorias
que cubren grafos dirigidos, no dirigidos, con pesos negativos, DAG y densos).
Comprueba además que ambas versiones rechacen los mismos 13 archivos inválidos
con el mismo mensaje. Devuelve 0 si coinciden y 1 con el primer evento distinto
en caso contrario. Requiere Node.js.

Este verificador detectó dos errores: la propagación del ciclo negativo en
Bellman-Ford usaba `set`, cuya iteración depende del hash que Python aleatoriza
por proceso, de modo que el orden de marcado cambiaba entre ejecuciones del
mismo grafo; y las dos versiones aceptaban archivos malformados aplicando
correcciones distintas.

## Instalación

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Ejecución

```bash
python app.py
```

Abrir `http://127.0.0.1:8050`. Al cargar la página se genera una instancia
aleatoria.

Variables de entorno:

- `DASH_TOOLBAR=0` oculta la barra de depuración de Dash y mantiene la recarga
  automática.
- `DASH_DEBUG=0` desactiva también la recarga automática.

## Arquitectura

El diseño separa cuatro capas que se comunican mediante estructuras de datos
serializables:

```
graph_model/   Modelo de grafo (NetworkX), generación aleatoria, instancias de
               ejemplo y serialización JSON. No depende de algoritmos ni de la
               interfaz.

algorithms/    Implementación de cada algoritmo (BFS, DFS, Dijkstra,
               Bellman-Ford, caminos mínimos en DAG). Cada uno recibe un grafo
               y un nodo origen y devuelve (resultado, traza). La traza es una
               lista de eventos. No se usan las funciones de NetworkX porque no
               exponen los pasos intermedios necesarios para la animación.
               registry.py contiene el catálogo: agregar un algoritmo requiere
               una función y una entrada en el registro, sin modificar viz/ ni
               app.py.

viz/           Convierte (grafo, traza, paso actual) en elementos y clases de
               estilo de Cytoscape. Es la única capa que conoce a la vez el
               formato de los eventos y el de Cytoscape.

app.py         Interfaz Dash: generación y carga de instancias, selección de
               algoritmo y reproducción paso a paso mediante dcc.Interval.
```

La versión JavaScript de `docs/` reproduce estas capas en archivos
equivalentes: `grafo.js` corresponde a `graph_model/`, `algoritmos.js` a
`algorithms/`, `viz.js` a `viz/` y `app.js` a `app.py`.

### Formato de la traza

Cada algoritmo emite eventos con esta forma:

```json
{"tipo": "explorar_arista", "u": "A", "v": "B", "paso": 3}
{"tipo": "relajar", "u": "A", "v": "B", "nueva_dist": 7, "paso": 4}
{"tipo": "nodo_finalizado", "nodo": "A", "paso": 5}
```

`viz/elements.py` distingue dos clases de estado:

- Persistente, se acumula y permanece marcado: `visitar_nodo`,
  `nodo_finalizado`, `arista_solucion` y `ciclo_negativo`.
- Transitorio, se resalta solo durante ese paso: `explorar_arista`, `relajar`,
  `descartar_arista` y `procesar_nodo`.

Bellman-Ford emite además `inicio_iteracion` y `fin_iteraciones`, que la
interfaz usa para mostrar el número de pasada actual y el total.

### Formato de archivo

```json
{
  "dirigido": true,
  "nodos": [{"id": "0", "label": "0", "pos": [120.5, 340.2]}],
  "aristas": [{"origen": "0", "destino": "1", "weight": 4}]
}
```

Se guardan las posiciones de cada nodo para que al recargar el archivo el
dibujo sea el mismo.

`graph_model.model.validar_datos_grafo` rechaza los archivos que no cumplen el
formato e indica el problema encontrado. Las reglas son: peso presente,
numérico y finito; aristas que referencien nodos declarados; identificadores de
nodo únicos, no vacíos y de tipo texto o número; sin aristas repetidas; y sin
colisión entre un identificador de nodo y el identificador interno que se
genera para una arista. Los lazos se aceptan.

## Algoritmos y restricciones

| Algoritmo | Requiere pesos | Admite negativos | Requiere DAG | Complejidad |
|---|---|---|---|---|
| BFS | No | No aplica | No | O(V + E) |
| DFS | No | No aplica | No | O(V + E) |
| Dijkstra | Sí | No | No | O((V + E) log V) |
| Bellman-Ford | Sí | Sí | No | O(V · E) |
| Camino mínimo en DAG | Sí | Sí | Sí | O(V + E) |

La aplicación filtra el selector de algoritmos según las propiedades del grafo
cargado e indica el motivo por el que un algoritmo no está disponible.

## Trabajo pendiente

- Prim y Kruskal como módulos nuevos en `algorithms/` y sus entradas en el
  registro.
- Layout jerárquico para DAG mediante `dash_cytoscape.load_extra_layouts()` con
  la extensión `dagre`. Por ahora se ofrece `breadthfirst`.
- Importación y exportación en formato GraphML.
- Medición del rendimiento con grafos de más de 100 nodos.
