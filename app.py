"""Capa de interacción/control: la única parte que sabe de Dash.

Orquesta las otras tres capas (graph_model, algorithms, viz) pero no
implementa lógica de grafos, de algoritmos ni de estilos por sí misma.
"""
from __future__ import annotations

import base64
import json

import dash
import dash_cytoscape as cyto
from dash import Dash, Input, Output, State, ctx, dcc, html, no_update
from dash.exceptions import PreventUpdate

from algorithms.registry import ALGORITMOS, algoritmos_disponibles
from graph_model.model import generar_aleatorio, graph_from_dict, graph_to_dict
from viz.cytoscape_style import STYLESHEET
from viz.elements import aplicar_clases, calcular_estado, graph_to_elements

LAYOUTS = ["circle", "breadthfirst", "grid", "cose", "preset"]

app = Dash(__name__)
app.title = "Visualizador de Algoritmos sobre Grafos"
server = app.server


def _panel_generar():
    return html.Div(
        className="panel",
        children=[
            html.H4("Generar instancia"),
            html.Label("Nodos"),
            dcc.Input(id="in-n", type="number", value=10, min=2, max=200, step=1),
            html.Label("Densidad (0-1)"),
            dcc.Input(id="in-densidad", type="number", value=0.3, min=0, max=1, step=0.05),
            html.Label("Peso mínimo"),
            dcc.Input(id="in-peso-min", type="number", value=1, step=1),
            html.Label("Peso máximo"),
            dcc.Input(id="in-peso-max", type="number", value=10, step=1),
            dcc.Checklist(
                id="in-flags",
                options=[
                    {"label": " Dirigido", "value": "dirigido"},
                    {"label": " Forzar DAG", "value": "dag"},
                    {"label": " Conexo", "value": "conexo"},
                    {"label": " Permitir pesos negativos", "value": "negativos"},
                ],
                value=["dirigido", "conexo"],
                labelStyle={"display": "block"},
            ),
            html.Label("Semilla (opcional)"),
            dcc.Input(id="in-seed", type="number"),
            html.Button("Generar instancia", id="btn-generar", n_clicks=0, className="btn-primario"),
        ],
    )


def _panel_archivo():
    return html.Div(
        className="panel",
        children=[
            html.H4("Archivo"),
            dcc.Upload(id="upload-json", children=html.Button("Cargar JSON")),
            html.Button("Guardar JSON", id="btn-guardar", n_clicks=0),
            dcc.Download(id="download-json"),
            html.Div(id="txt-archivo", className="txt-estado"),
        ],
    )


def _panel_algoritmo():
    return html.Div(
        className="panel",
        children=[
            html.H4("Algoritmo"),
            html.Div(
                className="fila-algoritmo",
                children=[
                    dcc.Dropdown(id="dd-algoritmo", placeholder="Algoritmo"),
                    html.Button(
                        "ℹ️",
                        id="btn-info-algoritmo",
                        title="Ver cómo funciona este algoritmo",
                        className="btn-info",
                    ),
                ],
            ),
            dcc.Dropdown(id="dd-origen", placeholder="Nodo origen"),
            html.Button("Ejecutar", id="btn-ejecutar", n_clicks=0, className="btn-primario"),
            html.Div(id="txt-resultado", className="txt-estado"),
        ],
    )


def _modal_info():
    return html.Div(
        id="modal-info",
        className="modal-overlay",
        style={"display": "none"},
        children=[
            html.Div(
                className="modal-contenido",
                children=[
                    html.Div(
                        className="modal-header",
                        children=[
                            html.H3(id="modal-info-titulo"),
                            html.Button("✕", id="btn-cerrar-info", className="btn-cerrar"),
                        ],
                    ),
                    dcc.Markdown(id="modal-info-texto"),
                ],
            )
        ],
    )


def _panel_pseudocodigo():
    """Panel persistente (no modal) junto al canvas: muestra el pseudocódigo
    del algoritmo elegido y resalta en vivo la línea que corresponde al
    paso actual de la traza, sincronizado con la reproducción."""
    return html.Div(
        className="panel panel-codigo",
        children=[
            html.H4(id="pseudocodigo-titulo", children="Pseudocódigo"),
            html.Div(
                id="pseudocodigo-lineas",
                className="bloque-codigo",
                children=[html.Div("Elegí un algoritmo para verlo acá.", className="txt-ayuda")],
            ),
        ],
    )


def _toolbar_grafo():
    """Barra de reproducción + centrado, siempre visible sobre el canvas
    (a diferencia de un panel más en el sidebar, que podía quedar fuera
    de la vista si había que hacer scroll)."""
    return html.Div(
        className="toolbar-grafo",
        children=[
            html.Div(
                className="fila-botones",
                children=[
                    html.Button("⏮", id="btn-reiniciar", title="Reiniciar"),
                    html.Button("⏪", id="btn-anterior", title="Paso anterior"),
                    html.Button("▶", id="btn-play", title="Reproducir / Pausar"),
                    html.Button("⏩", id="btn-siguiente", title="Paso siguiente"),
                    html.Button("🎯 Centrar", id="btn-centrar", title="Centrar y ajustar vista al grafo"),
                ],
            ),
            html.Div(
                className="fila-velocidad",
                children=[
                    html.Span("Velocidad (pasos/seg)", className="txt-ayuda"),
                    dcc.Slider(
                        id="sl-velocidad",
                        min=1,
                        max=30,
                        step=1,
                        value=5,
                        marks={1: "1", 5: "5", 10: "10", 20: "20", 30: "30"},
                    ),
                ],
            ),
            html.Div(id="txt-paso", className="txt-estado"),
        ],
    )


app.layout = html.Div(
    className="app-contenedor",
    children=[
        html.H2("Visualizador de Algoritmos sobre Grafos"),
        html.Div(
            className="fila-principal",
            children=[
                html.Div(
                    className="columna-controles",
                    children=[
                        _panel_generar(),
                        _panel_archivo(),
                        _panel_algoritmo(),
                        html.Div(
                            className="panel",
                            children=[
                                html.H4("Layout"),
                                dcc.Dropdown(
                                    id="dd-layout",
                                    options=[{"label": l, "value": l} for l in LAYOUTS],
                                    value="circle",
                                    clearable=False,
                                ),
                                html.Div(
                                    "Cualquier layout se recalcula solo al elegirlo o al "
                                    "apretar 'Centrar' — nunca solo entre pasos. "
                                    "'preset' usa la posición guardada en la instancia.",
                                    className="txt-ayuda",
                                ),
                            ],
                        ),
                    ],
                ),
                html.Div(
                    className="columna-grafo",
                    children=[
                        _toolbar_grafo(),
                        cyto.Cytoscape(
                            id="cyto",
                            elements=[],
                            stylesheet=STYLESHEET,
                            layout={"name": "circle"},
                            autoRefreshLayout=False,
                            style={"width": "100%", "flex": "1", "border": "1px solid #cfd8dc"},
                        ),
                    ],
                ),
                html.Div(
                    className="columna-codigo",
                    children=[_panel_pseudocodigo()],
                ),
            ],
        ),
        _modal_info(),
        dcc.Interval(id="interval", interval=200, disabled=True, n_intervals=0),
        dcc.Store(id="store-grafo"),
        dcc.Store(id="store-trace"),
        dcc.Store(id="store-resultado"),
        dcc.Store(id="store-algoritmo-ejecutado"),
        dcc.Store(id="store-paso", data=0),
        dcc.Store(id="store-reproduciendo", data=False),
    ],
)


# ---------------------------------------------------------------------------
# 1) Generar instancia aleatoria (también corre una vez al cargar la página)
# ---------------------------------------------------------------------------
@app.callback(
    Output("store-grafo", "data"),
    Output("store-trace", "data"),
    Output("store-paso", "data"),
    Input("btn-generar", "n_clicks"),
    State("in-n", "value"),
    State("in-densidad", "value"),
    State("in-peso-min", "value"),
    State("in-peso-max", "value"),
    State("in-flags", "value"),
    State("in-seed", "value"),
)
def generar(n_clicks, n, densidad, peso_min, peso_max, flags, seed):
    flags = flags or []
    G = generar_aleatorio(
        n=int(n or 10),
        densidad=float(densidad if densidad is not None else 0.3),
        dirigido="dirigido" in flags,
        dag="dag" in flags,
        conexo="conexo" in flags,
        peso_min=int(peso_min or 1),
        peso_max=int(peso_max or 10),
        permitir_negativos="negativos" in flags,
        seed=int(seed) if seed not in (None, "") else None,
    )
    return graph_to_dict(G), None, 0


# ---------------------------------------------------------------------------
# 2) Cargar instancia desde archivo JSON
# ---------------------------------------------------------------------------
@app.callback(
    Output("store-grafo", "data", allow_duplicate=True),
    Output("store-trace", "data", allow_duplicate=True),
    Output("store-paso", "data", allow_duplicate=True),
    Output("txt-archivo", "children"),
    Input("upload-json", "contents"),
    State("upload-json", "filename"),
    prevent_initial_call=True,
)
def cargar(contenido, nombre_archivo):
    if not contenido:
        raise PreventUpdate
    try:
        _, cadena_b64 = contenido.split(",", 1)
        data = json.loads(base64.b64decode(cadena_b64))
        graph_from_dict(data)  # valida que el formato sea correcto
    except Exception as exc:  # noqa: BLE001
        return no_update, no_update, no_update, f"No se pudo leer {nombre_archivo}: {exc}"
    return data, None, 0, f"Cargado: {nombre_archivo}"


# ---------------------------------------------------------------------------
# 3) Guardar instancia actual a JSON (preserva posiciones de nodos)
# ---------------------------------------------------------------------------
@app.callback(
    Output("download-json", "data"),
    Input("btn-guardar", "n_clicks"),
    State("store-grafo", "data"),
    prevent_initial_call=True,
)
def guardar(n_clicks, data):
    if not data:
        raise PreventUpdate
    contenido = json.dumps(data, indent=2, ensure_ascii=False)
    return dcc.send_string(contenido, "grafo.json")


# ---------------------------------------------------------------------------
# 4) Opciones de algoritmo/origen según el grafo actual
# ---------------------------------------------------------------------------
@app.callback(
    Output("dd-algoritmo", "options"),
    Output("dd-algoritmo", "value"),
    Output("dd-origen", "options"),
    Output("dd-origen", "value"),
    Input("store-grafo", "data"),
)
def actualizar_opciones(data):
    if not data:
        raise PreventUpdate
    G = graph_from_dict(data)
    disponibles = algoritmos_disponibles(G)
    opciones_alg = [{"label": info["nombre"], "value": kid} for kid, info in disponibles.items()]
    valor_alg = opciones_alg[0]["value"] if opciones_alg else None

    nodos = sorted(G.nodes, key=lambda x: (len(x), x))
    opciones_nodo = [{"label": n, "value": n} for n in nodos]
    valor_nodo = nodos[0] if nodos else None
    return opciones_alg, valor_alg, opciones_nodo, valor_nodo


# ---------------------------------------------------------------------------
# 5) Ejecutar algoritmo seleccionado -> genera la traza completa
# ---------------------------------------------------------------------------
@app.callback(
    Output("store-trace", "data", allow_duplicate=True),
    Output("store-resultado", "data"),
    Output("store-algoritmo-ejecutado", "data"),
    Output("store-paso", "data", allow_duplicate=True),
    Output("txt-resultado", "children"),
    Input("btn-ejecutar", "n_clicks"),
    State("store-grafo", "data"),
    State("dd-algoritmo", "value"),
    State("dd-origen", "value"),
    prevent_initial_call=True,
)
def ejecutar(n_clicks, data, alg_id, origen):
    if not data or not alg_id or origen is None:
        raise PreventUpdate
    G = graph_from_dict(data)
    info = ALGORITMOS[alg_id]
    try:
        resultado, trace = info["funcion"](G, origen)
    except ValueError as exc:
        return no_update, no_update, no_update, no_update, f"Error: {exc}"
    return trace, resultado, alg_id, 0, f"{info['nombre']} desde {origen} — {len(trace)} pasos de traza."


# ---------------------------------------------------------------------------
# 6) Play / Pausa
# ---------------------------------------------------------------------------
@app.callback(
    Output("store-reproduciendo", "data"),
    Output("interval", "disabled"),
    Output("btn-play", "children"),
    Input("btn-play", "n_clicks"),
    State("store-reproduciendo", "data"),
    State("store-trace", "data"),
    prevent_initial_call=True,
)
def alternar_play(n_clicks, reproduciendo, trace):
    if not trace:
        raise PreventUpdate
    nuevo = not reproduciendo
    return nuevo, not nuevo, ("⏸" if nuevo else "▶")


# ---------------------------------------------------------------------------
# 7) Cada tick del Interval avanza un paso (controla la velocidad)
# ---------------------------------------------------------------------------
@app.callback(
    Output("store-paso", "data", allow_duplicate=True),
    Output("store-reproduciendo", "data", allow_duplicate=True),
    Output("interval", "disabled", allow_duplicate=True),
    Output("btn-play", "children", allow_duplicate=True),
    Input("interval", "n_intervals"),
    State("store-paso", "data"),
    State("store-trace", "data"),
    prevent_initial_call=True,
)
def avanzar_automatico(n_intervals, paso, trace):
    if not trace:
        raise PreventUpdate
    paso = (paso or 0) + 1
    if paso >= len(trace) - 1:
        return len(trace) - 1, False, True, "▶"
    return paso, no_update, no_update, no_update


@app.callback(
    Output("interval", "interval"),
    Input("sl-velocidad", "value"),
)
def cambiar_velocidad(pasos_por_segundo):
    # El slider es "pasos por segundo" (más a la derecha = más rápido);
    # dcc.Interval espera un intervalo en milisegundos, así que se invierte.
    pps = pasos_por_segundo or 5
    return max(20, round(1000 / pps))


# ---------------------------------------------------------------------------
# 8) Controles manuales de paso
# ---------------------------------------------------------------------------
@app.callback(
    Output("store-paso", "data", allow_duplicate=True),
    Input("btn-siguiente", "n_clicks"),
    Input("btn-anterior", "n_clicks"),
    Input("btn-reiniciar", "n_clicks"),
    State("store-paso", "data"),
    State("store-trace", "data"),
    prevent_initial_call=True,
)
def controles_paso(n_sig, n_ant, n_rei, paso, trace):
    if not trace:
        raise PreventUpdate
    total = len(trace)
    paso = paso or 0
    disparador = ctx.triggered_id
    if disparador == "btn-siguiente":
        paso = min(paso + 1, total - 1)
    elif disparador == "btn-anterior":
        paso = max(paso - 1, 0)
    elif disparador == "btn-reiniciar":
        paso = 0
    return paso


# ---------------------------------------------------------------------------
# 9) Render de Cytoscape: un único callback para 'elements' y 'layout'.
#
#    Van juntos a propósito: si se reparten en dos callbacks separados que
#    escriben sobre el mismo componente, Dash puede despacharlos casi
#    simultáneamente y Cytoscape.js llega a pisarse (crashea con
#    "Cannot read properties of null (reading 'isHeadless')"). Por eso se
#    resuelven acá adentro con no_update: el layout (reposicionar nodos)
#    solo se recalcula cuando cambia el grafo, el tipo de layout elegido,
#    o se pide "Centrar" — nunca en cada paso de la traza, porque con
#    layouts de fuerza dirigida como "cose" eso hace saltar los nodos de
#    lugar en cada paso y el grafo termina fuera del área visible.
# ---------------------------------------------------------------------------
@app.callback(
    Output("cyto", "elements"),
    Output("cyto", "layout"),
    Output("txt-paso", "children"),
    Input("store-grafo", "data"),
    Input("store-trace", "data"),
    Input("store-paso", "data"),
    Input("dd-layout", "value"),
    Input("btn-centrar", "n_clicks"),
    State("dd-origen", "value"),
)
def render_cyto(data, trace, paso, layout_name, n_clicks_centrar, origen):
    if not data:
        raise PreventUpdate
    G = graph_from_dict(data)
    elementos = graph_to_elements(G)
    dirigido = G.is_directed()

    texto_paso = "Sin traza — ejecuta un algoritmo."
    if trace:
        paso = max(0, min(paso or 0, len(trace) - 1))
        clases_nodo, clases_arista = calcular_estado(trace, paso, dirigido)
        elementos = aplicar_clases(elementos, clases_nodo, clases_arista, origen)
        ev = trace[paso]
        texto_paso = f"Paso {paso + 1}/{len(trace)} — {ev['tipo']}"
    else:
        elementos = aplicar_clases(elementos, {}, {}, origen)

    disparador = ctx.triggered_id
    if disparador in ("store-grafo", "dd-layout", "btn-centrar", None):
        nuevo_layout = {"name": layout_name or "circle", "fit": True, "padding": 30, "animate": False}
    else:
        nuevo_layout = no_update

    return elementos, nuevo_layout, texto_paso


# ---------------------------------------------------------------------------
# 10) Popup de instrucciones: qué hace el algoritmo elegido, restricciones
#     y complejidad. El texto sale de algorithms/registry.py — agregar un
#     algoritmo nuevo también agrega su popup automáticamente.
# ---------------------------------------------------------------------------
@app.callback(
    Output("modal-info", "style"),
    Output("modal-info-titulo", "children"),
    Output("modal-info-texto", "children"),
    Input("btn-info-algoritmo", "n_clicks"),
    Input("btn-cerrar-info", "n_clicks"),
    State("dd-algoritmo", "value"),
    prevent_initial_call=True,
)
def alternar_modal_info(n_abrir, n_cerrar, alg_id):
    disparador = ctx.triggered_id
    if disparador == "btn-info-algoritmo":
        if not alg_id:
            raise PreventUpdate
        info = ALGORITMOS[alg_id]
        return {"display": "flex"}, info["nombre"], info.get("descripcion", "Sin descripción.")
    return {"display": "none"}, no_update, no_update


# ---------------------------------------------------------------------------
# 11) Panel de pseudocódigo: se sincroniza en vivo con el paso actual de la
#     traza. Cada evento de la traza trae un campo "linea" (asignado en el
#     propio algoritmo, ver algorithms/bfs.py etc.) que indica a qué línea
#     del pseudocódigo corresponde ese paso; acá solo se resalta.
#     Si cambiás de algoritmo en el dropdown sin volver a ejecutar, se
#     muestra el código pero sin resaltar nada (la traza vigente es de
#     otro algoritmo).
# ---------------------------------------------------------------------------
@app.callback(
    Output("pseudocodigo-titulo", "children"),
    Output("pseudocodigo-lineas", "children"),
    Input("dd-algoritmo", "value"),
    Input("store-trace", "data"),
    Input("store-paso", "data"),
    State("store-algoritmo-ejecutado", "data"),
)
def render_pseudocodigo(alg_id, trace, paso, alg_id_ejecutado):
    if not alg_id or alg_id not in ALGORITMOS:
        raise PreventUpdate
    info = ALGORITMOS[alg_id]
    lineas = info.get("pseudocodigo", [])

    linea_activa = None
    if trace and alg_id == alg_id_ejecutado:
        p = max(0, min(paso or 0, len(trace) - 1))
        linea_activa = trace[p].get("linea")

    hijos = [
        html.Div(
            [html.Span(f"{i:>2}", className="num-linea"), " ", texto],
            className="linea-codigo" + (" linea-activa" if i == linea_activa else ""),
        )
        for i, texto in enumerate(lineas, start=1)
    ]
    return f"Pseudocódigo — {info['nombre']}", hijos


if __name__ == "__main__":
    app.run(debug=True)
