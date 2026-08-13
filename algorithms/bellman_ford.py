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
    # 'dist' viaja en el evento para que la visualización pueda reconstruir la
    # distancia de cada nodo en cualquier paso sin volver a correr el algoritmo.
    tb.emit("visitar_nodo", nodo=origen, linea=2, dist=0)
    n = len(nodos)
    total_iteraciones = max(n - 1, 0)
    for i in range(total_iteraciones):
        # Marca el comienzo de cada pasada. Sirve para mostrar en qué iteración
        # va la reproducción: en Bellman-Ford el número de pasadas es la parte
        # que explica su costo, y sin esto no se distingue una de otra porque
        # todas repiten los mismos eventos sobre las mismas aristas.
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
            # Sin cambios en una pasada completa, las siguientes tampoco harían
            # nada: se corta antes de las V-1 y se avisa, porque es justo lo
            # interesante de ver (termina en menos iteraciones que el peor caso).
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

    # Una pasada extra: toda arista que TODAVÍA relaja delata un ciclo de peso
    # negativo. Marcar solo esos extremos deja el dibujo a medias — el ciclo
    # completo y todo lo alcanzable desde él tampoco tienen distancia mínima
    # bien definida, así que se propaga hacia adelante desde los detectados.
    # Para el recorrido se usan dict (como conjunto ordenado) y list, NO set:
    # la iteración de un set de cadenas sigue el orden de hash, que Python
    # aleatoriza en cada proceso. Con sets, el orden en que se marcaban los
    # nodos cambiaba entre ejecuciones sobre el mismo grafo: el conjunto final
    # era correcto, pero la animación no se repetía ni fijando la semilla.
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
