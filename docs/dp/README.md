# Paseos de largo mínimo por programación dinámica

Visualizador del Algoritmo 2 de la clase 04 de MA3705: tabulación de las tablas
T y Π para el problema de paseos de largo mínimo con exactamente k arcos.

Es una aplicación independiente del visualizador de `docs/`. No comparte código
con él, solo el archivo `js/cytoscape.min.js`.

## Modelo

El algoritmo supone un digrafo en el que todo nodo tiene un loop de largo 0.
`Digrafo.agregarLoops` añade los que falten. Con esa hipótesis, un paseo de a lo
más k arcos equivale a uno de exactamente k arcos, y T no aumenta al avanzar de
columna.

No se admiten arcos paralelos. Si el mismo par aparece dos veces, se conserva el
de menor largo.

## Recurrencia

    T[b,0] = 0 si b = s, y +∞ en caso contrario
    T[b,i] = mín { T[a,i-1] + ℓ(a,b) : a ∈ N⁻(b) }
    Π[b,i] ∈ argmin de esa expresión, si T[b,i] < +∞

## Interfaz

Las tablas T y Π se muestran una junto a otra, ambas de tamaño |V| por k+1.

La primera línea del algoritmo asigna +∞ a toda T y ⊥ a todo Π, y las tablas lo
reflejan: desde el primer paso aparecen completas con esos valores, en gris
claro. Cada celda pasa a color normal cuando el algoritmo fija su valor
definitivo, siguiendo el orden del pseudocódigo: columna a columna y, dentro de
cada columna, nodo a nodo.

El panel de las tablas tiene alto limitado y cada tabla se desplaza por dentro,
con los encabezados de fila y de columna fijos. Así una instancia con k grande
no reduce el espacio del grafo.

Π[b,i] es el penúltimo nodo de un paseo óptimo. Vale ⊥ cuando i = 0 o cuando
T[b,i] es +∞, es decir cuando no existe tal paseo. La casilla de la barra oculta
la tabla Π si no se necesita.

Al pulsar una celda (b,i) con i mayor o igual que 1 se marcan las celdas
(a,i-1) para todo a en N⁻(b), junto con los arcos correspondientes del grafo, y
se muestra la expresión completa del mínimo. Volver a pulsar la misma celda
quita la marca.

Los colores siguen los de las diapositivas: la columna i-1 en celeste, la celda
en cálculo en verde y las celdas de N⁻(b) en azul.

## Controles

- Reproducción paso a paso, con avance y retroceso por columna completa. El
  botón de reproducir ejecuta el algoritmo si aún no se ha ejecutado, o si
  cambiaron el origen o k desde la última ejecución.
- Velocidad en pasos por segundo, con atajos de 1, 4, 15, 50 y 100.
- Reconstrucción del paseo óptimo (Algoritmo 3) para el destino elegido. Al
  terminar el cálculo el paseo queda marcado en el digrafo y en las dos tablas:
  en la columna i se marca la celda del nodo que el paseo ocupa en esa columna.
  Seleccionar una celda tiene prioridad sobre ese marcado y lo devuelve al
  soltar la selección.
- Exportación de la tabla T en CSV.

## Edición de la instancia

El botón Editar abre un diálogo con la matriz de largos. La fila es el nodo de
origen y la columna el de destino. Una casilla vacía significa que el arco no
existe. La diagonal son los loops de largo 0 del preprocesamiento y no se
edita. Los nombres de los nodos se escriben en la primera columna y la cabecera
de la columna correspondiente los sigue.

La edición ocurre sobre una copia. El digrafo en pantalla no cambia hasta
pulsar Aplicar, y Cancelar descarta todo. Aplicar reemplaza la instancia y
borra la traza y las tablas, porque corresponden al digrafo anterior.

Los nodos que ya existían conservan su posición en el lienzo, incluso al
renombrarlos; los nuevos se reparten en un círculo.

Aplicar valida antes de reemplazar y no cierra el diálogo si hay un problema.
Se informa el primero que se encuentra, con la casilla o el nombre concreto:

    El nodo de la fila 2 no tiene nombre.
    El nombre "s" está repetido.
    El largo del arco s → a no es un número: "diez".
    el nodo "s__a" choca con el identificador interno del arco s -> a.

## Límites

La aplicación admite entre 2 y 20 nodos, y k entre 0 y 200. El tope de 20 es
de la aplicación entera, no solo del editor: la matriz de largos tiene n²
casillas y las tablas T y Π se leen en pantalla completas. Es una herramienta
de demostración.

El tope rige en las tres vías de entrada. El generador rechaza un valor fuera
de rango con un mensaje, no lo acorta en silencio, porque un valor recortado
produce una instancia distinta de la pedida. El editor desactiva el botón de
agregar al llegar a 20. Un archivo JSON con más de 20 nodos se rechaza al
cargarlo, indicando cuántos trae.

k vale 6 por omisión. El botón k = n lo iguala al número de nodos de la
instancia cargada, que es el valor a partir del cual T deja de cambiar si no
hay ciclos de largo negativo.

La traza guarda un evento por cada comparación del algoritmo. Su tamaño es
exactamente

    3 + k(2n + 2m + 2)

con m el número de arcos incluidos los loops. Antes de ejecutar se calcula ese
valor y se rechaza la ejecución si supera 400.000 pasos. Con el tope de 20
nodos ese límite queda fuera de alcance: el caso mayor es el digrafo completo
con k = 200, que da 176.403 pasos. La comprobación se conserva como
verificación del cálculo. Como referencia, 20 nodos con densidad 0,35 y k = 20
producen 6.963 pasos.

## Instancias

Cinco ejemplos: ciclo de 4 nodos, pesos negativos, ciclo de largo negativo,
camino dirigido e instancia con nodos inalcanzables.

En la instancia de pesos negativos el arco (t,c) tiene largo -3 y el arco (c,t)
largo 2, de modo que el ciclo c → t → c mide -1. El paseo óptimo a t da vueltas
a ese ciclo y T decrece cada dos columnas. El generador aleatorio
construye primero un camino dirigido, de modo que todos los nodos son
alcanzables desde el primero.

## Formato de archivo

```json
{
  "nodos": [{"id": "s", "pos": [90, 270]}],
  "arcos": [{"origen": "s", "destino": "a", "largo": 4}]
}
```

Los loops no se declaran: los añade el preprocesamiento. `Digrafo.desdeObjeto`
valida el archivo y lo rechaza con un mensaje que indica el problema.

## Ejecución local

```bash
python -m http.server 8070
```

desde `docs/`, y abrir <http://127.0.0.1:8070/dp/index.html>.

## Publicación

GitHub Pages sirve todo `docs/`, de modo que esta aplicación queda disponible en
la ruta `/dp/` del mismo sitio sin configuración adicional.
