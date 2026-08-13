"""Verifica que la versión JavaScript produzca las MISMAS trazas que Python.

El repositorio mantiene dos implementaciones a propósito (ver README): la de
Dash para desarrollar en Python y la estática de docs/ para publicar. Eso solo
es sostenible si algo comprueba que no se separen, porque el primer cambio
hecho en una sola las desincroniza sin que nadie se entere.

Uso:

    python herramientas/verificar_paridad.py

Devuelve código de salida 0 si todas las trazas coinciden, 1 si alguna difiere.
Requiere Node.js en el PATH.

Los grafos aleatorios se generan en Python y se le PASAN a JavaScript
serializados, en vez de generarlos a ambos lados: los generadores de números
aleatorios de los dos lenguajes son distintos y con la misma semilla darían
instancias distintas, así que no se podría comparar nada.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from algorithms.registry import ALGORITMOS, estado_algoritmos  # noqa: E402
from graph_model.ejemplos import EJEMPLOS, construir_ejemplo  # noqa: E402
from graph_model.model import generar_aleatorio, graph_from_dict, graph_to_dict  # noqa: E402

# Instancias aleatorias que cubren las combinaciones que cambian qué algoritmos
# aplican: dirigido/no dirigido, con y sin pesos negativos, y DAG.
CASOS_ALEATORIOS = [
    ("dirigido_simple", dict(n=12, densidad=0.3, dirigido=True, conexo=True, seed=1)),
    ("no_dirigido", dict(n=12, densidad=0.35, dirigido=False, conexo=True, seed=2)),
    ("con_negativos", dict(n=10, densidad=0.3, dirigido=True, conexo=True,
                           permitir_negativos=True, seed=3)),
    ("dag_aleatorio", dict(n=12, densidad=0.3, dirigido=True, dag=True, conexo=True, seed=4)),
    ("denso", dict(n=15, densidad=0.6, dirigido=True, conexo=True, seed=5)),
    ("pesos_grandes", dict(n=10, densidad=0.4, dirigido=True, conexo=True,
                           peso_min=100, peso_max=999, seed=6)),
]


def _origen(G):
    """Mismo criterio que usa la interfaz para preseleccionar el origen."""
    nodos = sorted(G.nodes, key=lambda x: (len(x), x))
    if G.is_directed():
        return max(nodos, key=lambda n: G.out_degree(n))
    con_aristas = [n for n in nodos if G.degree(n) > 0]
    return con_aristas[0] if con_aristas else nodos[0]


def _saneable(valor):
    """Reemplaza los infinitos por una cadena antes de serializar.

    json.dump escribe `Infinity` para float('inf'), que NO es JSON válido:
    JSON.parse de JavaScript lo rechaza. Aparece en el evento 'fin', dentro de
    las distancias de los nodos inalcanzables. Ese campo queda fuera de la
    comparación de todos modos, pero tiene que poder viajar.
    """
    if isinstance(valor, float):
        if valor == float("inf"):
            return "Infinity"
        if valor == float("-inf"):
            return "-Infinity"
        if valor != valor:  # NaN
            return "NaN"
        return valor
    if isinstance(valor, dict):
        return {k: _saneable(v) for k, v in valor.items()}
    if isinstance(valor, (list, tuple)):
        return [_saneable(v) for v in valor]
    if isinstance(valor, set):
        return [_saneable(v) for v in sorted(valor, key=str)]
    return valor


# Archivos malformados: se comprueba que AMBAS versiones los rechacen con el
# mismo mensaje. Es lo que faltaba: comparar solo instancias bien formadas dejó
# pasar que cada versión "reparaba" los archivos rotos a su manera.
CASOS_INVALIDOS = [
    ("peso no numerico", {"dirigido": True, "nodos": [{"id": "0"}, {"id": "1"}],
                          "aristas": [{"origen": "0", "destino": "1", "weight": "diez"}]}),
    ("peso ausente", {"dirigido": True, "nodos": [{"id": "0"}, {"id": "1"}],
                      "aristas": [{"origen": "0", "destino": "1"}]}),
    ("nodo no declarado", {"dirigido": True, "nodos": [{"id": "0"}],
                           "aristas": [{"origen": "0", "destino": "99", "weight": 1}]}),
    ("arista repetida", {"dirigido": True, "nodos": [{"id": "0"}, {"id": "1"}],
                         "aristas": [{"origen": "0", "destino": "1", "weight": 1},
                                     {"origen": "0", "destino": "1", "weight": 5}]}),
    ("repetida no dirigida", {"dirigido": False, "nodos": [{"id": "0"}, {"id": "1"}],
                              "aristas": [{"origen": "0", "destino": "1", "weight": 1},
                                          {"origen": "1", "destino": "0", "weight": 2}]}),
    ("nodo duplicado", {"dirigido": True, "nodos": [{"id": "0"}, {"id": "0"}], "aristas": []}),
    ("id vacio", {"dirigido": True, "nodos": [{"id": ""}], "aristas": []}),
    ("choque de id", {"dirigido": True, "nodos": [{"id": "0"}, {"id": "1"}, {"id": "0__1"}],
                      "aristas": [{"origen": "0", "destino": "1", "weight": 1}]}),
    ("falta clave nodos", {"dirigido": True, "aristas": []}),
    ("nodos no es lista", {"dirigido": True, "nodos": {"id": "0"}, "aristas": []}),
    ("no es objeto", [1, 2, 3]),
    ("arista sin origen", {"dirigido": True, "nodos": [{"id": "0"}],
                           "aristas": [{"destino": "0", "weight": 1}]}),
    # El XSS que motivó todo esto: el identificador con marcado tiene que
    # comportarse igual en las dos versiones (aceptado como texto literal).
    ("id con marcado", {"dirigido": True,
                        "nodos": [{"id": '"><img src=x onerror="alert(1)">'}, {"id": "1"}],
                        "aristas": [{"origen": '"><img src=x onerror="alert(1)">',
                                     "destino": "1", "weight": 1}]}),
]


def construir_casos_invalidos() -> list[dict]:
    """Ejecuta la validación de Python y anota su veredicto para comparar."""
    casos = []
    for nombre, datos in CASOS_INVALIDOS:
        try:
            graph_from_dict(datos)
            mensaje = None
        except ValueError as exc:
            mensaje = str(exc)
        casos.append({"nombre": nombre, "datos": datos, "mensajePython": mensaje})
    return casos


def construir_referencia() -> dict:
    referencia = {}
    instancias = [(k, construir_ejemplo(k)) for k in EJEMPLOS]
    instancias += [(nombre, generar_aleatorio(**kw)) for nombre, kw in CASOS_ALEATORIOS]

    for nombre, G0 in instancias:
        datos = graph_to_dict(G0)
        # Round-trip por el diccionario antes de ejecutar: es lo que hace la
        # app Dash en cada callback, y es lo único comparable contra la versión
        # JS, que parte de ese mismo diccionario. Sin esto, el orden de la
        # lista de adyacencia difiere y las trazas divergen sin que haya error.
        G = graph_from_dict(datos)
        origen = _origen(G)
        trazas = {}
        for est in estado_algoritmos(G):
            if not est["disponible"]:
                continue
            _, traza = ALGORITMOS[est["id"]]["funcion"](G, origen)
            trazas[est["id"]] = _saneable(traza)
        referencia[nombre] = {"grafo": datos, "origen": origen, "trazas": trazas}
    return referencia


def main() -> int:
    if shutil.which("node") is None:
        print("Falta Node.js en el PATH: es lo que ejecuta la versión JavaScript.")
        return 2

    referencia = construir_referencia()
    total = sum(len(v["trazas"]) for v in referencia.values())
    print(f"Instancias: {len(referencia)}  ·  trazas a comparar: {total}")
    # Clave aparte para que el comparador la separe de las instancias normales.
    referencia["__invalidos__"] = construir_casos_invalidos()

    # Los archivos de docs/js/ son scripts sueltos, sin exports: se concatenan
    # en uno solo para que las declaraciones de nivel superior (class, const)
    # queden en el mismo ámbito que el comparador.
    partes = [
        os.path.join(RAIZ, "docs", "js", "grafo.js"),
        os.path.join(RAIZ, "docs", "js", "algoritmos.js"),
        os.path.join(RAIZ, "herramientas", "comparar.js"),
    ]
    fuente = "\n".join(open(p, encoding="utf-8").read() for p in partes)

    temporal = tempfile.mkdtemp(prefix="paridad-")
    try:
        ruta_js = os.path.join(temporal, "verificacion.js")
        ruta_ref = os.path.join(temporal, "referencia.json")
        with open(ruta_js, "w", encoding="utf-8") as f:
            f.write(fuente)
        with open(ruta_ref, "w", encoding="utf-8") as f:
            json.dump(referencia, f, ensure_ascii=False)
        proceso = subprocess.run(
            ["node", ruta_js, ruta_ref], capture_output=True, text=True, encoding="utf-8"
        )
        if proceso.stdout:
            print(proceso.stdout, end="")
        if proceso.stderr:
            print(proceso.stderr, end="", file=sys.stderr)
        return proceso.returncode
    finally:
        shutil.rmtree(temporal, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
