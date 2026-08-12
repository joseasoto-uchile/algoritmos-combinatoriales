"""DFS recursivo reimplementado a mano, emitiendo eventos de descubrimiento
y finalización (útil también para detectar el árbol DFS)."""
from __future__ import annotations

import sys

import networkx as nx

from .trace import TraceBuilder


def dfs_trace(G: nx.Graph, origen: str):
    tb = TraceBuilder()
    visitado = set()
    padre = {origen: None}
    descubrimiento: dict = {}
    finalizacion: dict = {}
    reloj = [0]

    limite_previo = sys.getrecursionlimit()
    sys.setrecursionlimit(max(limite_previo, G.number_of_nodes() * 2 + 100))
    try:
        def visitar(u):
            visitado.add(u)
            reloj[0] += 1
            descubrimiento[u] = reloj[0]
            tb.emit("visitar_nodo", nodo=u)
            tb.emit("procesar_nodo", nodo=u)
            for v in G[u]:
                tb.emit("explorar_arista", u=u, v=v)
                if v not in visitado:
                    padre[v] = u
                    tb.emit("arista_solucion", u=u, v=v)
                    visitar(v)
                else:
                    tb.emit("descartar_arista", u=u, v=v)
            reloj[0] += 1
            finalizacion[u] = reloj[0]
            tb.emit("nodo_finalizado", nodo=u)

        visitar(origen)
    finally:
        sys.setrecursionlimit(limite_previo)

    tb.emit("fin", padres=padre, descubrimiento=descubrimiento, finalizacion=finalizacion)
    return {"padres": padre, "descubrimiento": descubrimiento, "finalizacion": finalizacion}, tb.trace
