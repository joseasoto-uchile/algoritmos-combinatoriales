"""Modelo de grafo: creación, generación aleatoria y serialización.

Esta capa no depende de los algoritmos ni de la visualización. Representa un
grafo dirigido o no dirigido con pesos, y convierte entre ese grafo y un
diccionario serializable a JSON. Se conserva la posición de cada nodo para
que el dibujo sea reproducible al recargar el archivo.
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
    """Calcula una disposición inicial con spring layout.

    El resultado se guarda en el atributo 'pos' de cada nodo, en el sistema
    de coordenadas que usa Cytoscape.
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

    # rng.randint() exige peso_min <= peso_max, y el resto de la función exige
    # al menos un nodo. Se comprueba aquí para devolver el motivo concreto.
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
            # Con pesos negativos el sorteo es en [-peso_max, peso_max] y
            # peso_min no interviene. El propósito de la opción es obtener
            # pesos de ambos signos.
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
        # Árbol de conectividad que respeta el orden: los arcos van solo hacia
        # adelante.
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

    Usa un formato propio, no node_link_data de NetworkX, para no depender de
    los cambios de API entre versiones de la biblioteca.
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

    Se duplica porque graph_model no depende de la capa de dibujo. Un cambio de
    formato en viz/ requiere actualizar también esta función.
    """
    if dirigido:
        return f"{u}__{v}"
    a, b = sorted((u, v))
    return f"{a}__{b}"


def es_dirigido(data) -> bool:
    """Lee la clave "dirigido" del diccionario del grafo.

    La clave es opcional y su omisión significa dirigido, que es el valor con
    el que crea_grafo construye por omisión. Se centraliza aquí porque
    docs/js/grafo.js debe aplicar el mismo criterio: con defectos distintos, el
    mismo archivo produce grafos distintos en cada versión.
    """
    return bool(data.get("dirigido", True))


def peso_arista(arista):
    """Peso declarado en una arista, o None si no lo tiene.

    Se admite la clave "weight" y su sinónimo "peso". Un valor null equivale a
    la ausencia de la clave, como el operador ?? de docs/js/grafo.js. Se usa en
    la validación y en la construcción para que las dos coincidan.
    """
    peso = arista.get("weight")
    return arista.get("peso") if peso is None else peso


def _posicion_valida(pos) -> bool:
    """Comprueba que "pos" es una lista de dos números finitos."""
    if not isinstance(pos, (list, tuple)) or len(pos) != 2:
        return False
    return all(
        isinstance(c, (int, float))
        and not isinstance(c, bool)
        and math.isfinite(c)
        for c in pos
    )


def validar_datos_grafo(data) -> None:
    """Rechaza un diccionario de grafo que no cumple el formato.

    La validación es estricta: el archivo se acepta completo o se rechaza. Con
    ello los dos ports procesan el mismo archivo de la misma forma, sin que las
    correcciones automáticas de NetworkX (fusión de aristas repetidas, creación
    de nodos ausentes) introduzcan diferencias.

    Se informa solo el primer problema encontrado. Los mensajes deben coincidir
    con los de docs/js/grafo.js.
    """
    if not isinstance(data, dict):
        raise ValueError("JSON inválido: el contenido debe ser un objeto.")
    for clave in ("nodos", "aristas"):
        if clave not in data:
            raise ValueError(f'JSON inválido: falta la clave "{clave}".')
        if not isinstance(data[clave], list):
            raise ValueError(f'JSON inválido: "{clave}" debe ser una lista.')

    dirigido = es_dirigido(data)

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
        # La capa de dibujo lee pos[0] y pos[1] sin comprobarlos.
        if "pos" in nodo and not _posicion_valida(nodo["pos"]):
            raise ValueError(
                f'JSON inválido: el nodo "{nid}" tiene una posición que no es '
                "una lista de dos números."
            )

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
        peso = peso_arista(arista)
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

    # Cytoscape exige identificadores únicos entre nodos y aristas. Un nodo
    # llamado "0__1" coincide con el identificador de la arista 0 -> 1.
    choque = ids & ids_arista
    if choque:
        nid = sorted(choque)[0]
        raise ValueError(
            f'JSON inválido: el nodo "{nid}" choca con el identificador interno '
            "de una arista. Renómbralo."
        )


def graph_from_dict(data: dict) -> nx.Graph:
    """Reconstruye un grafo a partir del diccionario de graph_to_dict.

    Valida el diccionario antes de construir el grafo.
    """
    validar_datos_grafo(data)
    G = crear_grafo(dirigido=es_dirigido(data))
    for nodo in data["nodos"]:
        nid = str(nodo["id"])
        attrs = {k: v for k, v in nodo.items() if k != "id"}
        G.add_node(nid, **attrs)
    for arista in data["aristas"]:
        u, v = str(arista["origen"]), str(arista["destino"])
        attrs = {k: v for k, v in arista.items() if k not in ("origen", "destino", "peso")}
        attrs["weight"] = peso_arista(arista)
        G.add_edge(u, v, **attrs)
    return G


def guardar_json(G: nx.Graph, ruta: str) -> None:
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(graph_to_dict(G), f, indent=2, ensure_ascii=False)


def cargar_json(ruta: str) -> nx.Graph:
    with open(ruta, "r", encoding="utf-8") as f:
        data = json.load(f)
    return graph_from_dict(data)
