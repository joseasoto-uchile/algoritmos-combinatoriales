"""Caminos mínimos en un DAG: orden topológico (Kahn) + relajación en ese
orden. Ambas fases emiten eventos propios."""
from __future__ import annotations

import math
from collections import deque

import networkx as nx

from .trace import TraceBuilder


def dag_shortest_path_trace(G: nx.Graph, origen: str):
    if not G.is_directed() or not nx.is_directed_acyclic_graph(G):
        raise ValueError("Este algoritmo requiere un grafo dirigido y acíclico (DAG).")

    # Los "linea" corresponden al pseudocódigo en algorithms/registry.py.
    tb = TraceBuilder()

    # --- Fase 1: orden topológico (Kahn) ---
    grado_entrada = {n: 0 for n in G.nodes}
    for _, v in G.edges:
        grado_entrada[v] += 1
    cola = deque(n for n in G.nodes if grado_entrada[n] == 0)
    orden = []
    while cola:
        u = cola.popleft()
        orden.append(u)
        tb.emit("orden_topologico_nodo", nodo=u, posicion=len(orden), linea=2)
        for v in G.successors(u):
            grado_entrada[v] -= 1
            if grado_entrada[v] == 0:
                cola.append(v)

    # --- Fase 2: relajación en orden topológico ---
    distancia = {n: math.inf for n in G.nodes}
    distancia[origen] = 0
    padre = {n: None for n in G.nodes}
    tb.emit("visitar_nodo", nodo=origen, linea=3)

    for u in orden:
        if distancia[u] == math.inf:
            continue
        tb.emit("procesar_nodo", nodo=u, linea=5)
        for v, datos in G[u].items():
            peso = datos.get("weight", 1)
            tb.emit("explorar_arista", u=u, v=v, peso=peso, linea=8)
            if distancia[u] + peso < distancia[v]:
                distancia[v] = distancia[u] + peso
                padre[v] = u
                tb.emit("relajar", u=u, v=v, nueva_dist=distancia[v], linea=9)
                tb.emit("visitar_nodo", nodo=v, linea=9)
            else:
                tb.emit("descartar_arista", u=u, v=v, linea=8)
        tb.emit("nodo_finalizado", nodo=u, linea=4)

    for v, p in padre.items():
        if p is not None:
            tb.emit("arista_solucion", u=p, v=v, linea=10)

    tb.emit("fin", distancias=distancia, padres=padre, orden_topologico=orden)
    return {"distancias": distancia, "padres": padre, "orden_topologico": orden}, tb.trace
