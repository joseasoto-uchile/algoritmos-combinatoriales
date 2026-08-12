"""Registro central de algoritmos disponibles.

Este es el único lugar que la app Dash consulta para saber qué algoritmos
ofrecer. Agregar un algoritmo nuevo (p. ej. Prim o Kruskal) significa:
1. Escribir su módulo con una función `algo_trace(G, origen) -> (resultado, trace)`.
2. Agregar una entrada aquí.
No hace falta tocar la capa de visualización (viz/) ni app.py.
"""
from __future__ import annotations

import networkx as nx

from .bfs import bfs_trace
from .dfs import dfs_trace
from .dijkstra import dijkstra_trace
from .bellman_ford import bellman_ford_trace
from .dag_shortest_path import dag_shortest_path_trace

ALGORITMOS = {
    "bfs": {
        "id": "bfs",
        "nombre": "BFS (recorrido en anchura)",
        "funcion": bfs_trace,
        "requiere_pesos": False,
        "permite_negativos": True,
        "requiere_dag": False,
        "complejidad": "O(V + E)",
        "descripcion": (
            "Recorre el grafo en anchura desde el nodo origen: explora primero "
            "todos los vecinos directos antes de avanzar al siguiente nivel, "
            "usando una cola FIFO.\n\n"
            "No considera el peso de las aristas — el árbol que construye es "
            "el de menor número de saltos, no el de menor costo.\n\n"
            "Complejidad: O(V + E)."
        ),
        "pseudocodigo": [
            "función BFS(G, origen):",
            "  distancia[origen] ← 0",
            "  marcar origen como visitado; encolar(origen)",
            "  mientras cola no vacía:",
            "    u ← desencolar()",
            "    para cada vecino v de u:",
            "      si v no visitado:",
            "        marcar v como visitado",
            "        distancia[v] ← distancia[u] + 1; padre[v] ← u",
            "        encolar(v)",
            "    fin de procesar u",
        ],
    },
    "dfs": {
        "id": "dfs",
        "nombre": "DFS (recorrido en profundidad)",
        "funcion": dfs_trace,
        "requiere_pesos": False,
        "permite_negativos": True,
        "requiere_dag": False,
        "complejidad": "O(V + E)",
        "descripcion": (
            "Recorre el grafo en profundidad desde el nodo origen: avanza por "
            "una rama hasta el final antes de retroceder (backtrack) y probar "
            "otra.\n\n"
            "No calcula caminos mínimos; construye un árbol de descubrimiento "
            "con tiempos de entrada/salida por nodo.\n\n"
            "Complejidad: O(V + E)."
        ),
        "pseudocodigo": [
            "función DFS(G, u):",
            "  marcar u como visitado",
            "  para cada vecino v de u:",
            "    si v no visitado:",
            "      padre[v] ← u",
            "      DFS(G, v)",
            "  fin de procesar u (nodo completado)",
        ],
    },
    "dijkstra": {
        "id": "dijkstra",
        "nombre": "Dijkstra (camino mínimo)",
        "funcion": dijkstra_trace,
        "requiere_pesos": True,
        "permite_negativos": False,
        "requiere_dag": False,
        "complejidad": "O((V + E) log V)",
        "descripcion": (
            "Calcula el camino más corto (por peso acumulado) desde el "
            "origen a todos los demás nodos usando una cola de prioridad: "
            "en cada paso extrae el nodo no finalizado con menor distancia "
            "tentativa y relaja sus aristas salientes.\n\n"
            "Requiere que todos los pesos sean no negativos — con negativos "
            "el resultado puede ser incorrecto, por eso no se ofrece en esos "
            "grafos (usa Bellman-Ford).\n\n"
            "Complejidad: O((V + E) log V) con heap binario."
        ),
        "pseudocodigo": [
            "función Dijkstra(G, origen):",
            "  distancia[origen] ← 0; el resto ← infinito",
            "  Q ← cola de prioridad con todos los nodos",
            "  mientras Q no vacía:",
            "    u ← extraer nodo con menor distancia",
            "    marcar u como finalizado",
            "    para cada vecino v de u:",
            "      peso ← G[u][v]",
            "      si distancia[u] + peso < distancia[v]:",
            "        distancia[v] ← distancia[u] + peso; padre[v] ← u",
            "        actualizar v en Q",
            "  reconstruir árbol de caminos mínimos con padre[]",
        ],
    },
    "bellman_ford": {
        "id": "bellman_ford",
        "nombre": "Bellman-Ford (camino mínimo)",
        "funcion": bellman_ford_trace,
        "requiere_pesos": True,
        "permite_negativos": True,
        "requiere_dag": False,
        "complejidad": "O(V · E)",
        "descripcion": (
            "Calcula caminos mínimos desde el origen relajando TODAS las "
            "aristas del grafo, V-1 veces.\n\n"
            "Más lento que Dijkstra, pero admite pesos negativos; una pasada "
            "extra permite detectar ciclos de peso negativo (en ese caso no "
            "existe un camino mínimo bien definido para los nodos alcanzados "
            "por el ciclo, y se marcan en rojo).\n\n"
            "Complejidad: O(V · E)."
        ),
        "pseudocodigo": [
            "función BellmanFord(G, origen):",
            "  distancia[origen] ← 0; el resto ← infinito",
            "  repetir (V - 1) veces:",
            "    para cada arista (u, v) con peso w en G:",
            "      si distancia[u] + w < distancia[v]:",
            "        distancia[v] ← distancia[u] + w; padre[v] ← u",
            "  para cada arista (u, v) con peso w en G:",
            "    si distancia[u] + w < distancia[v]:",
            "      marcar v como parte de un ciclo negativo",
            "  reconstruir árbol con padre[] (salvo nodos en ciclo negativo)",
        ],
    },
    "dag_sp": {
        "id": "dag_sp",
        "nombre": "Camino mínimo en DAG (orden topológico)",
        "funcion": dag_shortest_path_trace,
        "requiere_pesos": True,
        "permite_negativos": True,
        "requiere_dag": True,
        "complejidad": "O(V + E)",
        "descripcion": (
            "Calcula caminos mínimos en un grafo dirigido acíclico (DAG) en "
            "dos fases: primero un orden topológico (algoritmo de Kahn), "
            "luego relaja las aristas siguiendo ese orden, una sola vez.\n\n"
            "Al no haber ciclos no hace falta reintentar relajaciones como "
            "en Bellman-Ford — es el método más eficiente cuando el grafo es "
            "un DAG, y admite pesos negativos sin problema.\n\n"
            "Complejidad: O(V + E)."
        ),
        "pseudocodigo": [
            "función CaminoMinimoDAG(G, origen):",
            "  orden ← ordenTopológico(G)   // algoritmo de Kahn",
            "  distancia[origen] ← 0",
            "  para cada nodo u en orden:",
            "    si distancia[u] es finita:",
            "      para cada vecino v de u:",
            "        peso ← G[u][v]",
            "        si distancia[u] + peso < distancia[v]:",
            "          distancia[v] ← distancia[u] + peso; padre[v] ← u",
            "  reconstruir camino con padre[]",
        ],
    },
}


def motivo_no_disponible(info: dict, G: nx.Graph) -> str | None:
    """Devuelve el motivo por el que `info` no aplica al grafo `G`, o None
    si sí aplica.

    Existe para que la UI pueda *explicar* la ausencia: antes el algoritmo
    simplemente desaparecía del desplegable y no había forma de saber si
    faltaba por una restricción real o por un error.
    """
    tiene_negativos = any(d.get("weight", 1) < 0 for _, _, d in G.edges(data=True))
    es_dag = G.is_directed() and nx.is_directed_acyclic_graph(G)

    if info["requiere_dag"] and not es_dag:
        if not G.is_directed():
            return "Requiere un grafo dirigido y acíclico; este es no dirigido."
        return "Requiere un grafo acíclico (DAG); este tiene ciclos."
    if tiene_negativos and not info["permite_negativos"]:
        return "El grafo tiene pesos negativos y este algoritmo no los admite."
    return None


def estado_algoritmos(G: nx.Graph) -> list[dict]:
    """Registro completo anotado con disponibilidad, en orden de definición.

    Cada elemento: {"id", "nombre", "disponible": bool, "motivo": str | None}.
    """
    estado = []
    for kid, info in ALGORITMOS.items():
        motivo = motivo_no_disponible(info, G)
        estado.append(
            {
                "id": kid,
                "nombre": info["nombre"],
                "disponible": motivo is None,
                "motivo": motivo,
            }
        )
    return estado


def algoritmos_disponibles(G: nx.Graph) -> dict:
    """Filtra el registro según las propiedades del grafo actual, para no
    ofrecer en la UI un algoritmo que no aplica (p. ej. Dijkstra con pesos
    negativos, o caminos en DAG sobre un grafo con ciclos)."""
    return {
        kid: info
        for kid, info in ALGORITMOS.items()
        if motivo_no_disponible(info, G) is None
    }
