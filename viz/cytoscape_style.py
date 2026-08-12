"""Hoja de estilos de Cytoscape: un selector por clase de estado.
Cambiar look-and-feel se hace solo acá, sin tocar la lógica."""

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
        # Grafo no dirigido: sin punta de flecha.
        "selector": "edge.no_dirigido",
        "style": {"target-arrow-shape": "none", "source-arrow-shape": "none"},
    },
    # --- Nodo: estados persistentes ---
    {
        "selector": "node.visitado",
        "style": {"background-color": "#90caf9", "border-color": "#42a5f5"},
    },
    {
        "selector": "node.finalizado",
        "style": {"background-color": "#5c6bc0", "border-color": "#3949ab", "color": "#ffffff"},
    },
    {
        "selector": "node.solucion",
        "style": {"background-color": "#66bb6a", "border-color": "#2e7d32", "color": "#ffffff"},
    },
    {
        "selector": "node.ciclo_negativo",
        "style": {"background-color": "#ef5350", "border-color": "#b71c1c", "color": "#ffffff"},
    },
    {
        "selector": "node.origen",
        "style": {"border-width": "4px", "border-color": "#f57f17", "border-style": "double"},
    },
    # --- Nodo: transitorio (se dibuja encima de lo anterior) ---
    {
        "selector": "node.activo",
        "style": {
            "background-color": "#ffb74d",
            "border-color": "#e65100",
            "border-width": "4px",
        },
    },
    # --- Arista: estados persistentes ---
    {
        "selector": "edge.solucion",
        "style": {
            "line-color": "#2e7d32",
            "target-arrow-color": "#2e7d32",
            "width": 4,
        },
    },
    # --- Arista: transitorio ---
    {
        "selector": "edge.activo",
        "style": {
            "line-color": "#e65100",
            "target-arrow-color": "#e65100",
            "width": 4,
        },
    },
]
