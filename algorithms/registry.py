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
    },
    "dfs": {
        "id": "dfs",
        "nombre": "DFS (recorrido en profundidad)",
        "funcion": dfs_trace,
        "requiere_pesos": False,
        "permite_negativos": True,
        "requiere_dag": False,
    },
    "dijkstra": {
        "id": "dijkstra",
        "nombre": "Dijkstra (camino mínimo)",
        "funcion": dijkstra_trace,
        "requiere_pesos": True,
        "permite_negativos": False,
        "requiere_dag": False,
    },
    "bellman_ford": {
        "id": "bellman_ford",
        "nombre": "Bellman-Ford (camino mínimo)",
        "funcion": bellman_ford_trace,
        "requiere_pesos": True,
        "permite_negativos": True,
        "requiere_dag": False,
    },
    "dag_sp": {
        "id": "dag_sp",
        "nombre": "Camino mínimo en DAG (orden topológico)",
        "funcion": dag_shortest_path_trace,
        "requiere_pesos": True,
        "permite_negativos": True,
        "requiere_dag": True,
    },
}


def algoritmos_disponibles(G: nx.Graph) -> dict:
    """Filtra el registro según las propiedades del grafo actual, para no
    ofrecer en la UI un algoritmo que no aplica (p. ej. Dijkstra con pesos
    negativos, o caminos en DAG sobre un grafo con ciclos)."""
    tiene_negativos = any(d.get("weight", 1) < 0 for _, _, d in G.edges(data=True))
    es_dag = G.is_directed() and nx.is_directed_acyclic_graph(G)

    disponibles = {}
    for kid, info in ALGORITMOS.items():
        if info["requiere_dag"] and not es_dag:
            continue
        if tiene_negativos and not info["permite_negativos"]:
            continue
        disponibles[kid] = info
    return disponibles
