"""Instancias de ejemplo con estructura reconocible.

Los grafos aleatorios sirven para probar, pero no para *entender*: cuando
todos los nodos están mezclados cuesta seguir por qué BFS visita en cierto
orden. Estas instancias tienen forma conocida (árbol, ciclo, rejilla, capas)
y posiciones fijas, así que el recorrido del algoritmo se lee directo sobre
el dibujo.

Cada entrada del registro devuelve un grafo ya posicionado; usar el layout
'preset' en la UI respeta esas coordenadas.
"""
from __future__ import annotations

import math

from .model import crear_grafo

# Las posiciones se escriben en el mismo espacio de coordenadas que usa
# model.asignar_posiciones (aprox. 0..800), para que 'preset' se vea igual
# de encuadrado que los layouts calculados.
_ESCALA = 800.0


def _arbol_binario(niveles: int = 4):
    """Árbol binario completo. El clásico para ver BFS por niveles contra
    DFS bajando por una rama hasta el fondo."""
    G = crear_grafo(dirigido=False)
    total = 2 ** niveles - 1
    for i in range(total):
        G.add_node(str(i), label=str(i))
    for i in range(total):
        for hijo in (2 * i + 1, 2 * i + 2):
            if hijo < total:
                # Peso creciente con la profundidad: hace que el camino
                # mínimo por peso NO coincida con el de menos saltos.
                G.add_edge(str(i), str(hijo), weight=1 + (hijo % 5))
    for i in range(total):
        nivel = int(math.floor(math.log2(i + 1)))
        en_nivel = 2 ** nivel
        pos_en_nivel = i - (en_nivel - 1)
        x = (pos_en_nivel + 0.5) / en_nivel * _ESCALA
        y = nivel / max(niveles - 1, 1) * _ESCALA * 0.8 + 40
        G.nodes[str(i)]["pos"] = [x, y]
    return G


def _ciclo(n: int = 8):
    """Ciclo simple: útil para ver que BFS avanza por los dos lados a la vez
    y se encuentra en el nodo opuesto."""
    G = crear_grafo(dirigido=False)
    for i in range(n):
        G.add_node(str(i), label=str(i))
    for i in range(n):
        G.add_edge(str(i), str((i + 1) % n), weight=1 + (i % 4))
    radio = _ESCALA * 0.4
    centro = _ESCALA / 2
    for i in range(n):
        ang = 2 * math.pi * i / n - math.pi / 2
        G.nodes[str(i)]["pos"] = [centro + radio * math.cos(ang), centro + radio * math.sin(ang)]
    return G


def _rejilla(filas: int = 4, columnas: int = 5):
    """Rejilla: las distancias BFS forman anillos concéntricos alrededor
    del origen, muy visual."""
    G = crear_grafo(dirigido=False)
    for f in range(filas):
        for c in range(columnas):
            nid = str(f * columnas + c)
            G.add_node(nid, label=nid)
            G.nodes[nid]["pos"] = [
                (c + 0.5) / columnas * _ESCALA,
                (f + 0.5) / filas * _ESCALA * 0.8 + 40,
            ]
    for f in range(filas):
        for c in range(columnas):
            actual = f * columnas + c
            if c + 1 < columnas:
                G.add_edge(str(actual), str(actual + 1), weight=1 + ((f + c) % 3))
            if f + 1 < filas:
                G.add_edge(str(actual), str(actual + columnas), weight=1 + ((f + c) % 4))
    return G


def _dag_capas(capas=(1, 3, 3, 2, 1)):
    """DAG por capas: única instancia donde el algoritmo de orden topológico
    está disponible, y donde se ve que basta una pasada de relajación."""
    G = crear_grafo(dirigido=True)
    ids_por_capa = []
    contador = 0
    for indice_capa, ancho in enumerate(capas):
        fila = []
        for j in range(ancho):
            nid = str(contador)
            contador += 1
            G.add_node(nid, label=nid)
            G.nodes[nid]["pos"] = [
                (indice_capa + 0.5) / len(capas) * _ESCALA,
                (j + 0.5) / ancho * _ESCALA * 0.7 + 60,
            ]
            fila.append(nid)
        ids_por_capa.append(fila)
    peso = 1
    for anterior, siguiente in zip(ids_por_capa, ids_por_capa[1:]):
        for u in anterior:
            for v in siguiente:
                G.add_edge(u, v, weight=peso)
                peso = 1 + (peso % 7)
    return G


def _ciclo_negativo():
    """Instancia mínima con un ciclo de peso negativo (3→4→5→3 suma -2).
    Es el único caso donde Bellman-Ford marca nodos en rojo; sirve para ver
    por qué Dijkstra no se ofrece acá."""
    G = crear_grafo(dirigido=True)
    aristas = [
        ("0", "1", 4), ("0", "2", 3), ("1", "3", 2), ("2", "3", 1),
        ("3", "4", 3), ("4", "5", -6), ("5", "3", 1), ("2", "6", 5),
    ]
    posiciones = {
        "0": [80, 400], "1": [240, 220], "2": [240, 580], "3": [430, 400],
        "4": [610, 250], "5": [610, 550], "6": [430, 720],
    }
    for nid, pos in posiciones.items():
        G.add_node(nid, label=nid, pos=pos)
    for u, v, w in aristas:
        G.add_edge(u, v, weight=w)
    return G


def _completo(n: int = 6):
    """Grafo completo K_n: caso denso, útil para ver cuántas aristas descarta
    Dijkstra y para probar rendimiento del dibujado."""
    G = crear_grafo(dirigido=False)
    radio = _ESCALA * 0.38
    centro = _ESCALA / 2
    for i in range(n):
        nid = str(i)
        ang = 2 * math.pi * i / n - math.pi / 2
        G.add_node(nid, label=nid, pos=[centro + radio * math.cos(ang), centro + radio * math.sin(ang)])
    peso = 2
    for i in range(n):
        for j in range(i + 1, n):
            G.add_edge(str(i), str(j), weight=peso)
            peso = 1 + (peso * 3) % 9
    return G


EJEMPLOS = {
    "arbol": {
        "nombre": "Árbol binario (15 nodos)",
        "constructor": _arbol_binario,
        "descripcion": "No dirigido. BFS recorre por niveles; DFS baja hasta una hoja.",
    },
    "ciclo": {
        "nombre": "Ciclo (8 nodos)",
        "constructor": _ciclo,
        "descripcion": "No dirigido. BFS avanza por ambos lados y se cierra en el opuesto.",
    },
    "rejilla": {
        "nombre": "Rejilla 4×5",
        "constructor": _rejilla,
        "descripcion": "No dirigido. Las distancias forman anillos alrededor del origen.",
    },
    "dag": {
        "nombre": "DAG por capas",
        "constructor": _dag_capas,
        "descripcion": "Dirigido y acíclico: habilita el camino mínimo por orden topológico.",
    },
    "ciclo_negativo": {
        "nombre": "Ciclo negativo (Bellman-Ford)",
        "constructor": _ciclo_negativo,
        "descripcion": "Dirigido con un ciclo de peso -2. Dijkstra no se ofrece acá.",
    },
    "completo": {
        "nombre": "Grafo completo K6",
        "constructor": _completo,
        "descripcion": "No dirigido y denso: muchas aristas descartadas por Dijkstra.",
    },
}


def construir_ejemplo(clave: str):
    """Devuelve el grafo de ejemplo asociado a `clave`."""
    if clave not in EJEMPLOS:
        raise ValueError(f"No existe la instancia de ejemplo '{clave}'.")
    return EJEMPLOS[clave]["constructor"]()
