"""Modelo de grafo: creación, generación aleatoria y serialización.

Esta capa no sabe nada de algoritmos ni de visualización. Su única
responsabilidad es representar un grafo (dirigido o no, con pesos)
y poder ir y volver de un diccionario serializable a JSON, preservando
la posición de los nodos para que el layout visual sea reproducible.
"""
from __future__ import annotations

import json
import math
import random

import networkx as nx


def crear_grafo(dirigido: bool = True) -> nx.Graph:
    """Crea un grafo vacío, dirigido o no dirigido."""
    return nx.DiGraph() if dirigido else nx.Graph()


def asignar_posiciones(G: nx.Graph, seed: int | None = None, escala: float = 400.0) -> nx.Graph:
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

    # Validación explícita: sin esto, un peso_min > peso_max llega hasta
    # rng.randint() y revienta con un "empty range" que no le dice nada al
    # usuario. Mismo criterio para n: el grafo vacío rompe todo lo de abajo.
    if n < 1:
        raise ValueError("El número de nodos debe ser al menos 1.")
    if peso_min > peso_max:
        raise ValueError(
            f"El peso mínimo ({peso_min}) no puede ser mayor que el máximo ({peso_max})."
        )

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
            # Con negativos se ignora peso_min a propósito y se sortea en
            # [-peso_max, peso_max]: el objetivo de este modo es que aparezcan
            # pesos de ambos signos para comparar Bellman-Ford contra Dijkstra.
            w = rng.randint(-abs(peso_max), abs(peso_max))
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

    asignar_posiciones(G, seed=seed)
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


def _id_arista_interno(u: str, v: str, dirigido: bool) -> str:
    """Réplica del identificador que viz/elements.py genera para cada arista.

    Se duplica acá a propósito, en vez de importarlo: graph_model no debe
    depender de la capa de dibujo. Si allá cambia el formato, la validación
    deja de detectar la colisión pero nada más se rompe.
    """
    if dirigido:
        return f"{u}__{v}"
    a, b = sorted((u, v))
    return f"{a}__{b}"


def validar_datos_grafo(data) -> None:
    """Rechaza un diccionario de grafo malformado con un mensaje concreto.

    Se valida ANTES de construir nada, y de forma estricta: un archivo o entra
    completo o no entra. La alternativa —ir reparando sobre la marcha— llevaba
    a ejecutar el algoritmo sobre un grafo distinto del que el usuario creía
    tener, y a que las versiones Python y JavaScript no coincidieran, porque
    cada una reparaba a su manera (NetworkX fusiona aristas repetidas y crea
    los nodos que faltan; JavaScript no hacía ninguna de las dos).

    Se informa solo el PRIMER problema: basta para corregirlo y el mensaje
    entra en una línea. Los mensajes son idénticos a los de docs/js/grafo.js.
    """
    if not isinstance(data, dict):
        raise ValueError("JSON inválido: el contenido debe ser un objeto.")
    for clave in ("nodos", "aristas"):
        if clave not in data:
            raise ValueError(f'JSON inválido: falta la clave "{clave}".')
        if not isinstance(data[clave], list):
            raise ValueError(f'JSON inválido: "{clave}" debe ser una lista.')

    dirigido = bool(data.get("dirigido", True))

    ids: set[str] = set()
    for nodo in data["nodos"]:
        if not isinstance(nodo, dict) or "id" not in nodo:
            raise ValueError('JSON inválido: hay un nodo sin la clave "id".')
        if not isinstance(nodo["id"], (str, int, float)) or isinstance(nodo["id"], bool):
            raise ValueError("JSON inválido: hay un nodo con un identificador que no es texto ni número.")
        nid = str(nodo["id"])
        if nid == "":
            raise ValueError("JSON inválido: hay un nodo con el identificador vacío.")
        if nid in ids:
            raise ValueError(f'JSON inválido: el nodo "{nid}" está declarado dos veces.')
        ids.add(nid)

    vistas: set[tuple[str, str]] = set()
    ids_arista: set[str] = set()
    for arista in data["aristas"]:
        if not isinstance(arista, dict) or "origen" not in arista or "destino" not in arista:
            raise ValueError('JSON inválido: hay una arista sin "origen" o sin "destino".')
        u, v = str(arista["origen"]), str(arista["destino"])
        for extremo in (u, v):
            if extremo not in ids:
                raise ValueError(
                    f'JSON inválido: la arista {u} → {v} apunta al nodo "{extremo}", '
                    "que no está declarado."
                )
        peso = arista.get("weight", arista.get("peso"))
        if peso is None:
            raise ValueError(f"JSON inválido: la arista {u} → {v} no tiene peso.")
        if isinstance(peso, bool) or not isinstance(peso, (int, float)):
            raise ValueError(
                f'JSON inválido: la arista {u} → {v} tiene un peso no numérico ("{peso}").'
            )
        if math.isnan(peso) or math.isinf(peso):
            raise ValueError(f"JSON inválido: la arista {u} → {v} tiene un peso no finito.")

        clave = (u, v) if dirigido else tuple(sorted((u, v)))
        if clave in vistas:
            raise ValueError(f"JSON inválido: la arista {u} → {v} aparece repetida.")
        vistas.add(clave)
        ids_arista.add(_id_arista_interno(u, v, dirigido))

    # Cytoscape exige identificadores únicos entre nodos Y aristas: un nodo
    # llamado "0__1" chocaría con el id que se genera para la arista 0 → 1 y
    # uno de los dos elementos no se dibujaría.
    choque = ids & ids_arista
    if choque:
        nid = sorted(choque)[0]
        raise ValueError(
            f'JSON inválido: el nodo "{nid}" choca con el identificador interno '
            "de una arista. Renómbralo."
        )


def graph_from_dict(data: dict) -> nx.Graph:
    """Reconstruye un grafo a partir del diccionario producido por graph_to_dict.

    Valida primero: antes se aceptaba cualquier cosa y los problemas aparecían
    más tarde y peor (un peso de texto reventaba al calcular qué algoritmos
    aplicaban, dejando la interfaz sin actualizar y sin ningún mensaje).
    """
    validar_datos_grafo(data)
    G = crear_grafo(dirigido=bool(data.get("dirigido", True)))
    for nodo in data["nodos"]:
        nid = str(nodo["id"])
        attrs = {k: v for k, v in nodo.items() if k != "id"}
        G.add_node(nid, **attrs)
    for arista in data["aristas"]:
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
