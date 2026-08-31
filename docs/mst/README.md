# MST: árboles de expansión mínima

Jarník–Prim, Kruskal y Borůvka sobre grafos no dirigidos, con la traza
reproducible paso a paso. Corresponde a la clase 09.

## Un paso es una vuelta del ciclo

La unidad de la traza no es una arista, sino una iteración del ciclo del
pseudocódigo:

- **Jarník–Prim**: un paso saca un nodo de la cola, mete su arista en F y aplica
  de una vez todas las actualizaciones de D y Π que provoca. Un paso por nodo.
- **Kruskal**: un paso decide una arista de la lista ordenada. Un paso por
  arista, que es lo que hace el `para i ← 1 hasta m`.
- **Borůvka**: dos pasos por fase, las dos mitades del cuerpo del ciclo. En el
  primero todas las componentes eligen su arista mínima a la vez, que es como
  se hace; en el segundo entra Aux en F.

Sobre la instancia de la clase son 9, 12 y 6 pasos. La velocidad va de 1 a 20
pasos por segundo, no a 100 como en las otras dos aplicaciones: las trazas son
mucho más cortas.

## Grafos no dirigidos y conexos

Es la única de las tres aplicaciones que no trabaja con digrafos. Un archivo con
`"dirigido": true` se rechaza en lugar de convertirse, porque el grafo
resultante no sería el que el usuario escribió. La clave `aristas` del formato
se conserva, con `origen` y `destino` como los dos extremos: el orden en que se
escriban no significa nada, y `{u,v}` y `{v,u}` son la misma arista.

Los tres algoritmos suponen el grafo **conexo**. La conexidad se comprueba al
cargar un archivo y al aplicar cambios en el editor, y el generador la garantiza
por construcción repartiendo primero un árbol de conectividad. Un lazo se
rechaza: nunca forma parte de un árbol de expansión y solo ensucia el
ordenamiento de Kruskal.

## Orden total de las aristas

Los tres algoritmos suponen las aristas totalmente ordenadas, primero por peso y
entre pesos iguales por el orden en que se declararon. Es la regla de desempate
fija de la clase.

No es una comodidad: sin ella Borůvka no es correcto, porque dos componentes
pueden elegir aristas de igual peso en sentidos opuestos y cerrar un ciclo. Con
el orden fijo los tres devuelven el mismo árbol, y la instancia de ejemplo de
pesos empatados muestra que sin él el árbol no sería único.

## Los tres algoritmos

Todos mantienen un óptimo parcial F y aplican la regla de corte. Difieren en el
corte que consideran y en cómo encuentran su arista mínima.

| Algoritmo | Corte | Elección |
| --- | --- | --- |
| Borůvka | δ(K) para cada componente K | en paralelo, una arista mínima por corte |
| Kruskal | — | arista mínima que conecta componentes distintas |
| Jarník–Prim | δ(U) para la componente de la raíz | arista mínima que sale de U |

De Jarník–Prim se muestra la versión con cola de prioridad de la lámina que lo
compara con Dijkstra: el pseudocódigo es el mismo salvo la condición del si, que
aquí compara `w(uv)` y allá `D[u] + ℓ(u,v)`. La cola se recorre por barrido, y
`Extraer-mínimo` y `Reducir-valor` quedan como una caja negra: lo que se ve es
su efecto sobre D y Π.

La arista `{Π[u], u}` se dibuja como parte del árbol cuando u sale de la cola,
que es el momento en que deja de poder cambiar. El pseudocódigo devuelve `E_Π`
al final, de modo que sin eso el árbol no crecería durante la animación.

## Panel lateral

La columna entre el grafo y el pseudocódigo muestra la estructura principal del
algoritmo, que es distinta en cada uno. El registro lo declara con `panel`.

- **Jarník–Prim**: una fila por nodo con D y Π. Los nodos que ya salieron de la
  cola aparecen sombreados, el que salió en este paso con borde naranjo y con
  borde azul aquellos cuya casilla cambió en él.
- **Kruskal**: la lista de aristas en el orden en que la recorre. Lo aceptado va
  en verde y lo rechazado tachado en su sitio, no se quita, de modo que se ve el
  recorrido completo. La lista se desplaza sola para dejar a la vista la arista
  en examen.
- **Borůvka**: una fila por componente de (V, F) con la arista mínima que
  eligió en la fase en curso, y bajo la tabla el conjunto Aux. Dos componentes
  pueden elegir la misma arista, y en Aux entra una sola vez: por eso Aux tiene
  menos elementos que filas hay.

Sobre la tabla van dos líneas de alto fijo: el tamaño y el peso de F, y las
componentes de (V, F). El alto fijo importa porque la cabecera del panel
determina el del lienzo, y un texto que creciera movería el grafo en mitad de la
animación. El recuento va delante de la lista: la línea se recorta por el final.

## Colores

Un color por componente de (V, F), con una paleta de ocho. Las componentes de un
solo nodo no se pintan: lo que interesa ver es cuáles se han unido ya. Con más
de ocho los colores se repiten, de modo que el color es una pista y el dato está
en la tabla y en la línea de componentes.

Las aristas llevan su propio juego: gris oscuro sin examinar, celeste ya
examinada, roja punteada descartada y verde gruesa dentro de F. Sobre eso va el
naranjo del paso actual.

Las marcas duran lo que dura el algoritmo en Jarník–Prim y Kruskal, que no
vuelven sobre una arista. En Borůvka se borran al empezar cada fase, porque una
arista que no fue la mínima de un corte puede ser la elegida en la fase
siguiente; el registro lo declara con `aristasNoSeRevisitan`. Por lo mismo, en
Borůvka ninguna arista queda en rojo: las que no se eligieron están examinadas,
no descartadas.

## Instancias de ejemplo

- **Instancia de la clase**: la de las láminas, siete nodos y diez aristas de
  pesos distintos. El árbol es único: `{ab, bc, de, fg, ce, eg}`, de peso 24.
- **Pesos empatados**: el árbol no es único. Desde la raíz por omisión,
  Jarník–Prim devuelve `{ab, ad, bc, be, cf}` y Kruskal `{ab, ad, bc, cf, de}`,
  los dos de peso 6.
- **Ciclo**: el árbol es el ciclo sin su arista más pesada, y cada algoritmo
  llega a ella en un momento distinto.
- **Rejilla 4×5**: 20 nodos y 31 aristas; el árbol usa 19.
- **Parejas por fases**: cuatro parejas unidas por aristas baratas. Borůvka
  reduce el número de componentes a la mitad en cada fase y cierra en tres.
- **Pesos negativos**: el árbol sigue bien definido, porque todo árbol de
  expansión tiene el mismo número de aristas.
- **Grafo completo**: 15 aristas entre 6 nodos.

## Editor

La matriz es simétrica: se escribe el triángulo superior y el inferior se copia
solo. La diagonal no se edita. El grafo no cambia hasta pulsar Aplicar, y si el
resultado no es conexo el diálogo se queda abierto con el motivo.

## Comprobación cruzada

`herramientas/verificar_mst.js` ejecuta los tres algoritmos sobre los ejemplos y
sobre grafos aleatorios y comprueba que devuelven el mismo peso total, que el
árbol tiene n−1 aristas y que sobre instancias de pesos distintos los tres dan
el mismo conjunto de aristas. Compara además contra un Kruskal de referencia
escrito aparte, que no comparte código con la aplicación.

```bash
node herramientas/verificar_mst.js 500
```
