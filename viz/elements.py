"""Traduce (grafo, traza, paso actual) -> elementos de Dash Cytoscape.

Esta es la única capa que conoce el formato de eventos de la traza Y el
formato de elementos de Cytoscape. Los algoritmos no saben que existe;
Cytoscape no sabe que existen los algoritmos.

Estados de nodo/arista:
- Persistentes (una vez aplicados, se mantienen): 'visitado', 'finalizado',
  'solucion', 'ciclo_negativo'.
- Transitorio (solo mientras se reproduce ESE paso puntual): 'activo'.
"""
from __future__ import annotations

import networkx as nx


def id_arista(u: str, v: str, dirigido: bool) -> str:
    """Id estable de una arista, consistente sin importar en qué orden
    la haya recorrido el algoritmo (relevante para grafos no dirigidos)."""
    if dirigido:
        return f"{u}__{v}"
    a, b = sorted((str(u), str(v)))
    return f"{a}__{b}"


def graph_to_elements(G: nx.Graph, incluir_posiciones: bool = True) -> list[dict]:
    """Construye los elementos de Cytoscape. Las aristas de un grafo NO
    dirigido llevan la clase base 'no_dirigido', que la hoja de estilos usa
    para no dibujarles punta de flecha (ver cytoscape_style.py).

    `incluir_posiciones` decide si cada nodo viaja con su coordenada guardada.
    Solo debe activarse con el layout 'preset', que es justamente el que
    significa "usá las posiciones de la instancia". Con cualquier otro layout
    las coordenadas guardadas (spring) ya no describen lo que se ve: mandarlas
    igual hace que Cytoscape las reaplique cada vez que se reemplaza la lista
    de elementos —o sea, en cada paso de la traza— y el grafo salta desde el
    layout elegido de vuelta a las posiciones viejas.
    """
    elementos = []
    for n, datos in G.nodes(data=True):
        elemento = {"data": {"id": str(n), "label": datos.get("label", str(n))}}
        if incluir_posiciones:
            pos = datos.get("pos", [0, 0])
            elemento["position"] = {"x": pos[0], "y": pos[1]}
        elementos.append(elemento)
    dirigido = G.is_directed()
    for u, v, datos in G.edges(data=True):
        peso = datos.get("weight")
        etiqueta = datos.get("label", "" if peso is None else str(peso))
        elementos.append(
            {
                "data": {
                    "id": id_arista(u, v, dirigido),
                    "source": str(u),
                    "target": str(v),
                    "label": etiqueta,
                },
                "classes": "" if dirigido else "no_dirigido",
            }
        )
    return elementos


_EVENTOS_PERSISTENTES_NODO = {
    "visitar_nodo": "visitado",
    "nodo_finalizado": "finalizado",
    "ciclo_negativo": "ciclo_negativo",
}
_EVENTOS_TRANSITORIOS_ARISTA = {"explorar_arista", "relajar", "descartar_arista"}


def calcular_estado(trace: list[dict], paso_actual: int, dirigido: bool):
    """Recorre la traza hasta `paso_actual` (inclusive) y devuelve dos
    diccionarios: {id_nodo: {clases}} y {id_arista: {clases}}."""
    clases_nodo: dict[str, set[str]] = {}
    clases_arista: dict[str, set[str]] = {}

    def agregar(dic, clave, clase):
        dic.setdefault(clave, set()).add(clase)

    paso_actual = max(0, min(paso_actual, len(trace) - 1)) if trace else -1

    for ev in trace[: paso_actual + 1]:
        tipo = ev["tipo"]
        if tipo in _EVENTOS_PERSISTENTES_NODO:
            agregar(clases_nodo, ev["nodo"], _EVENTOS_PERSISTENTES_NODO[tipo])
        elif tipo == "arista_solucion":
            agregar(clases_arista, id_arista(ev["u"], ev["v"], dirigido), "solucion")
            agregar(clases_nodo, ev["v"], "solucion")

    if 0 <= paso_actual < len(trace):
        ev = trace[paso_actual]
        tipo = ev["tipo"]
        if tipo in _EVENTOS_TRANSITORIOS_ARISTA:
            agregar(clases_arista, id_arista(ev["u"], ev["v"], dirigido), "activo")
            agregar(clases_nodo, ev["u"], "activo")
            agregar(clases_nodo, ev["v"], "activo")
        elif tipo == "procesar_nodo":
            agregar(clases_nodo, ev["nodo"], "activo")

    return clases_nodo, clases_arista


def calcular_distancias(trace: list[dict], paso_actual: int) -> dict[str, float] | None:
    """Reconstruye la distancia conocida de cada nodo en `paso_actual`.

    Devuelve None si la traza no lleva información de distancia — es el caso de
    DFS, que no calcula ninguna. Así la etiqueta secundaria aparece sola en los
    algoritmos donde tiene sentido, sin necesidad de marcarlos en el registro.

    Se reproducen los eventos en orden en vez de guardar el diccionario
    completo en cada paso: la traza ya viaja al navegador en cada corrida y
    duplicar el estado por paso la haría crecer de forma cuadrática.
    """
    if not trace:
        return None

    distancias: dict[str, float] = {}
    hubo_datos = False
    tope = max(0, min(paso_actual, len(trace) - 1))

    for ev in trace[: tope + 1]:
        # 'dist' lo emiten los algoritmos al fijar la distancia de un nodo;
        # 'relajar' trae la nueva distancia del extremo de destino.
        if "dist" in ev and "nodo" in ev:
            distancias[ev["nodo"]] = ev["dist"]
            hubo_datos = True
        elif ev["tipo"] == "relajar" and "nueva_dist" in ev:
            distancias[ev["v"]] = ev["nueva_dist"]
            hubo_datos = True

    if not hubo_datos:
        # Puede que el algoritmo sí calcule distancias pero que en los primeros
        # pasos todavía no haya emitido ninguna: se distingue mirando la traza
        # entera, no solo el tramo recorrido.
        lleva_distancias = any(
            "dist" in ev or (ev["tipo"] == "relajar" and "nueva_dist" in ev) for ev in trace
        )
        if not lleva_distancias:
            return None
    return distancias


def aplicar_distancias(
    elementos: list[dict],
    distancias: dict[str, float],
    simbolo_infinito: str = "∞",
) -> list[dict]:
    """Agrega a cada nodo una segunda línea de etiqueta con su distancia.

    Cytoscape.js dibuja una sola etiqueta por elemento, así que la "etiqueta
    secundaria" se implementa como un segundo renglón del mismo texto, y la
    hoja de estilos lo mueve fuera del nodo (ver cytoscape_style.py). El
    prefijo 'd=' está para que cada renglón se identifique solo, sin tener que
    ir a mirar la leyenda.

    Los nodos todavía no alcanzados muestran ∞, que es justamente lo que hace
    legible el avance de Dijkstra o Bellman-Ford: se ve cuáles siguen fuera del
    alcance y cuáles ya mejoraron.
    """
    nuevos = []
    for el in elementos:
        el = {**el, "data": dict(el["data"])}
        data = el["data"]
        if "source" not in data:
            valor = distancias.get(data["id"])
            if valor is None or valor == float("inf"):
                texto = simbolo_infinito
            elif isinstance(valor, float) and valor.is_integer():
                texto = str(int(valor))
            else:
                texto = str(valor)
            data["dist"] = texto
            data["label"] = f"{data['label']}\nd={texto}"
            clases = set((el.get("classes") or "").split())
            clases.add("con_distancia")
            el["classes"] = " ".join(sorted(clases))
        nuevos.append(el)
    return nuevos


def aplicar_clases(
    elementos: list[dict],
    clases_nodo: dict[str, set[str]],
    clases_arista: dict[str, set[str]],
    origen: str | None = None,
) -> list[dict]:
    nuevos = []
    for el in elementos:
        el = {**el, "data": dict(el["data"])}
        data = el["data"]
        # Preserva clases "estructurales" ya puestas por graph_to_elements
        # (p. ej. 'no_dirigido'), y les suma las de estado de la traza.
        clases = set((el.get("classes") or "").split())
        if "source" in data:
            clases |= clases_arista.get(data["id"], set())
        else:
            clases |= clases_nodo.get(data["id"], set())
            if origen is not None and data["id"] == str(origen):
                clases.add("origen")
        el["classes"] = " ".join(sorted(clases))
        nuevos.append(el)
    return nuevos
