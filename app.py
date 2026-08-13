"""Capa de interacción/control: la única parte que sabe de Dash.

Orquesta las otras tres capas (graph_model, algorithms, viz) pero no
implementa lógica de grafos, de algoritmos ni de estilos por sí misma.
"""
from __future__ import annotations

import base64
import csv
import io
import json
import os
import time

import dash
import dash_cytoscape as cyto
from dash import ALL, Dash, Input, Output, State, ctx, dcc, html, no_update
from dash.exceptions import PreventUpdate

from algorithms.registry import ALGORITMOS, estado_algoritmos
from graph_model.ejemplos import EJEMPLOS, construir_ejemplo
from graph_model.model import generar_aleatorio, graph_from_dict, graph_to_dict
from viz.cytoscape_style import ESTADOS_LEYENDA, STYLESHEET
from viz.elements import (
    aplicar_clases,
    aplicar_distancias,
    calcular_distancias,
    calcular_estado,
    calcular_iteracion,
    graph_to_elements,
    texto_iteracion,
)

LAYOUTS = ["circle", "breadthfirst", "grid", "cose", "preset"]

# Enlace del crédito del pie de página. Apunta al LICENSE del remoto 'origin'
# (rama main); si el repositorio se mueve, hay que actualizarlo acá.
URL_LICENCIA = (
    "https://github.com/joseasoto-uchile/algoritmos-combinatoriales/blob/main/LICENSE"
)

# Velocidad de reproducción, en pasos por segundo.
#
# Se escribe directamente en un campo numérico, sin deslizador. Un deslizador
# lineal de 1 a 60 repartía sus valores en ~200 px (unos 3 px por paso), así
# que pasar de 1 a 2 pasos/seg —justo el tramo lento, el que se usa para
# seguir el algoritmo con detalle— exigía una precisión absurda.
#
# Tampoco se mantiene un deslizador junto al campo: al escribir un valor que
# no cae en una de sus posiciones, ambos controles quedan mostrando cosas
# distintas, y sincronizarlos hace que uno pise lo que el usuario escribió en
# el otro. Los atajos son botones, que no guardan estado y no tienen ese
# problema: solo escriben en el campo.
VELOCIDAD_MINIMA = 1
VELOCIDAD_MAXIMA = 100
VELOCIDAD_INICIAL = 5
ATAJOS_VELOCIDAD = [1, 5, 15, 50]


def _velocidad_valida(valor) -> int:
    """Normaliza los pasos por segundo escritos a mano.

    El campo puede llegar vacío mientras se escribe, o con un valor fuera de
    rango si se teclea directo, así que se acota en vez de confiar en los
    límites del control.
    """
    try:
        v = int(float(valor))
    except (TypeError, ValueError):
        return VELOCIDAD_INICIAL
    return min(max(v, VELOCIDAD_MINIMA), VELOCIDAD_MAXIMA)

app = Dash(__name__)
app.title = "Visualizador de Algoritmos sobre Grafos"
server = app.server


def _entero(valor, defecto: int) -> int:
    """Convierte a int tolerando el campo vacío, SIN confundir 0 con vacío.

    El idiom `int(valor or defecto)` parece equivalente pero no lo es: 0 es
    falsy, así que un peso mínimo de 0 escrito por el usuario se convertía
    silenciosamente en el valor por omisión.
    """
    if valor is None or valor == "":
        return defecto
    try:
        return int(valor)
    except (TypeError, ValueError):
        return defecto


def _decimal(valor, defecto: float) -> float:
    if valor is None or valor == "":
        return defecto
    try:
        return float(valor)
    except (TypeError, ValueError):
        return defecto


def _origen_por_omision(G, nodos):
    """Elige el nodo origen que se preselecciona al cambiar de instancia.

    En un grafo dirigido, "conexo" solo garantiza conexidad *débil*: el primer
    nodo puede no tener ninguna arista saliente, y arrancar ahí produce un
    recorrido de tres pasos que parece un error de la aplicación. Por eso ahí
    se prefiere el nodo con más salidas.

    En un grafo no dirigido la heurística no aporta —desde cualquier nodo se
    alcanza todo su componente— y además estropea los ejemplos con estructura:
    en el árbol conviene partir de la raíz y no de un nodo interno cualquiera.
    Se mantiene el primer nodo, saltando los aislados.
    """
    if not nodos:
        return None
    if G.is_directed():
        return max(nodos, key=lambda n: G.out_degree(n))
    with_edges = [n for n in nodos if G.degree(n) > 0]
    return with_edges[0] if with_edges else nodos[0]


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
            html.Div(
                "Con pesos negativos se ignora el peso mínimo: se sortea en "
                "[-peso máximo, peso máximo].",
                className="txt-ayuda",
            ),
            html.Label("Semilla (opcional)"),
            dcc.Input(id="in-seed", type="number"),
            html.Button("Generar instancia", id="btn-generar", n_clicks=0, className="btn-primario"),
            html.Div(id="txt-generar"),
        ],
    )


def _panel_ejemplos():
    """Instancias con forma conocida (árbol, ciclo, rejilla, DAG...). Un grafo
    aleatorio sirve para probar, pero para *entender* el recorrido conviene
    una estructura reconocible."""
    return html.Div(
        className="panel",
        children=[
            html.H4("Instancias de ejemplo"),
            dcc.Dropdown(
                id="dd-ejemplo",
                options=[{"label": info["nombre"], "value": kid} for kid, info in EJEMPLOS.items()],
                placeholder="Elegir ejemplo",
            ),
            html.Div(id="txt-ejemplo", className="txt-ayuda"),
            html.Button("Cargar ejemplo", id="btn-ejemplo", n_clicks=0, className="btn-primario"),
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
            html.H4("Exportar traza", style={"marginTop": "12px"}),
            html.Div(
                className="fila-botones",
                children=[
                    html.Button("Traza JSON", id="btn-traza-json", n_clicks=0),
                    html.Button("Traza CSV", id="btn-traza-csv", n_clicks=0),
                ],
            ),
            dcc.Download(id="download-traza"),
            html.Div(id="txt-traza", className="txt-estado"),
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
            html.Div(
                "También puedes hacer clic en un nodo del grafo para elegirlo como origen.",
                className="txt-ayuda",
            ),
            html.Button("Ejecutar", id="btn-ejecutar", n_clicks=0, className="btn-primario"),
            html.Div(id="txt-resultado", className="txt-estado"),
            html.Div(id="lista-no-disponibles", className="lista-no-disponibles"),
        ],
    )


def _panel_layout():
    return html.Div(
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
            html.Div(id="pseudocodigo-complejidad"),
            html.Div(
                "Haz clic en una línea para poner un punto de interrupción: "
                "la reproducción se detiene al llegar ahí.",
                className="txt-ayuda",
            ),
            html.Div(
                id="pseudocodigo-lineas",
                className="bloque-codigo",
                children=[html.Div("Elige un algoritmo para verlo acá.", className="txt-ayuda")],
            ),
        ],
    )


def _pie():
    """Pie de página: autoría, licencia y advertencia de uso.

    El texto de licencia y la ausencia de garantía se mantienen alineados con
    el archivo LICENSE del repositorio (MIT); si allí cambia la licencia, hay
    que actualizar también esta línea.
    """
    return html.Footer(
        className="pie",
        children=[
            # El crédito es el enlace a la licencia: un clic lleva al LICENSE
            # del repositorio, así el pie no tiene que explicar los términos.
            html.A(
                "© 2026 José A. Soto — Universidad de Chile",
                href=URL_LICENCIA,
                target="_blank",
                rel="noopener noreferrer",
                title="Ver la licencia MIT en el repositorio",
                className="pie-credito",
            ),
            html.Span("· Uso educativo ·"),
            html.Span("Asistido por Claude (Anthropic)", className="pie-asistencia"),
        ],
    )


def _leyenda():
    """Leyenda de colores y del formato de etiqueta.

    Los colores salen de viz/cytoscape_style.py, el mismo módulo que pinta el
    grafo: así no pueden quedar desfasados al cambiar la paleta.
    """
    muestras = [
        html.Div(
            className="leyenda-item",
            children=[
                html.Span(
                    className="leyenda-punto",
                    style={"background": relleno, "borderColor": borde},
                ),
                html.Span(titulo, className="leyenda-nombre"),
                html.Span(f"· {detalle}", className="leyenda-detalle"),
            ],
        )
        for _, titulo, detalle, relleno, borde in ESTADOS_LEYENDA
    ]
    return html.Details(
        open=True,
        className="leyenda",
        children=[
            html.Summary("Leyenda"),
            html.Div(
                className="leyenda-contenido",
                children=[
                    html.Div(
                        className="leyenda-item leyenda-etiqueta",
                        children=[
                            html.Span(
                                className="muestra-etiqueta",
                                children=[
                                    html.Span("3", className="muestra-nombre"),
                                    html.Span("d=7", className="muestra-dist"),
                                ],
                            ),
                            html.Span("Etiqueta", className="leyenda-nombre"),
                            html.Span(
                                "· nombre del nodo arriba, distancia actual abajo "
                                "(∞ = aún no alcanzado)",
                                className="leyenda-detalle",
                            ),
                        ],
                    ),
                    *muestras,
                ],
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
                    html.Span("Velocidad", className="txt-ayuda"),
                    dcc.Input(
                        id="in-velocidad",
                        type="number",
                        min=VELOCIDAD_MINIMA,
                        max=VELOCIDAD_MAXIMA,
                        step=1,
                        value=VELOCIDAD_INICIAL,
                        debounce=True,
                        className="entrada-velocidad",
                    ),
                    html.Span("pasos/seg", className="txt-ayuda"),
                    html.Div(
                        className="atajos-velocidad",
                        children=[
                            html.Button(
                                str(v),
                                id={"type": "atajo-velocidad", "valor": v},
                                title=f"{v} pasos por segundo",
                                n_clicks=0,
                            )
                            for v in ATAJOS_VELOCIDAD
                        ],
                    ),
                ],
            ),
            html.Div(id="txt-paso", className="txt-estado"),
            # Solo se llena en algoritmos que trabajan por iteraciones sobre
            # todas las aristas (Bellman-Ford); en el resto queda vacío.
            html.Div(id="txt-iteracion", className="txt-iteracion"),
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
                    # Orden por frecuencia de uso, no por orden lógico: sobre una
                    # instancia ya dibujada uno elige y ejecuta algoritmos varias
                    # veces, y recién después genera otra instancia. Tener que
                    # bajar hasta el final del sidebar para lo más frecuente
                    # obligaba a hacer scroll en cada corrida.
                    children=[
                        _panel_algoritmo(),
                        _panel_layout(),
                        _panel_generar(),
                        _panel_ejemplos(),
                        _panel_archivo(),
                    ],
                ),
                # Los divisores los maneja assets/resize.js: arrastrar cambia
                # el ancho de la columna indicada en data-objetivo; doble clic
                # la devuelve al valor por omisión.
                html.Div(
                    className="divisor",
                    title="Arrastra para redimensionar · doble clic para restablecer",
                    **{"data-objetivo": "controles"},
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
                            # minHeight cumple dos papeles: es el alto mínimo
                            # del lienzo, y además destraba el encogido. Un
                            # elemento flex sin min-height explícito usa
                            # 'auto', que equivale al tamaño de su contenido:
                            # sin esto el lienzo no cedía altura en ventanas
                            # bajas y la leyenda terminaba desbordando la
                            # columna y pisando el pie de página.
                            style={
                                "width": "100%",
                                "flex": "1",
                                "minHeight": "240px",
                                "border": "1px solid #cfd8dc",
                            },
                        ),
                        _leyenda(),
                    ],
                ),
                html.Div(
                    className="divisor",
                    title="Arrastra para redimensionar · doble clic para restablecer",
                    **{"data-objetivo": "codigo"},
                ),
                html.Div(
                    className="columna-codigo",
                    children=[_panel_pseudocodigo()],
                ),
            ],
        ),
        _pie(),
        _modal_info(),
        dcc.Interval(id="interval", interval=200, disabled=True, n_intervals=0),
        dcc.Store(id="store-grafo"),
        dcc.Store(id="store-trace"),
        dcc.Store(id="store-resultado"),
        dcc.Store(id="store-algoritmo-ejecutado"),
        dcc.Store(id="store-paso", data=0),
        dcc.Store(id="store-reproduciendo", data=False),
        dcc.Store(id="store-breakpoints", data=[]),
    ],
)


# ---------------------------------------------------------------------------
# 1) Generar instancia aleatoria (también corre una vez al cargar la página)
# ---------------------------------------------------------------------------
@app.callback(
    Output("store-grafo", "data"),
    Output("store-trace", "data"),
    Output("store-paso", "data"),
    Output("txt-generar", "children"),
    Output("txt-generar", "className"),
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
    try:
        G = generar_aleatorio(
            n=_entero(n, 10),
            densidad=_decimal(densidad, 0.3),
            dirigido="dirigido" in flags,
            dag="dag" in flags,
            conexo="conexo" in flags,
            peso_min=_entero(peso_min, 1),
            peso_max=_entero(peso_max, 10),
            permitir_negativos="negativos" in flags,
            seed=None if seed in (None, "") else _entero(seed, 0),
        )
    except ValueError as exc:
        # Parámetros incoherentes (p. ej. peso mínimo > máximo): se avisa y se
        # conserva el grafo anterior en lugar de dejar la app sin instancia.
        return no_update, no_update, no_update, str(exc), "txt-error"
    return graph_to_dict(G), None, 0, "", "txt-estado"


# ---------------------------------------------------------------------------
# 2) Cargar una instancia de ejemplo (estructura conocida)
# ---------------------------------------------------------------------------
@app.callback(
    Output("store-grafo", "data", allow_duplicate=True),
    Output("store-trace", "data", allow_duplicate=True),
    Output("store-paso", "data", allow_duplicate=True),
    Output("dd-layout", "value"),
    Input("btn-ejemplo", "n_clicks"),
    State("dd-ejemplo", "value"),
    prevent_initial_call=True,
)
def cargar_ejemplo(n_clicks, clave):
    if not clave:
        raise PreventUpdate
    G = construir_ejemplo(clave)
    # Estas instancias traen coordenadas pensadas a mano (niveles del árbol,
    # filas de la rejilla...), así que se fuerza 'preset' para respetarlas.
    return graph_to_dict(G), None, 0, "preset"


@app.callback(
    Output("txt-ejemplo", "children"),
    Input("dd-ejemplo", "value"),
)
def describir_ejemplo(clave):
    if not clave:
        return ""
    return EJEMPLOS[clave]["descripcion"]


# ---------------------------------------------------------------------------
# 3) Cargar instancia desde archivo JSON
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
# 4) Guardar instancia actual a JSON (preserva posiciones de nodos)
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
# 5) Exportar la traza para analizarla fuera de la app
# ---------------------------------------------------------------------------
@app.callback(
    Output("download-traza", "data"),
    Output("txt-traza", "children"),
    Input("btn-traza-json", "n_clicks"),
    Input("btn-traza-csv", "n_clicks"),
    State("store-trace", "data"),
    State("store-algoritmo-ejecutado", "data"),
    prevent_initial_call=True,
)
def exportar_traza(n_json, n_csv, trace, alg_id):
    if not trace:
        return no_update, "No hay traza: ejecuta un algoritmo primero."
    nombre = alg_id or "traza"
    if ctx.triggered_id == "btn-traza-json":
        return (
            dcc.send_string(json.dumps(trace, indent=2, ensure_ascii=False), f"{nombre}.json"),
            f"Exportados {len(trace)} pasos en JSON.",
        )

    # CSV: la traza es heterogénea (cada tipo de evento trae campos distintos),
    # así que se toma la unión de todas las claves como encabezado.
    claves = []
    for ev in trace:
        for k in ev:
            if k not in claves:
                claves.append(k)
    buffer = io.StringIO()
    escritor = csv.DictWriter(buffer, fieldnames=claves, extrasaction="ignore")
    escritor.writeheader()
    for ev in trace:
        escritor.writerow({k: ev.get(k, "") for k in claves})
    return (
        dcc.send_string(buffer.getvalue(), f"{nombre}.csv"),
        f"Exportados {len(trace)} pasos en CSV.",
    )


# ---------------------------------------------------------------------------
# 6) Opciones de algoritmo/origen según el grafo actual
# ---------------------------------------------------------------------------
@app.callback(
    Output("dd-algoritmo", "options"),
    Output("dd-algoritmo", "value"),
    Output("dd-origen", "options"),
    Output("dd-origen", "value"),
    Output("lista-no-disponibles", "children"),
    Input("store-grafo", "data"),
    State("dd-algoritmo", "value"),
)
def actualizar_opciones(data, alg_actual):
    if not data:
        raise PreventUpdate
    G = graph_from_dict(data)
    estado = estado_algoritmos(G)

    disponibles = [e for e in estado if e["disponible"]]
    opciones_alg = [{"label": e["nombre"], "value": e["id"]} for e in disponibles]
    # Conserva el algoritmo elegido si el grafo nuevo también lo admite:
    # antes cualquier cambio de instancia devolvía la selección al primero.
    ids_disponibles = {e["id"] for e in disponibles}
    if alg_actual in ids_disponibles:
        valor_alg = alg_actual
    else:
        valor_alg = opciones_alg[0]["value"] if opciones_alg else None

    nodos = sorted(G.nodes, key=lambda x: (len(x), x))
    opciones_nodo = [{"label": n, "value": n} for n in nodos]
    valor_nodo = _origen_por_omision(G, nodos)

    no_disponibles = [e for e in estado if not e["disponible"]]
    if no_disponibles:
        hijos = [html.Div("No aplican a este grafo:")]
        hijos += [
            html.Div(
                className="item-no-disponible",
                children=[
                    html.Span(e["nombre"], className="nombre-no-disponible"),
                    html.Span(f" — {e['motivo']}"),
                ],
            )
            for e in no_disponibles
        ]
    else:
        hijos = []
    return opciones_alg, valor_alg, opciones_nodo, valor_nodo, hijos


# ---------------------------------------------------------------------------
# 7) Clic en un nodo del grafo -> pasa a ser el origen
# ---------------------------------------------------------------------------
@app.callback(
    Output("dd-origen", "value", allow_duplicate=True),
    Input("cyto", "tapNodeData"),
    prevent_initial_call=True,
)
def origen_por_clic(datos_nodo):
    if not datos_nodo:
        raise PreventUpdate
    return datos_nodo["id"]


# ---------------------------------------------------------------------------
# 8) Ejecutar algoritmo seleccionado -> genera la traza completa
# ---------------------------------------------------------------------------
@app.callback(
    Output("store-trace", "data", allow_duplicate=True),
    Output("store-resultado", "data"),
    Output("store-algoritmo-ejecutado", "data"),
    Output("store-paso", "data", allow_duplicate=True),
    Output("txt-resultado", "children"),
    Output("txt-resultado", "className"),
    # Ejecutar arranca la reproducción sola: pedir el algoritmo y además tener
    # que apretar ▶ era un paso de más, porque lo que se quiere ver al ejecutar
    # es justamente la animación.
    Output("store-reproduciendo", "data", allow_duplicate=True),
    Output("interval", "disabled", allow_duplicate=True),
    Output("btn-play", "children", allow_duplicate=True),
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
    # En los caminos de error no se toca la reproducción: si había una
    # animación corriendo de una ejecución anterior, se queda como estaba.
    sin_tocar_reproduccion = (no_update, no_update, no_update)
    try:
        resultado, trace = info["funcion"](G, origen)
    except ValueError as exc:
        # Restricción conocida del algoritmo (p. ej. pesos negativos).
        return (
            no_update, no_update, no_update, no_update,
            f"Error: {exc}", "txt-error", *sin_tocar_reproduccion,
        )
    except Exception as exc:  # noqa: BLE001
        # Cualquier otra falla: mostrarla en la UI en vez de dejar que Dash
        # aborte el callback y la app quede aparentemente colgada.
        return (
            no_update, no_update, no_update, no_update,
            f"Falla inesperada en {info['nombre']}: {type(exc).__name__}: {exc}",
            "txt-error", *sin_tocar_reproduccion,
        )
    # Una traza de un solo paso no tiene nada que animar: se deja pausada para
    # no encender el temporizador y apagarlo en el tic siguiente.
    reproducir = len(trace) > 1
    return (
        trace,
        resultado,
        alg_id,
        0,
        f"{info['nombre']} desde {origen} — {len(trace)} pasos de traza.",
        "txt-estado",
        reproducir,
        not reproducir,
        "⏸" if reproducir else "▶",
    )


# ---------------------------------------------------------------------------
# 9) Play / Pausa
# ---------------------------------------------------------------------------
@app.callback(
    Output("store-reproduciendo", "data"),
    Output("interval", "disabled"),
    Output("btn-play", "children"),
    Output("store-paso", "data", allow_duplicate=True),
    Input("btn-play", "n_clicks"),
    State("store-reproduciendo", "data"),
    State("store-trace", "data"),
    State("store-paso", "data"),
    prevent_initial_call=True,
)
def alternar_play(n_clicks, reproduciendo, trace, paso):
    if not trace:
        raise PreventUpdate
    nuevo = not reproduciendo
    # Dar play con la traza terminada antes no hacía nada visible: el primer
    # tick detectaba el final y volvía a pausar. Ahora reinicia solo.
    if nuevo and (paso or 0) >= len(trace) - 1:
        return nuevo, not nuevo, "⏸", 0
    return nuevo, not nuevo, ("⏸" if nuevo else "▶"), no_update


# ---------------------------------------------------------------------------
# 10) Cada tick del Interval avanza un paso (controla la velocidad)
# ---------------------------------------------------------------------------
@app.callback(
    Output("store-paso", "data", allow_duplicate=True),
    Output("store-reproduciendo", "data", allow_duplicate=True),
    Output("interval", "disabled", allow_duplicate=True),
    Output("btn-play", "children", allow_duplicate=True),
    Input("interval", "n_intervals"),
    State("store-paso", "data"),
    State("store-trace", "data"),
    State("store-breakpoints", "data"),
    prevent_initial_call=True,
)
def avanzar_automatico(n_intervals, paso, trace, breakpoints):
    if not trace:
        raise PreventUpdate
    paso = (paso or 0) + 1
    if paso >= len(trace) - 1:
        return len(trace) - 1, False, True, "▶"
    # Punto de interrupción: pausa al llegar a una línea marcada, dejando el
    # paso visible para poder inspeccionar el estado del grafo en ese momento.
    if breakpoints and trace[paso].get("linea") in breakpoints:
        return paso, False, True, "▶"
    return paso, no_update, no_update, no_update


@app.callback(
    Output("interval", "interval"),
    Input("in-velocidad", "value"),
)
def cambiar_velocidad(pasos_por_segundo):
    # El campo son pasos por segundo; dcc.Interval espera un intervalo en
    # milisegundos, así que se invierte. El tope inferior de 16 ms evita pedir
    # un ritmo que el navegador no puede sostener (~60 cuadros por segundo).
    pps = _velocidad_valida(pasos_por_segundo)
    return max(16, round(1000 / pps))


@app.callback(
    Output("in-velocidad", "value"),
    Input({"type": "atajo-velocidad", "valor": ALL}, "n_clicks"),
    prevent_initial_call=True,
)
def atajo_velocidad(clicks):
    """Botones de velocidad rápida: solo escriben en el campo numérico.

    Al no guardar estado propio, no pueden quedar desincronizados con lo que
    el usuario escriba a mano, que es lo que sí pasaría con un deslizador.
    """
    disparador = ctx.triggered_id
    if not isinstance(disparador, dict):
        raise PreventUpdate
    # Al montarse los botones llegan con n_clicks en 0: no es un clic real.
    if not ctx.triggered or not ctx.triggered[0]["value"]:
        raise PreventUpdate
    return disparador["valor"]


# ---------------------------------------------------------------------------
# 11) Controles manuales de paso
# ---------------------------------------------------------------------------
@app.callback(
    Output("store-paso", "data", allow_duplicate=True),
    Output("store-reproduciendo", "data", allow_duplicate=True),
    Output("interval", "disabled", allow_duplicate=True),
    Output("btn-play", "children", allow_duplicate=True),
    Input("btn-siguiente", "n_clicks"),
    Input("btn-anterior", "n_clicks"),
    Input("btn-reiniciar", "n_clicks"),
    State("store-paso", "data"),
    State("store-trace", "data"),
    State("store-reproduciendo", "data"),
    prevent_initial_call=True,
)
def controles_paso(n_sig, n_ant, n_rei, paso, trace, reproduciendo):
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

    # Tocar un control manual mientras corre la reproducción automática hacía
    # que el Interval siguiera avanzando y "peleara" con el paso elegido a
    # mano. Cualquier control manual pausa.
    if reproduciendo:
        return paso, False, True, "▶"
    return paso, no_update, no_update, no_update


# ---------------------------------------------------------------------------
# 12) Render de Cytoscape: un único callback para 'elements' y 'layout'.
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
    Output("txt-iteracion", "children"),
    Input("store-grafo", "data"),
    Input("store-trace", "data"),
    Input("store-paso", "data"),
    Input("dd-layout", "value"),
    Input("btn-centrar", "n_clicks"),
    # 'dd-origen' es Input y no State: como State, cambiar el nodo origen no
    # disparaba el redibujado y el resaltado del origen se quedaba en el nodo
    # anterior hasta que algo más provocara un render.
    Input("dd-origen", "value"),
)
def render_cyto(data, trace, paso, layout_name, n_clicks_centrar, origen):
    if not data:
        raise PreventUpdate
    G = graph_from_dict(data)
    # Solo 'preset' quiere las coordenadas guardadas; ver graph_to_elements().
    elementos = graph_to_elements(G, incluir_posiciones=(layout_name == "preset"))
    dirigido = G.is_directed()

    texto_paso = "Sin traza — ejecuta un algoritmo."
    texto_iter = ""
    if trace:
        paso = max(0, min(paso or 0, len(trace) - 1))
        clases_nodo, clases_arista = calcular_estado(trace, paso, dirigido)
        elementos = aplicar_clases(elementos, clases_nodo, clases_arista, origen)
        # Etiqueta secundaria con la distancia: devuelve None en algoritmos que
        # no calculan ninguna (DFS), y ahí los nodos quedan con su etiqueta sola.
        distancias = calcular_distancias(trace, paso)
        if distancias is not None:
            elementos = aplicar_distancias(elementos, distancias)
        ev = trace[paso]
        texto_paso = f"Paso {paso + 1}/{len(trace)} — {ev['tipo']}"
        texto_iter = texto_iteracion(calcular_iteracion(trace, paso))
    else:
        elementos = aplicar_clases(elementos, {}, {}, origen)

    disparador = ctx.triggered_id
    if disparador in ("store-grafo", "dd-layout", "btn-centrar", None):
        # "_nonce" no es una opción real del layout de Cytoscape (se ignora);
        # está solo para que el diccionario cambie SIEMPRE. Si no, cuando el
        # layout elegido es el mismo que el de la vez anterior (p. ej. sigue
        # en "circle" tras generar un grafo nuevo), el prop le llega idéntico
        # a dash-cytoscape, no detecta cambio, y no vuelve a ejecutar el
        # algoritmo — quedan las posiciones internas (spring layout) en vez
        # de las del layout elegido.
        nuevo_layout = {
            "name": layout_name or "circle",
            "fit": True,
            "padding": 30,
            "animate": False,
            "_nonce": time.time(),
        }
    else:
        nuevo_layout = no_update

    return elementos, nuevo_layout, texto_paso, texto_iter


# ---------------------------------------------------------------------------
# 13) Popup de instrucciones: qué hace el algoritmo elegido, restricciones
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
# 14) Panel de pseudocódigo.
#
#     Las líneas se construyen SOLO cuando cambia el algoritmo, no en cada
#     paso: si se reconstruyeran a cada paso, el n_clicks de cada línea se
#     reiniciaría y los puntos de interrupción (que dependen de detectar el
#     clic) se dispararían solos. El resaltado del paso actual lo hace un
#     callback de cliente más abajo, que solo cambia className.
# ---------------------------------------------------------------------------
@app.callback(
    Output("pseudocodigo-titulo", "children"),
    Output("pseudocodigo-complejidad", "children"),
    Output("pseudocodigo-lineas", "children"),
    Output("store-breakpoints", "data"),
    Input("dd-algoritmo", "value"),
)
def render_pseudocodigo(alg_id):
    if not alg_id or alg_id not in ALGORITMOS:
        raise PreventUpdate
    info = ALGORITMOS[alg_id]
    lineas = info.get("pseudocodigo", [])
    insignia = html.Span(info.get("complejidad", ""), className="insignia-complejidad")

    hijos = [
        html.Div(
            [html.Span(f"{i:>2}", className="num-linea"), " ", texto],
            id={"type": "linea-codigo", "index": i},
            className="linea-codigo",
            n_clicks=0,
        )
        for i, texto in enumerate(lineas, start=1)
    ]
    # Los puntos de interrupción son por algoritmo: al cambiar, se limpian.
    return f"Pseudocódigo — {info['nombre']}", insignia, hijos, []


# ---------------------------------------------------------------------------
# 15) Alternar punto de interrupción al hacer clic en una línea
# ---------------------------------------------------------------------------
@app.callback(
    Output("store-breakpoints", "data", allow_duplicate=True),
    Input({"type": "linea-codigo", "index": ALL}, "n_clicks"),
    State("store-breakpoints", "data"),
    prevent_initial_call=True,
)
def alternar_breakpoint(clicks, breakpoints):
    disparador = ctx.triggered_id
    if not isinstance(disparador, dict):
        raise PreventUpdate
    # Al recrearse las líneas (cambio de algoritmo) Dash dispara este callback
    # con n_clicks en 0/None: eso no es un clic real del usuario.
    if not ctx.triggered or not ctx.triggered[0]["value"]:
        raise PreventUpdate
    linea = disparador["index"]
    actuales = list(breakpoints or [])
    if linea in actuales:
        actuales.remove(linea)
    else:
        actuales.append(linea)
    return sorted(actuales)


# ---------------------------------------------------------------------------
# 16) Resaltado en vivo del pseudocódigo (en el navegador).
#
#     Va del lado del cliente porque se dispara en cada paso de la
#     reproducción: a 60 pasos/seg, un viaje al servidor por paso solo para
#     mover un fondo amarillo hace que la animación se atrase respecto del
#     grafo. Acá solo reescribe className, sin recrear los nodos del DOM.
# ---------------------------------------------------------------------------
app.clientside_callback(
    """
    function (paso, trace, breakpoints, algEjecutado, algActual) {
        var ctx = window.dash_clientside.callback_context;
        var salidas = (ctx && ctx.outputs_list) || [];
        var puntos = breakpoints || [];

        var lineaActiva = null;
        // Solo se resalta si la traza vigente es de ESTE algoritmo: si se
        // cambia el desplegable sin volver a ejecutar, el código mostrado no
        // se corresponde con los pasos guardados.
        if (trace && trace.length && algActual === algEjecutado) {
            var p = Math.max(0, Math.min(paso || 0, trace.length - 1));
            lineaActiva = trace[p].linea;
        }

        return salidas.map(function (salida) {
            var i = salida.id.index;
            var clases = "linea-codigo";
            if (puntos.indexOf(i) !== -1) clases += " linea-breakpoint";
            if (i === lineaActiva) clases += " linea-activa";
            return clases;
        });
    }
    """,
    Output({"type": "linea-codigo", "index": ALL}, "className"),
    Input("store-paso", "data"),
    Input("store-trace", "data"),
    Input("store-breakpoints", "data"),
    State("store-algoritmo-ejecutado", "data"),
    State("dd-algoritmo", "value"),
)


if __name__ == "__main__":
    # dev_tools_ui controla la barra inferior de Dash (Plotly Cloud / Errors /
    # Callbacks). Se deja encendida por omisión porque las pestañas de errores
    # y callbacks sirven al desarrollar; la de "Plotly Cloud" es publicidad de
    # su hosting y no hay forma de ocultar solo esa.
    #   DASH_TOOLBAR=0  -> esconde la barra, conservando la recarga en caliente
    #   DASH_DEBUG=0    -> apaga también la recarga en caliente
    depurar = os.environ.get("DASH_DEBUG", "1") != "0"
    app.run(
        debug=depurar,
        dev_tools_ui=os.environ.get("DASH_TOOLBAR", "1") != "0",
    )
