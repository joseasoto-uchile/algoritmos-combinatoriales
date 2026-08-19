"""Utilidad compartida para que cada algoritmo emita su traza de eventos.

La traza separa el cómputo del algoritmo de su animación. Cada algoritmo
produce una lista de eventos:

    {"tipo": "relajar", "u": "A", "v": "B", "nueva_dist": 7, "paso": 4}

viz/elements.py es la única capa que traduce esos eventos en estilos de nodos y
aristas, de modo que un algoritmo nuevo no requiere cambios en ella.
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
