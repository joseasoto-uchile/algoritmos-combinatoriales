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

Las tablas T y Π se muestran una junto a otra, ambas de tamaño |V| por k+1. Se
dibujan completas desde el principio y cada celda se rellena cuando el algoritmo
la termina, siguiendo el orden del pseudocódigo: columna a columna y, dentro de
cada columna, nodo a nodo.

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

- Reproducción paso a paso, con avance y retroceso por columna completa.
- Reconstrucción del paseo óptimo (Algoritmo 3) para el destino elegido, con la
  opción de marcarlo en el grafo.
- Exportación de la tabla T en CSV.

## Instancias

Cinco ejemplos: ciclo de 4 nodos, pesos negativos, ciclo de largo negativo,
camino dirigido e instancia con nodos inalcanzables. El generador aleatorio
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
