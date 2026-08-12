"""Bellman-Ford reimplementado a mano, con detección de ciclos negativos."""
from __future__ import annotations

import math

import networkx as nx

from .trace import TraceBuilder


def bellman_ford_trace(G: nx.Graph, origen: str):
    tb = TraceBuilder()
    nodos = list(G.nodes)
    distancia = {n: math.inf for n in nodos}
    distancia[origen] = 0
    padre = {n: None for n in nodos}

    # Para grafos no dirigidos, cada arista relaja en ambos sentidos.
    if G.is_directed():
        aristas = list(G.edges(data=True))
    else:
        aristas = []
        for u, v, datos in G.edges(data=True):
            aristas.append((u, v, datos))
            aristas.append((v, u, datos))

    # Los "linea" corresponden al pseudocódigo en algorithms/registry.py.
    tb.emit("visitar_nodo", nodo=origen, linea=2)
    n = len(nodos)
    for i in range(max(n - 1, 0)):
        hubo_cambio = False
        for u, v, datos in aristas:
            peso = datos.get("weight", 1)
            tb.emit("explorar_arista", u=u, v=v, iteracion=i + 1, linea=5)
            if distancia[u] != math.inf and distancia[u] + peso < distancia[v]:
                distancia[v] = distancia[u] + peso
                padre[v] = u
                hubo_cambio = True
                tb.emit("relajar", u=u, v=v, nueva_dist=distancia[v], linea=6)
                tb.emit("visitar_nodo", nodo=v, linea=6)
            else:
                tb.emit("descartar_arista", u=u, v=v, linea=5)
        if not hubo_cambio:
            break

    ciclo_negativo = set()
    for u, v, datos in aristas:
        peso = datos.get("weight", 1)
        if distancia[u] != math.inf and distancia[u] + peso < distancia[v]:
            ciclo_negativo.add(v)
            tb.emit("ciclo_negativo", nodo=v, linea=9)

    for v, p in padre.items():
        if p is not None and v not in ciclo_negativo:
            tb.emit("arista_solucion", u=p, v=v, linea=10)

    tb.emit(
        "fin",
        distancias=distancia,
        padres=padre,
        ciclo_negativo=list(ciclo_negativo),
    )
    return {
        "distancias": distancia,
        "padres": padre,
        "ciclo_negativo": ciclo_negativo,
    }, tb.trace
