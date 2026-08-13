# algoritmos-combinatoriales

Aplicación web interactiva para visualizar y ejecutar paso a paso algoritmos
sobre grafos: BFS, DFS, Dijkstra, Bellman-Ford y caminos mínimos en DAG.

Stack: **Dash** (servidor + UI reactiva) + **Dash Cytoscape** (visualización
interactiva del grafo) + **NetworkX** (estructura de datos y generación de
instancias).

## Dos implementaciones, a propósito

El repositorio mantiene **la misma herramienta escrita dos veces**. No es un
descuido ni una migración a medias:

| | Dónde | Para qué |
|---|---|---|
| **Python + Dash** | raíz del repositorio, en las dos ramas | Desarrollar. Es donde se escriben y prueban los algoritmos. |
| **JavaScript** | `docs/`, **solo en la rama `version-estatica`** | Publicar. Corre entera en el navegador, así que se sirve desde GitHub Pages sin servidor ni costo. |

La versión Dash resuelve cada paso de la traza con un callback en el servidor:
necesita un proceso Python vivo, y por eso no se puede publicar en GitHub
Pages. La versión JavaScript existe únicamente para eso.

`main` contiene solo la versión Python. `version-estatica` contiene esa misma
versión **más** `docs/` (el port a JavaScript) y `herramientas/` (el
verificador de paridad). Los cambios en los algoritmos se hacen en `main` y se
llevan a la otra rama con `git merge main`.

### El contrato entre ambas

Los algoritmos de `docs/js/algoritmos.js` emiten **exactamente la misma traza**
que los de `algorithms/`: mismos tipos de evento, mismos campos y mismos
números de línea del pseudocódigo. Esa igualdad es lo que hace que las dos
muestren la misma animación.

Es también lo primero que se rompe al tocar una sola de las dos. Antes de
publicar un cambio en cualquier algoritmo, desde `version-estatica`:

```bash
python herramientas/verificar_paridad.py
```

Compara evento por evento sobre 12 instancias (las 6 de ejemplo más 6
aleatorias que cubren dirigido/no dirigido, pesos negativos, DAG y denso).
Devuelve 0 si coinciden y 1 con el primer evento distinto si no. Requiere
Node.js.

> Este verificador ya encontró un error real: la propagación del ciclo
> negativo en Bellman-Ford usaba `set`, cuya iteración depende del hash que
> Python aleatoriza por proceso, así que el orden en que se marcaban los nodos
> cambiaba entre ejecuciones del mismo grafo.

Si en algún momento mantener las dos deja de compensar, la salida natural es
quedarse con la de JavaScript y archivar la Dash: hace lo mismo, se publica
gratis y no necesita servidor.

## Instalación

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Ejecutar

```bash
python app.py
```

Abre `http://127.0.0.1:8050` en el navegador. Al cargar la página se genera
automáticamente una instancia aleatoria de ejemplo.

## Arquitectura

El diseño separa cuatro capas que no se conocen entre sí más que por
contratos de datos simples (diccionarios/listas serializables):

La versión JavaScript de `docs/` refleja estas mismas capas archivo por archivo
(`grafo.js` ← `graph_model/`, `algoritmos.js` ← `algorithms/`, `viz.js` ←
`viz/`, `app.js` ← `app.py`), para que un cambio se pueda trasladar leyendo el
módulo equivalente.

```
graph_model/   Modelo de grafo (NetworkX) + generación aleatoria + serialización JSON.
               No sabe nada de algoritmos ni de UI.

algorithms/    Reimplementación a mano de cada algoritmo (BFS, DFS, Dijkstra,
               Bellman-Ford, caminos mínimos en DAG). Cada uno recibe un
               grafo y un nodo origen, y devuelve (resultado, traza).
               La traza es una lista de eventos —no usamos las funciones
               de NetworkX como caja negra porque no exponen los pasos
               internos que se necesitan para animar—.
               registry.py centraliza el catálogo: agregar un algoritmo
               nuevo (p. ej. Prim o Kruskal) es una función + una entrada
               en el registro, sin tocar viz/ ni app.py.

viz/           Traduce (grafo, traza, paso actual) -> elementos y clases
               de estilo de Cytoscape. Es la única capa que conoce el
               formato de eventos Y el formato de Cytoscape.

app.py         Capa de interacción Dash: controles de generación/carga/
               guardado, selección de algoritmo, y reproducción paso a
               paso (play/pausa/siguiente/anterior/velocidad) vía
               dcc.Interval.
```

### Formato de la traza

Cada algoritmo emite eventos como:

```json
{"tipo": "explorar_arista", "u": "A", "v": "B", "paso": 3}
{"tipo": "relajar", "u": "A", "v": "B", "nueva_dist": 7, "paso": 4}
{"tipo": "nodo_finalizado", "nodo": "A", "paso": 5}
```

`viz/elements.py` distingue dos tipos de estado visual:
- **Persistente** (se acumula y queda marcado): `visitar_nodo` → nodo
  visitado, `nodo_finalizado` → nodo finalizado, `arista_solucion` → arco
  del árbol resultante, `ciclo_negativo` → nodo afectado por un ciclo
  negativo (Bellman-Ford).
- **Transitorio** (solo se resalta mientras se reproduce ese paso puntual):
  `explorar_arista` / `relajar` / `descartar_arista` / `procesar_nodo`.

### Formato de archivo (JSON)

```json
{
  "dirigido": true,
  "nodos": [{"id": "0", "label": "0", "pos": [120.5, 340.2]}, ...],
  "aristas": [{"origen": "0", "destino": "1", "weight": 4}, ...]
}
```

Se guarda con las posiciones (`pos`) de cada nodo para que, al recargar el
archivo, el layout visual sea el mismo (reproducibilidad visual).

## Algoritmos disponibles y sus restricciones

| Algoritmo | Requiere pesos | Admite negativos | Requiere DAG |
|---|---|---|---|
| BFS | No | — | No |
| DFS | No | — | No |
| Dijkstra | Sí | No | No |
| Bellman-Ford | Sí | Sí (detecta ciclo negativo) | No |
| Camino mínimo en DAG | Sí | Sí | Sí |

La app filtra automáticamente el selector de algoritmos según las
propiedades del grafo cargado (dirigido/no dirigido, con pesos negativos,
si es DAG), usando `algorithms/registry.py`.

## Próximos pasos

- Agregar Prim y Kruskal (árbol de expansión mínima) como nuevos módulos
  en `algorithms/` + entrada en el registro.
- Layout jerárquico dedicado para DAGs (`dash_cytoscape.load_extra_layouts()`
  con la extensión `dagre`); por ahora se ofrece `breadthfirst` como
  aproximación jerárquica sin dependencias extra.
- Exportar/importar también en formato GraphML.
