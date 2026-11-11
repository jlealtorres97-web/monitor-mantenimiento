"""Construye un dashboard estático a partir de una base SQLite de demostración."""

from datetime import date, timedelta
import json
from pathlib import Path
from random import Random
import sqlite3

from monitor import SCHEMA

ROOT = Path(__file__).resolve().parent
REFERENCE = date(2026, 11, 1)
FLEETS = (
    ("CA", "Camiones de acarreo", 9),
    ("EX", "Excavadoras", 7),
    ("TR", "Tractores de oruga", 8),
    ("CG", "Cargadores frontales", 6),
)


def seed(db):
    db.executescript("""
        PRAGMA foreign_keys = ON;
        CREATE TABLE equipos (
            id TEXT PRIMARY KEY, flota TEXT NOT NULL, horas INTEGER NOT NULL,
            proximo_servicio INTEGER NOT NULL
        );
        CREATE TABLE ordenes (
            id TEXT PRIMARY KEY, equipo TEXT NOT NULL REFERENCES equipos(id),
            fecha TEXT NOT NULL, clase TEXT NOT NULL, prioridad TEXT NOT NULL,
            estado TEXT NOT NULL, actividad TEXT NOT NULL
        );
    """)
    db.execute(SCHEMA)
    rng = Random(17)
    activities = {
        "Preventivo": ("Cambio de filtros", "Lubricación general", "Servicio de 500 h"),
        "Correctivo": ("Reemplazo de manguera", "Ajuste de suspensión", "Reparación de sello"),
        "Predictivo": ("Muestreo de aceite", "Inspección estructural", "Análisis de vibración"),
    }
    with db:
        for prefix, fleet, count in FLEETS:
            for number in range(1, count + 1):
                equipment = f"{prefix}-{number:02}"
                hours = rng.randint(2200, 13500)
                due = hours + rng.randint(-160, 480)
                db.execute("INSERT INTO equipos VALUES (?, ?, ?, ?)", (equipment, fleet, hours, due))
                base = rng.uniform(0.3, 9.4)
                rate = rng.uniform(-0.38, 1.25)
                for index in range(6):
                    day = REFERENCE - timedelta(days=(5 - index) * 14)
                    value = round(max(0, base + rate * index + rng.uniform(-0.35, 0.35)), 2)
                    db.execute("INSERT INTO inspecciones VALUES (?, ?, ?)", (equipment, day.isoformat(), value))
                for index in range(1, rng.randint(3, 5)):
                    kind = rng.choice(tuple(activities))
                    state = rng.choices(("Abierta", "En ejecución", "Cerrada"), (2, 2, 5))[0]
                    day = REFERENCE - timedelta(days=rng.randint(0, 75))
                    db.execute("INSERT INTO ordenes VALUES (?, ?, ?, ?, ?, ?, ?)", (
                        f"OT-{equipment}-{index}", equipment, day.isoformat(), kind,
                        rng.choice(("Alta", "Media", "Baja")), state, rng.choice(activities[kind]),
                    ))


def query(db, sql):
    return [dict(row) for row in db.execute(sql)]


def build():
    with sqlite3.connect(":memory:") as db:
        db.row_factory = sqlite3.Row
        seed(db)
        payload = {
            "reference": REFERENCE.isoformat(),
            "threshold": 10,
            "equipment": query(db, """
                WITH historial AS (
                    SELECT equipo, fecha, medicion_mm,
                        LAG(medicion_mm) OVER (PARTITION BY equipo ORDER BY fecha) AS anterior,
                        ROW_NUMBER() OVER (PARTITION BY equipo ORDER BY fecha DESC) AS posicion
                    FROM inspecciones
                )
                SELECT e.*, h.medicion_mm AS ultima,
                    ROUND(h.medicion_mm - h.anterior, 2) AS cambio,
                    e.proximo_servicio - e.horas AS restantes
                FROM equipos e JOIN historial h ON h.equipo = e.id AND h.posicion = 1
                ORDER BY e.id
            """),
            "readings": query(db, "SELECT * FROM inspecciones ORDER BY fecha, equipo"),
            "orders": query(db, "SELECT * FROM ordenes ORDER BY fecha DESC, id"),
        }
    template = (ROOT / "dashboard/template.html").read_text(encoding="utf-8")
    output = (template.replace("/* DASHBOARD_CSS */", (ROOT / "dashboard/style.css").read_text())
        .replace("/* DASHBOARD_JS */", (ROOT / "dashboard/app.js").read_text())
        .replace("/* DASHBOARD_DATA */", json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c")))
    (ROOT / "docs").mkdir(exist_ok=True)
    (ROOT / "docs/index.html").write_text(output, encoding="utf-8")


if __name__ == "__main__":
    build()
