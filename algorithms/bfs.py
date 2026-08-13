"""Recorrido en anchura.

Implementación propia en lugar de nx.bfs_tree, necesaria para emitir un evento
en cada paso del recorrido.
"""
from __future__ import annotations

from collections import deque

import networkx as nx

from .trace import TraceBuilder


def bfs_trace(G: nx.Graph, origen: str):
    # El campo "linea" indica la línea del pseudocódigo de registry.py.
    tb = TraceBuilder()
    visitado = {origen}
    padre = {origen: None}
    distancia = {origen: 0}
    cola = deque([origen])

    # El campo 'dist' permite que la visualización reconstruya la distancia de
    # cada nodo en cualquier paso sin volver a ejecutar el algoritmo.
    tb.emit("visitar_nodo", nodo=origen, linea=3, dist=0)
    while cola:
        u = cola.popleft()
        tb.emit("procesar_nodo", nodo=u, linea=5)
        for v in G[u]:
            tb.emit("explorar_arista", u=u, v=v, linea=7)
            if v not in visitado:
                visitado.add(v)
                padre[v] = u
                distancia[v] = distancia[u] + 1
                cola.append(v)
                tb.emit("visitar_nodo", nodo=v, linea=8, dist=distancia[v])
                tb.emit("arista_solucion", u=u, v=v, linea=9)
            else:
                tb.emit("descartar_arista", u=u, v=v, linea=7)
        tb.emit("nodo_finalizado", nodo=u, linea=11)

    tb.emit("fin", distancias=distancia, padres=padre)
    return {"distancias": distancia, "padres": padre}, tb.trace
