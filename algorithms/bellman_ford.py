"""Bellman-Ford con detección de ciclos de peso negativo.

Implementación propia, necesaria para emitir un evento en cada paso.
"""
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

    # En grafos no dirigidos, cada arista se relaja en los dos sentidos.
    if G.is_directed():
        aristas = list(G.edges(data=True))
    else:
        aristas = []
        for u, v, datos in G.edges(data=True):
            aristas.append((u, v, datos))
            aristas.append((v, u, datos))

    # El campo "linea" indica la línea del pseudocódigo de registry.py.
    # 'dist' viaja en el evento para que la visualización pueda reconstruir la
    # distancia de cada nodo en cualquier paso sin volver a correr el algoritmo.
    tb.emit("visitar_nodo", nodo=origen, linea=2, dist=0)
    n = len(nodos)
    total_iteraciones = max(n - 1, 0)
    for i in range(total_iteraciones):
        # Marca el comienzo de cada pasada. Es el único evento que distingue
        # una pasada de otra, ya que todas repiten los mismos eventos sobre las
        # mismas aristas. La interfaz lo usa para mostrar la iteración actual.
        tb.emit(
            "inicio_iteracion",
            iteracion=i + 1,
            total_iteraciones=total_iteraciones,
            linea=3,
        )
        hubo_cambio = False
        for u, v, datos in aristas:
            peso = datos.get("weight", 1)
            tb.emit("explorar_arista", u=u, v=v, iteracion=i + 1, linea=5)
            if distancia[u] != math.inf and distancia[u] + peso < distancia[v]:
                distancia[v] = distancia[u] + peso
                padre[v] = u
                hubo_cambio = True
                tb.emit("relajar", u=u, v=v, nueva_dist=distancia[v], linea=6)
                tb.emit("visitar_nodo", nodo=v, linea=6, dist=distancia[v])
            else:
                tb.emit("descartar_arista", u=u, v=v, linea=5)
        if not hubo_cambio:
            # Una pasada sin cambios implica que las siguientes tampoco los
            # producirán. El algoritmo termina y lo indica en la traza.
            tb.emit(
                "fin_iteraciones",
                iteracion=i + 1,
                total_iteraciones=total_iteraciones,
                anticipado=True,
                linea=3,
            )
            break
    else:
        tb.emit(
            "fin_iteraciones",
            iteracion=total_iteraciones,
            total_iteraciones=total_iteraciones,
            anticipado=False,
            linea=3,
        )

    # Pasada adicional: toda arista que aún se puede relajar indica un ciclo de
    # peso negativo. La marca se propaga hacia adelante desde esos extremos,
    # porque el ciclo completo y los nodos alcanzables desde él tampoco tienen
    # distancia mínima definida.
    # El orden de marcado debe ser reproducible entre ejecuciones. Se usan dict
    # y list, que conservan el orden de inserción. La iteración de un set de
    # cadenas sigue el orden del hash, que Python aleatoriza en cada proceso.
    sospechosos = {}
    for u, v, datos in aristas:
        peso = datos.get("weight", 1)
        if distancia[u] != math.inf and distancia[u] + peso < distancia[v]:
            sospechosos[v] = None

    sucesores = {n: {} for n in nodos}
    for u, v, _ in aristas:
        sucesores[u][v] = None

    ciclo_negativo = set()
    pendientes = list(sospechosos)
    while pendientes:
        n = pendientes.pop()
        if n in ciclo_negativo:
            continue
        ciclo_negativo.add(n)
        tb.emit("ciclo_negativo", nodo=n, linea=9)
        pendientes.extend(s for s in sucesores[n] if s not in ciclo_negativo)

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
