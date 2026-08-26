# SSSP: caminos mínimos desde un origen

Visualizador de cinco algoritmos sobre digrafos: BFS, DFS, Dijkstra,
Bellman-Ford y caminos mínimos en un DAG por orden topológico.

La aplicación trabaja solo con digrafos. Un archivo que declare
`"dirigido": false` se rechaza en lugar de convertirlo: el grafo resultante no
sería el que el usuario escribió.

La lista de algoritmos los muestra todos siempre. Los que no aplican a la
instancia cargada quedan desactivados, con el motivo en el título de la opción,
en lugar de desaparecer de la lista.

## Algoritmos

Cada uno emite una traza de eventos con el mismo vocabulario: `visitar_nodo`,
`procesar_nodo`, `explorar_arco`, `relajar`, `descartar_arco`,
`arco_solucion`, `nodo_finalizado` y `fin`. El campo `linea` indica la línea
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

## Edición de la instancia

El botón Editar abre un diálogo con la matriz de pesos. La fila es el nodo de
origen y la columna el de destino. Una casilla vacía significa que el arco no
existe. La diagonal también se edita: un arco de un nodo a sí mismo es válido en
este modelo, a diferencia de la aplicación de programación dinámica, donde la
diagonal son los loops del preprocesamiento y vale 0.

La edición ocurre sobre una copia. El digrafo en pantalla no cambia hasta pulsar
Aplicar, y Cancelar descarta todo. Aplicar valida antes de reemplazar y no
cierra el diálogo si hay un problema; se informa el primero que se encuentra,
con la casilla o el nombre concreto.

Los nodos que ya existían conservan su posición en el lienzo, incluso al
renombrarlos; los nuevos se reparten en un círculo.

## Límites

La aplicación admite entre 2 y 30 nodos. Es una herramienta de demostración: la
tabla de vectores tiene una columna por nodo, la matriz del editor tiene n²
casillas y el grafo tiene que seguir siendo legible.

El tope rige en las tres vías de entrada. El generador rechaza un valor fuera de
rango con un mensaje, en lugar de acortarlo. El editor desactiva el botón de
agregar al llegar a 30. Un archivo con más nodos se rechaza al cargarlo,
indicando cuántos trae.

## Vectores D y Π

En la columna del pseudocódigo hay una tabla con los vectores que mantiene el
algoritmo, una fila por nodo y una columna por vector, reconstruida desde la
traza en cada paso. En vertical ocupa poco ancho, que es lo escaso en esa
columna, y crece hacia abajo, donde se desplaza por dentro. Cada algoritmo
declara en el registro cuáles muestra:

| Algoritmo | Vectores | Nodos cerrados |
|---|---|---|
| BFS | D, Π | Finalizados |
| DFS | Π | Finalizados |
| Dijkstra | D, Π | S |
| Bellman-Ford | D, Π | no aplica |
| DAG por orden topológico | D, Π | Procesados |

DFS no calcula distancias: solo el padre de cada nodo en la arborescencia de
profundidad. Bellman-Ford no cierra nodos, porque revisa todos los arcos en
cada pasada.

Un nodo alcanzable desde un ciclo de peso negativo no tiene distancia mínima
definida. Su casilla en D muestra −∞ y no el valor que quedó en la última
pasada, que no es una respuesta; la de Π muestra ⊥. Las dos van marcadas, igual
que el nodo en el grafo.

Las casillas van vacías hasta que se ejecuta la línea que asigna los valores
iniciales, de modo que ese paso también se ve.

La cabecera del panel ocupa una línea de alto fijo. Su texto crece con el número
de nodos cerrados, y el recuento va delante de la lista: la línea se recorta por
el final.

## Cola y pila

BFS mantiene una cola y DFS una pila. El panel las muestra en una línea sobre la
tabla.

La línea conserva todo lo que ha entrado, en orden de entrada. Lo que ya salió
va tachado en su sitio, de modo que se lee el recorrido completo y no solo lo
que queda dentro. El que sale a continuación va en naranjo: el primero que
sigue dentro en una cola, el último en una pila.

Las dos se reconstruyen desde la traza. Los dos algoritmos usan los mismos
eventos con significados distintos, de modo que el registro declara cuál de las
dos reglas se aplica:

| | Entra | Sale |
|---|---|---|
| Cola de BFS | `visitar_nodo` | `procesar_nodo` |
| Pila de DFS | `visitar_nodo` | `nodo_finalizado` |

En DFS la pila es la de la recursión: `visitar(u)` apila u y su fin lo desapila,
de modo que lo que sigue dentro es el camino desde el origen hasta el nodo en
curso.

Con muchos nodos la línea desborda su ancho, de modo que se desplaza para dejar
a la vista el que sale a continuación y lo que viene detrás. Ocupa su alto
también en los tres algoritmos que no mantienen ninguna de las dos estructuras.

## Camino a un destino

El desplegable de la cabecera del panel elige un nodo destino. La aplicación
reconstruye el camino desde el origen siguiendo Π hacia atrás, tal como está en
ese paso, y lo marca en morado: los nodos y arcos del camino en el grafo, y sus
casillas en D y en Π.

El texto de al lado da el camino y su largo, o el motivo de que no exista: que
Π todavía no llegue al origen, o que el nodo sea alcanzable desde un ciclo de
peso negativo.

## Ciclo de Π

Bellman-Ford deja un ciclo en Π mientras un ciclo de peso negativo sigue
mejorando las distancias: cada nodo del ciclo acaba apuntando al anterior. Al
retroceder desde el destino se vuelve sobre un nodo ya visitado.

Ese ciclo es el testigo del peso negativo. Se marca en rojo: los nodos y arcos
del ciclo en el grafo y sus casillas en la tabla. El texto lo escribe cerrado y
con su peso, por ejemplo `Π forma un ciclo desde 4:  5 → 3 → 4 → 5  (peso -2)`.

En la instancia de ejemplo el camino a 4 es válido hasta el paso 21, `0 → 2 → 3
→ 4` de largo 7, y en el paso 22 Π cierra el ciclo y pasa a rojo.

## Arcos que entran a un nodo

Al pulsar la celda de un nodo se marcan en azul los arcos que entran a él y los
nodos de los que salen, y bajo la tabla aparece la expresión del mínimo con los
valores de ese paso:

    D[c] = 6  ←  mín { D[a] + 3 = 6,  D[b] + 7 = 9 }

Es lo que compite por la distancia de ese nodo. Volver a pulsarla quita la
marca.

## Colores de los arcos

La punta de la flecha escala con el ancho del arco. Va a 1,9 veces su tamaño
por omisión: con el tamaño normal y arcos de 2 px apenas se distinguía el
sentido.

Un arco sin examinar va en gris oscuro y uno ya examinado en celeste. La marca
se aplica en los algoritmos que no vuelven sobre un arco, los que declaran
`arcosNoSeRevisitan` en el registro. Bellman-Ford recorre todos los arcos en
cada pasada y no marca ninguno.

Sobre esa base van, de menos a más específico, la arborescencia de caminos en
verde, el paso actual en naranjo, el camino al destino en morado y el ciclo de Π
en rojo.

## Dijkstra

La elección del mínimo es por barrido sobre V∖S y desempata por el nombre del
nodo. Sin ese desempate, con dos nodos a la misma distancia el elegido
dependería del orden de la lista y la animación dejaría de ser reproducible.

## Archivos

- `js/grafo.js` — modelo de grafo, generador aleatorio con semilla, instancias
  de ejemplo y validación del formato de archivo.
- `js/algoritmos.js` — los cinco algoritmos y sus pseudocódigos.
- `js/viz.js` — traducción de eventos a clases de Cytoscape, y reconstrucción
  de los vectores y del camino a un destino.
- `js/editor.js` — diálogo de la matriz de pesos.
- `js/app.js` — interfaz. Es la única capa que accede al DOM.

## Formato de archivo

```json
{
  "dirigido": true,
  "nodos": [{"id": "0", "label": "0", "pos": [120.5, 340.2]}],
  "aristas": [{"origen": "0", "destino": "1", "weight": 4}]
}
```

`dirigido` es opcional; si aparece debe ser verdadero. `label` y `pos` también
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

## Espacio para el grafo

El botón de la izquierda de la barra pliega la columna de controles. Con tres
columnas el lienzo gana el ancho que ocupaban, unos 286 px; en ventanas
estrechas, donde las columnas se apilan, quita ese bloque de la pila y acorta la
página a la mitad. En ventanas estrechas el botón se queda con la flecha: con
la palabra no cabe en la barra.

La columna del pseudocódigo lleva debajo la tabla de vectores y, al final, la
leyenda de colores, plegada. Tanto el estado de la leyenda como el de la columna
de controles quedan guardados en el navegador.

La tabla está ahí y no bajo el grafo porque el alto de la columna del grafo es
lo que determina el tamaño del dibujo.

## Altura de la barra

El texto del paso ocupa una línea de alto fijo. La barra está encima del lienzo
del grafo y el alto de una determina el de la otra, de modo que un texto que
creciera movería el grafo en mitad de la animación. Lo mismo vale para el
contador de iteraciones de Bellman-Ford.

## Reproducción

El botón de reproducir ejecuta el algoritmo si aún no hay traza, o si el
algoritmo o el origen cambiaron desde la última ejecución.

La velocidad se expresa en pasos por segundo, con atajos de 1, 5, 15, 50 y 100.
`setInterval` no entrega disparos fiables por debajo de 16 ms, de modo que para
velocidades mayores a unos 62 pasos por segundo cada disparo avanza varios
pasos. Los puntos de interrupción se comprueban en cada paso intermedio del
disparo.

## Ejecución local

Con el servidor de archivos estáticos del README de la raíz en marcha, la
aplicación queda en <http://127.0.0.1:8060/visualizador/>.
