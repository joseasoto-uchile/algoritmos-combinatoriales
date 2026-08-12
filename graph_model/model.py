"""Modelo de grafo: creación, generación aleatoria y serialización.

Esta capa no sabe nada de algoritmos ni de visualización. Su única
responsabilidad es representar un grafo (dirigido o no, con pesos)
y poder ir y volver de un diccionario serializable a JSON, preservando
la posición de los nodos para que el layout visual sea reproducible.
"""
from __future__ import annotations

import json
import random

import networkx as nx


def crear_grafo(dirigido: bool = True) -> nx.Graph:
    """Crea un grafo vacío, dirigido o no dirigido."""
    return nx.DiGraph() if dirigido else nx.Graph()


def _asignar_posiciones(G: nx.Graph, seed: int | None = None, escala: float = 400.0) -> nx.Graph:
    """Calcula una disposición inicial (spring layout) y la guarda como
    atributo 'pos' de cada nodo, en coordenadas cómodas para Cytoscape.
    """
    if G.number_of_nodes() == 0:
        return G
    try:
        pos = nx.spring_layout(G, seed=seed)
    except Exception:
        rng = random.Random(seed)
        pos = {n: (rng.random(), rng.random()) for n in G.nodes}
    for n, (x, y) in pos.items():
        G.nodes[n]["pos"] = [float(x) * escala + escala, float(y) * escala + escala]
    return G


def generar_aleatorio(
    n: int = 10,
    densidad: float | None = 0.3,
    num_aristas: int | None = None,
    dirigido: bool = True,
    dag: bool = False,
    conexo: bool = True,
    peso_min: int = 1,
    peso_max: int = 10,
    permitir_negativos: bool = False,
    seed: int | None = None,
) -> nx.Graph:
    """Genera una instancia aleatoria parametrizable.

    - n: número de nodos.
    - densidad: proporción (0-1) de aristas respecto al máximo posible;
      se ignora si se entrega ``num_aristas`` explícito.
    - dag: si es True, fuerza que el grafo sea dirigido y acíclico
      (arcos solo "hacia adelante" en un orden topológico aleatorio).
    - conexo: si es True, garantiza un árbol/spanning subyacente antes
      de agregar aristas extra, para que el grafo quede conexo
      (débilmente conexo en el caso dirigido).
    - permitir_negativos: si es True, los pesos se sortean en
      [-peso_max, peso_max] (útil para comparar Bellman-Ford vs Dijkstra).
    """
    if dag:
        dirigido = True

    rng = random.Random(seed)
    G = crear_grafo(dirigido)

    ids = [str(i) for i in range(n)]
    for nid in ids:
        G.add_node(nid, label=nid)

    max_aristas = n * (n - 1) if dirigido else n * (n - 1) // 2
    if num_aristas is None:
        densidad = 0.0 if densidad is None else densidad
        num_aristas = round(densidad * max_aristas)
    num_aristas = max(0, min(num_aristas, max_aristas))

    def peso_aleatorio() -> int:
        if permitir_negativos:
            w = rng.randint(-peso_max, peso_max)
            return w if w != 0 else 1
        return rng.randint(peso_min, peso_max)

    aristas_existentes = set()

    def clave(u, v):
        return (u, v) if dirigido else tuple(sorted((u, v)))

    def agregar_arista(u, v) -> bool:
        if u == v:
            return False
        k = clave(u, v)
        if k in aristas_existentes:
            return False
        aristas_existentes.add(k)
        G.add_edge(u, v, weight=peso_aleatorio())
        return True

    orden = ids[:]
    rng.shuffle(orden)

    if dag:
        # Árbol de conectividad respetando el orden (arcos solo hacia adelante).
        if conexo:
            for i in range(1, n):
                j = rng.randint(0, i - 1)
                agregar_arista(orden[j], orden[i])
        intentos, limite = 0, num_aristas * 20 + 200
        while len(aristas_existentes) < num_aristas and intentos < limite:
            i, j = rng.randint(0, n - 1), rng.randint(0, n - 1)
            if i < j:
                agregar_arista(orden[i], orden[j])
            intentos += 1
    else:
        if conexo:
            for i in range(1, n):
                j = rng.randint(0, i - 1)
                agregar_arista(orden[j], orden[i])
        intentos, limite = 0, num_aristas * 20 + 200
        while len(aristas_existentes) < num_aristas and intentos < limite:
            agregar_arista(rng.choice(ids), rng.choice(ids))
            intentos += 1

    _asignar_posiciones(G, seed=seed)
    return G


def graph_to_dict(G: nx.Graph) -> dict:
    """Serializa el grafo (incluyendo posiciones) a un diccionario JSON-able.

    Formato propio y simple en lugar de node_link_data de NetworkX, para no
    depender de los cambios de API entre versiones de la librería.
    """
    return {
        "dirigido": G.is_directed(),
        "nodos": [{"id": str(n), **datos} for n, datos in G.nodes(data=True)],
        "aristas": [
            {"origen": str(u), "destino": str(v), **datos}
            for u, v, datos in G.edges(data=True)
        ],
    }


def graph_from_dict(data: dict) -> nx.Graph:
    """Reconstruye un grafo a partir del diccionario producido por graph_to_dict."""
    G = crear_grafo(dirigido=bool(data.get("dirigido", True)))
    for nodo in data.get("nodos", []):
        nid = str(nodo["id"])
        attrs = {k: v for k, v in nodo.items() if k != "id"}
        G.add_node(nid, **attrs)
    for arista in data.get("aristas", []):
        u, v = str(arista["origen"]), str(arista["destino"])
        attrs = {k: v for k, v in arista.items() if k not in ("origen", "destino")}
        G.add_edge(u, v, **attrs)
    return G


def guardar_json(G: nx.Graph, ruta: str) -> None:
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(graph_to_dict(G), f, indent=2, ensure_ascii=False)


def cargar_json(ruta: str) -> nx.Graph:
    with open(ruta, "r", encoding="utf-8") as f:
        data = json.load(f)
    return graph_from_dict(data)
