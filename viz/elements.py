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


def graph_to_elements(G: nx.Graph) -> list[dict]:
    elementos = []
    for n, datos in G.nodes(data=True):
        pos = datos.get("pos", [0, 0])
        elementos.append(
            {
                "data": {"id": str(n), "label": datos.get("label", str(n))},
                "position": {"x": pos[0], "y": pos[1]},
            }
        )
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
                }
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
        if "source" in data:
            clases = set(clases_arista.get(data["id"], set()))
        else:
            clases = set(clases_nodo.get(data["id"], set()))
            if origen is not None and data["id"] == str(origen):
                clases.add("origen")
        el["classes"] = " ".join(sorted(clases))
        nuevos.append(el)
    return nuevos
