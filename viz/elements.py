"""Convierte (grafo, traza, paso actual) en elementos de Dash Cytoscape.

Es la única capa que conoce a la vez el formato de los eventos de la traza y el
formato de elementos de Cytoscape. Los algoritmos no dependen de ella, y
Cytoscape no depende de los algoritmos.

Estados de nodo y de arista:
- Persistentes, se mantienen una vez aplicados: 'visitado', 'finalizado',
  'solucion' y 'ciclo_negativo'.
- Transitorio, se aplica solo durante el paso actual: 'activo'.
"""
from __future__ import annotations

import networkx as nx


def id_arista(u: str, v: str, dirigido: bool) -> str:
    """Identificador estable de una arista.

    No depende del orden en que el algoritmo haya recorrido sus extremos, lo
    que es necesario en grafos no dirigidos.
    """
    if dirigido:
        return f"{u}__{v}"
    a, b = sorted((str(u), str(v)))
    return f"{a}__{b}"


def graph_to_elements(G: nx.Graph, incluir_posiciones: bool = True) -> list[dict]:
    """Construye los elementos de Cytoscape.

    Las aristas de un grafo no dirigido reciben la clase 'no_dirigido', que la
    hoja de estilos usa para omitir la punta de flecha (ver cytoscape_style.py).

    El parámetro `incluir_posiciones` determina si cada nodo incluye su
    coordenada guardada. Solo debe activarse con el layout 'preset'. Cytoscape
    aplica las coordenadas recibidas cada vez que se reemplaza la lista de
    elementos, es decir en cada paso de la traza, y con cualquier otro layout
    eso desplaza el grafo a las posiciones guardadas.
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
    """Recorre la traza hasta `paso_actual`, inclusive.

    Devuelve dos diccionarios: {id_nodo: {clases}} y {id_arista: {clases}}.
    """
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

    Devuelve None si la traza no contiene información de distancia, que es el
    caso de DFS. Así la etiqueta secundaria aparece solo en los algoritmos que
    calculan distancias, sin necesidad de declararlo en el registro.

    Los eventos se reproducen en orden. La traza se envía entera al navegador
    en cada ejecución, y almacenar el diccionario completo por paso haría que
    creciera de forma cuadrática.
    """
    if not trace:
        return None

    distancias: dict[str, float] = {}
    hubo_datos = False
    tope = max(0, min(paso_actual, len(trace) - 1))

    for ev in trace[: tope + 1]:
        # Los algoritmos emiten 'dist' al fijar la distancia de un nodo. El
        # evento 'relajar' incluye la nueva distancia del nodo de destino.
        if "dist" in ev and "nodo" in ev:
            distancias[ev["nodo"]] = ev["dist"]
            hubo_datos = True
        elif ev["tipo"] == "relajar" and "nueva_dist" in ev:
            distancias[ev["v"]] = ev["nueva_dist"]
            hubo_datos = True

    if not hubo_datos:
        # El algoritmo puede calcular distancias y no haber emitido ninguna en
        # los primeros pasos, de modo que se examina la traza completa.
        lleva_distancias = any(
            "dist" in ev or (ev["tipo"] == "relajar" and "nueva_dist" in ev) for ev in trace
        )
        if not lleva_distancias:
            return None
    return distancias


def calcular_iteracion(trace: list[dict], paso_actual: int) -> dict | None:
    """Estado del contador de iteraciones en `paso_actual`.

    Devuelve None si el algoritmo no trabaja por iteraciones. Solo Bellman-Ford
    las emite: su costo depende del número de veces que recorre todas las
    aristas, y sin este dato las pasadas son indistinguibles entre sí, porque
    repiten los mismos eventos.
    """
    if not trace:
        return None
    tope = max(0, min(paso_actual, len(trace) - 1))
    estado = None
    for ev in trace[: tope + 1]:
        if ev["tipo"] == "inicio_iteracion":
            estado = {
                "iteracion": ev["iteracion"],
                "total": ev["total_iteraciones"],
                "terminado": False,
                "anticipado": False,
            }
        elif ev["tipo"] == "fin_iteraciones":
            estado = {
                "iteracion": ev["iteracion"],
                "total": ev["total_iteraciones"],
                "terminado": True,
                "anticipado": ev.get("anticipado", False),
            }
    if estado is None:
        # Puede que el algoritmo sí itere pero que todavía no haya empezado la
        # primera pasada: se distingue mirando la traza entera.
        if not any(ev["tipo"] == "inicio_iteracion" for ev in trace):
            return None
        primera = next(ev for ev in trace if ev["tipo"] == "inicio_iteracion")
        return {
            "iteracion": 0,
            "total": primera["total_iteraciones"],
            "terminado": False,
            "anticipado": False,
        }
    return estado


def texto_iteracion(estado: dict | None) -> str:
    """Convierte el estado de iteración en el texto que muestra la interfaz."""
    if estado is None:
        return ""
    total = estado["total"]
    if estado["terminado"]:
        if estado["anticipado"]:
            return (
                f"Iteraciones: {estado['iteracion']} de {total}. "
                "Terminó antes por una pasada sin cambios."
            )
        return f"Iteraciones: {estado['iteracion']} de {total}. Completadas."
    if estado["iteracion"] == 0:
        return f"Iteración 0 de {total}. El bucle no ha comenzado."
    return f"Iteración {estado['iteracion']} de {total}"


def aplicar_distancias(
    elementos: list[dict],
    distancias: dict[str, float],
    simbolo_infinito: str = "∞",
) -> list[dict]:
    """Añade a cada nodo un segundo renglón de etiqueta con su distancia.

    Cytoscape.js dibuja una sola etiqueta por elemento, por lo que el segundo
    renglón forma parte del mismo texto y la hoja de estilos lo sitúa fuera del
    nodo (ver cytoscape_style.py). El prefijo 'd=' identifica el renglón sin
    necesidad de consultar la leyenda.

    Los nodos que aún no se han alcanzado muestran el símbolo de infinito, lo
    que permite distinguir en Dijkstra y Bellman-Ford qué nodos siguen fuera de
    alcance y cuáles ya tienen una distancia calculada.
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
        # Une las clases estructurales de graph_to_elements, como
        # 'no_dirigido', con las de estado que indica la traza.
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
