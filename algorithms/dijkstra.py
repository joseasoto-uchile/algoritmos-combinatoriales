"""Dijkstra reimplementado a mano con heapq, emitiendo traza.

No admite pesos negativos (por eso existe Bellman-Ford aparte); se valida
explícitamente para dar un mensaje claro en vez de un resultado incorrecto.
"""
from __future__ import annotations

import heapq

import networkx as nx

from .trace import TraceBuilder


def dijkstra_trace(G: nx.Graph, origen: str):
    if any(datos.get("weight", 1) < 0 for _, _, datos in G.edges(data=True)):
        raise ValueError("Dijkstra no admite pesos negativos; usa Bellman-Ford.")

    tb = TraceBuilder()
    distancia = {origen: 0}
    padre = {origen: None}
    finalizado = set()
    heap = [(0, origen)]

    tb.emit("visitar_nodo", nodo=origen)
    while heap:
        d, u = heapq.heappop(heap)
        if u in finalizado:
            continue
        finalizado.add(u)
        tb.emit("procesar_nodo", nodo=u, distancia=d)
        for v, datos in G[u].items():
            peso = datos.get("weight", 1)
            tb.emit("explorar_arista", u=u, v=v, peso=peso)
            nueva = distancia[u] + peso
            if v not in distancia or nueva < distancia[v]:
                distancia[v] = nueva
                padre[v] = u
                heapq.heappush(heap, (nueva, v))
                tb.emit("relajar", u=u, v=v, nueva_dist=nueva)
                if v not in finalizado:
                    tb.emit("visitar_nodo", nodo=v)
            else:
                tb.emit("descartar_arista", u=u, v=v)
        tb.emit("nodo_finalizado", nodo=u)

    for v, p in padre.items():
        if p is not None:
            tb.emit("arista_solucion", u=p, v=v)

    tb.emit("fin", distancias=distancia, padres=padre)
    return {"distancias": distancia, "padres": padre}, tb.trace
