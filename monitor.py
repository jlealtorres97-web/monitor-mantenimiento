"""Importa inspecciones de ejemplo y genera un informe HTML local."""

import argparse
import csv
from datetime import date
from html import escape
from math import isfinite
from pathlib import Path
import sqlite3
import sys


COLUMNS = ("equipo", "fecha", "medicion_mm")
SCHEMA = """
CREATE TABLE IF NOT EXISTS inspecciones (
    equipo TEXT NOT NULL,
    fecha TEXT NOT NULL,
    medicion_mm REAL NOT NULL CHECK (medicion_mm >= 0),
    PRIMARY KEY (equipo, fecha)
)
"""
REPORT_QUERY = """
WITH historial AS (
    SELECT equipo, fecha, medicion_mm,
           LAG(medicion_mm) OVER (PARTITION BY equipo ORDER BY fecha) AS anterior,
           ROW_NUMBER() OVER (PARTITION BY equipo ORDER BY fecha DESC) AS posicion
    FROM inspecciones
)
SELECT equipo, fecha, medicion_mm, medicion_mm - anterior AS cambio
FROM historial
WHERE posicion = 1
ORDER BY medicion_mm DESC, equipo
"""


def load_csv(path):
    readings = {}
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source, strict=True)
        if tuple(reader.fieldnames or ()) != COLUMNS:
            raise ValueError("Encabezado esperado: " + ",".join(COLUMNS))
        for row in reader:
            try:
                if None in row or any(row[column] is None for column in COLUMNS):
                    raise ValueError("número incorrecto de columnas")
                equipment = row["equipo"].strip().upper()
                day = date.fromisoformat(row["fecha"]).isoformat()
                if row["fecha"] != day:
                    raise ValueError("usa el formato AAAA-MM-DD para la fecha")
                reading = float(row["medicion_mm"])
                if not equipment or not isfinite(reading) or reading < 0:
                    raise ValueError("equipo vacío o medición inválida")
                key = (equipment, day)
                if key in readings and readings[key] != reading:
                    raise ValueError("mediciones distintas para el mismo equipo y fecha")
                readings[key] = reading
            except ValueError as error:
                raise ValueError(f"Línea {reader.line_num}: {error}") from error
    if not readings:
        raise ValueError("El CSV no contiene inspecciones")
    return [(equipment, day, reading) for (equipment, day), reading in readings.items()]


def import_readings(connection, readings):
    with connection:
        connection.execute(SCHEMA)
        connection.executemany(
            """
            INSERT INTO inspecciones (equipo, fecha, medicion_mm) VALUES (?, ?, ?)
            ON CONFLICT (equipo, fecha)
            DO UPDATE SET medicion_mm = excluded.medicion_mm
            """,
            readings,
        )


def render_report(rows, threshold):
    body = []
    for equipment, day, reading, change in rows:
        status = "Revisar" if reading >= threshold else "Dentro del umbral"
        change_label = "Sin medición previa" if change is None else f"{change:+.2f} mm"
        body.append(
            f"<tr><th scope='row'>{escape(equipment)}</th><td>{day}</td>"
            f"<td>{reading:.2f} mm</td><td>{change_label}</td><td>{status}</td></tr>"
        )
    alerts = sum(reading >= threshold for _, _, reading, _ in rows)
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Monitor de mantenimiento</title>
<style>
body {{font: 1rem/1.5 system-ui, sans-serif; color:#192735; background:#f3f6f8; margin:0}}
main {{max-width:58rem; margin:3rem auto; padding:0 1rem}}
h1 {{line-height:1.1}}
section {{overflow-x:auto; border:1px solid #d7e0e7; border-radius:.6rem}}
table {{width:100%; border-collapse:collapse; background:white; text-align:left}}
caption {{padding:.8rem; background:#e6edf3; text-align:left; font-weight:600}}
th, td {{padding:.65rem .85rem; border-bottom:1px solid #d7e0e7}}
thead {{background:#193449; color:white}}
</style>
</head>
<body><main>
<h1>Monitor de mantenimiento</h1>
<p>Datos sintéticos de inspecciones de equipos.</p>
<p><strong>{len(rows)}</strong> equipos · <strong>{alerts}</strong> para revisar ·
Umbral de demostración: {threshold:.2f} mm</p>
<section><table>
<caption>Última inspección por equipo</caption>
<thead><tr><th scope="col">Equipo</th><th scope="col">Fecha</th>
<th scope="col">Medición</th><th scope="col">Cambio anterior</th>
<th scope="col">Estado</th></tr></thead>
<tbody>{''.join(body)}</tbody>
</table></section>
</main></body></html>
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path)
    parser.add_argument("--db", type=Path, default=Path("inspecciones.sqlite"))
    parser.add_argument("--salida", type=Path, default=Path("reporte.html"))
    parser.add_argument("--umbral", type=float, default=10.0)
    args = parser.parse_args()
    if not isfinite(args.umbral) or args.umbral <= 0:
        parser.error("--umbral debe ser un número finito mayor que cero")
    if len({path.resolve() for path in (args.csv, args.db, args.salida)}) != 3:
        parser.error("El CSV, la base de datos y la salida deben ser archivos distintos")
    try:
        readings = load_csv(args.csv)
        connection = sqlite3.connect(args.db)
        try:
            import_readings(connection, readings)
            rows = connection.execute(REPORT_QUERY).fetchall()
        finally:
            connection.close()
        args.salida.write_text(render_report(rows, args.umbral), encoding="utf-8")
    except (OSError, UnicodeError, ValueError, csv.Error, sqlite3.Error) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    print(f"Informe generado: {args.salida} ({len(rows)} equipos)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
