"""BFS reimplementado a mano (no usamos nx.bfs_tree) para poder emitir
un evento en cada paso relevante del recorrido."""
from __future__ import annotations

from collections import deque

import networkx as nx

from .trace import TraceBuilder


def bfs_trace(G: nx.Graph, origen: str):
    tb = TraceBuilder()
    visitado = {origen}
    padre = {origen: None}
    distancia = {origen: 0}
    cola = deque([origen])

    tb.emit("visitar_nodo", nodo=origen)
    while cola:
        u = cola.popleft()
        tb.emit("procesar_nodo", nodo=u)
        for v in G[u]:
            tb.emit("explorar_arista", u=u, v=v)
            if v not in visitado:
                visitado.add(v)
                padre[v] = u
                distancia[v] = distancia[u] + 1
                cola.append(v)
                tb.emit("visitar_nodo", nodo=v)
                tb.emit("arista_solucion", u=u, v=v)
            else:
                tb.emit("descartar_arista", u=u, v=v)
        tb.emit("nodo_finalizado", nodo=u)

    tb.emit("fin", distancias=distancia, padres=padre)
    return {"distancias": distancia, "padres": padre}, tb.trace
