"""Utilidad compartida para que cada algoritmo emita su traza de eventos.

La traza es la pieza clave de la arquitectura: separa el *cómputo* del
algoritmo de su *animación*. Cada algoritmo produce una lista de eventos
como:

    {"tipo": "relajar", "u": "A", "v": "B", "nueva_dist": 7, "paso": 4}

y la capa de visualización (viz/elements.py) es la única que sabe cómo
traducir esos eventos en estilos de nodos/aristas. Así se puede agregar
un algoritmo nuevo sin tocar la capa visual.
"""
from __future__ import annotations


class TraceBuilder:
    def __init__(self):
        self.trace: list[dict] = []
        self._paso = 0

    def emit(self, tipo: str, **kwargs) -> dict:
        self._paso += 1
        evento = {"tipo": tipo, "paso": self._paso}
        evento.update(kwargs)
        self.trace.append(evento)
        return evento
