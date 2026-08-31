# Textos de la aplicacion de MST

Edita este archivo y avisame. Los tres pseudocodigos vienen de las laminas de
la clase 09; hay dos cambios respecto de lo que esta escrito ahi, ambos
deliberados:

- En Jarnik-Prim la lamina escribe `Reducir-valor(W, u, D[u])`, pero la clave
  que baja es la de `v`, no la de `u`, y la cola se llama `Q` en la linea 2 y
  `W` dentro del ciclo. Aqui va `Reducir-valor(Q, v, D[v])`, con `Q` en todas
  partes.
- En Boruvka la lamina asigna `Aux` dos veces: primero `Aux <- vacio` y despues
  `Aux <- {e_K : ...}`. Se conservan las dos lineas tal cual.

Las lineas que empiezan por % agrupan las instrucciones que se ejecutan en un
mismo paso de la animacion. No llevan numero y no admiten punto de
interrupcion; el paso resalta el bloque entero.

Las instrucciones estan numeradas porque cada paso apunta a una o varias. Si
agregas, quitas o mueves lineas, dimelo y reajusto esa correspondencia.

---

## Jarník–Prim  (prim)

Complejidad: O(m + n log n)

### Descripcion

Mantiene un conjunto U que empieza en la raíz y crece de a un nodo. El corte es δ(U) y en cada vuelta entra su arista de peso mínimo.

La versión que se muestra guarda en D[v] el peso de la arista más liviana que une v con U, y en Π[v] su otro extremo, sobre una cola de prioridad Q. Es la de la lámina que compara Prim con Dijkstra: el pseudocódigo es el mismo salvo la condición del si, que aquí compara w(uv) y allá D[u] + ℓ(u,v).

La arista {Π[u], u} se dibuja como parte del árbol cuando u sale de Q, que es el momento en que deja de poder cambiar.

### Pseudocodigo

   1  Jarník–Prim(G, r, w)
      % inicializar
   2    para v ∈ V:  D[v] ← +∞;  Π[v] ← ⊥
   3    D[r] ← 0;  Q ← {(x, D[x]) : x ∈ V}
   4    mientras Q no esté vacía:
      % extraer mínimo
   5      (u, D[u]) ← Extraer-mínimo(Q)
      % aumentar
   6      para v ∈ N(u) con v en Q:
   7        si w(uv) < D[v]:
   8          D[v] ← w(uv)
   9          Π[v] ← u
  10          Reducir-valor(Q, v, D[v])
  11    devolver E_Π

## Kruskal  (kruskal)

Complejidad: O(m log n)

### Descripcion

Recorre las aristas de menor a mayor peso y acepta la que une dos componentes distintas del bosque actual. La que tiene sus dos extremos en la misma componente se rechaza: agregarla cerraría un ciclo.

La arista aceptada es la primera de δ(K) para la componente K de uno de sus extremos, de modo que la regla de corte se aplica con ese corte.

El ciclo recorre las m aristas aunque el árbol quede fijado antes.

### Pseudocodigo

   1  Kruskal(G, w)
      % inicializar
   2    ordenar E = {e₁, …, e_m} de menor a mayor peso
   3    F ← ∅
   4    para i ← 1 hasta m:
      % decidir
   5      si los extremos de eᵢ están en componentes distintas de (V, F):
   6        F ← F + eᵢ
   7    devolver F

## Borůvka  (boruvka)

Complejidad: O(m log n)

### Descripcion

Trabaja por fases. En cada una, toda componente del bosque actual elige la arista de peso mínimo que sale de ella, y después se agregan todas juntas.

Cada componente se une al menos con otra, de modo que su número se reduce al menos a la mitad en cada fase: hay O(log n) fases y cada una cuesta O(m).

Dos componentes pueden elegir la misma arista, y entonces se agrega una sola vez: en una fase entran menos aristas que componentes había.

### Pseudocodigo

   1  Borůvka(G, w)
      % inicializar
   2    F ← ∅
   3    mientras F no sea conexo:
      % elegir
   4      Aux ← ∅
   5      para cada componente K de (V, F):
   6        e_K ← arista mínima de δ(K)
   7      Aux ← {e_K : K componente de (V, F)}
      % aumentar
   8      F ← F ∪ Aux
   9    devolver F
