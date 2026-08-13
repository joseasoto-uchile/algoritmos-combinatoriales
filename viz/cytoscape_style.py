"""Hoja de estilos de Cytoscape, con un selector por clase de estado.

Es el único archivo que define la apariencia. La lógica no depende de él.

Los colores están en COLORES y la leyenda de la interfaz se construye a partir
de ESTADOS_LEYENDA, de modo que un cambio de color se refleja en la leyenda.
"""

COLORES = {
    "base": "#b0bec5",
    "base_borde": "#78909c",
    "visitado": "#90caf9",
    "visitado_borde": "#42a5f5",
    "finalizado": "#5c6bc0",
    "finalizado_borde": "#3949ab",
    "solucion": "#66bb6a",
    "solucion_borde": "#2e7d32",
    "ciclo_negativo": "#ef5350",
    "ciclo_negativo_borde": "#b71c1c",
    "activo": "#ffb74d",
    "activo_borde": "#e65100",
    "origen_borde": "#f57f17",
}

# Formato: (clave, título, descripción, color de relleno, color de borde)
ESTADOS_LEYENDA = [
    ("base", "Sin visitar", "Todavía no alcanzado", COLORES["base"], COLORES["base_borde"]),
    ("origen", "Origen", "Nodo de partida elegido", COLORES["base"], COLORES["origen_borde"]),
    ("visitado", "Visitado", "Descubierto, aún puede mejorar", COLORES["visitado"], COLORES["visitado_borde"]),
    ("finalizado", "Finalizado", "Procesado por completo", COLORES["finalizado"], COLORES["finalizado_borde"]),
    ("activo", "Activo", "Lo que ocurre en este paso", COLORES["activo"], COLORES["activo_borde"]),
    ("solucion", "Solución", "Parte del árbol de caminos", COLORES["solucion"], COLORES["solucion_borde"]),
    ("ciclo_negativo", "Ciclo negativo", "Sin distancia mínima definida", COLORES["ciclo_negativo"], COLORES["ciclo_negativo_borde"]),
]

STYLESHEET = [
    {
        "selector": "node",
        "style": {
            "content": "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "background-color": "#b0bec5",
            "color": "#1a1a1a",
            "font-size": "12px",
            "width": "34px",
            "height": "34px",
            "border-width": "2px",
            "border-color": "#78909c",
        },
    },
    {
        "selector": "edge",
        "style": {
            "content": "data(label)",
            "curve-style": "bezier",
            "line-color": "#b0bec5",
            "target-arrow-color": "#b0bec5",
            "target-arrow-shape": "triangle",
            "width": 2,
            "font-size": "10px",
            "color": "#546e7a",
            "text-background-color": "#ffffff",
            "text-background-opacity": 1,
            "text-background-padding": "1px",
        },
    },
    {
        # Grafo no dirigido: las aristas no llevan punta de flecha.
        "selector": "edge.no_dirigido",
        "style": {"target-arrow-shape": "none", "source-arrow-shape": "none"},
    },
    # --- Nodo: estados persistentes ---
    {
        "selector": "node.visitado",
        "style": {
            "background-color": COLORES["visitado"],
            "border-color": COLORES["visitado_borde"],
        },
    },
    {
        "selector": "node.finalizado",
        "style": {
            "background-color": COLORES["finalizado"],
            "border-color": COLORES["finalizado_borde"],
            "color": "#ffffff",
        },
    },
    {
        "selector": "node.solucion",
        "style": {
            "background-color": COLORES["solucion"],
            "border-color": COLORES["solucion_borde"],
            "color": "#ffffff",
        },
    },
    {
        "selector": "node.ciclo_negativo",
        "style": {
            "background-color": COLORES["ciclo_negativo"],
            "border-color": COLORES["ciclo_negativo_borde"],
            "color": "#ffffff",
        },
    },
    {
        "selector": "node.origen",
        "style": {
            "border-width": "4px",
            "border-color": COLORES["origen_borde"],
            "border-style": "double",
        },
    },
    # --- Nodo: transitorio (se dibuja encima de lo anterior) ---
    {
        "selector": "node.activo",
        "style": {
            "background-color": COLORES["activo"],
            "border-color": COLORES["activo_borde"],
            "border-width": "4px",
        },
    },
    # --- Arista: estados persistentes ---
    {
        "selector": "edge.solucion",
        "style": {
            "line-color": COLORES["solucion_borde"],
            "target-arrow-color": COLORES["solucion_borde"],
            "width": 4,
        },
    },
    # --- Arista: transitorio ---
    {
        "selector": "edge.activo",
        "style": {
            "line-color": COLORES["activo_borde"],
            "target-arrow-color": COLORES["activo_borde"],
            "width": 4,
        },
    },
    # --- Etiqueta con la distancia calculada hasta el paso actual ---
    #
    # Cytoscape.js admite una sola etiqueta por elemento. El nombre del nodo y
    # la distancia son los dos renglones de un mismo texto, situado bajo el
    # nodo, y comparten color: no hay propiedad para asignar color por renglón.
    #
    # Esta regla debe declararse después de las de estado, que fijan texto
    # blanco para los nodos oscuros. Aquí el texto va sobre el fondo del
    # lienzo.
    {
        "selector": "node.con_distancia",
        "style": {
            "text-wrap": "wrap",
            "line-height": 1.15,
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": "4px",
            "font-size": "11px",
            "color": "#263238",
            "text-background-color": "#ffffff",
            "text-background-opacity": 0.85,
            "text-background-padding": "2px",
            "text-background-shape": "roundrectangle",
        },
    },
]
