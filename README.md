# Monitor de flotas

Proyecto de portafolio en Python, SQLite y JavaScript para seguimiento de mantenimiento de equipos. El dashboard usa 30 equipos ficticios agrupados en cuatro flotas, con seis inspecciones por equipo y órdenes preventivas, correctivas y predictivas.

## Abrir el dashboard

Abre `docs/index.html` directamente en el navegador. La demo funciona sin conexión y se puede publicar en GitHub Pages desde la carpeta `/docs`. Los filtros de flota y equipo se aplican en todas las vistas.

| Vista | Información |
| --- | --- |
| Resumen | Equipos, alertas de inspección, órdenes pendientes y preventivos vencidos. |
| Inspecciones | Tendencia por fecha, última medición, cambio anterior e historial al seleccionar un equipo. |
| Órdenes de trabajo | Actividad, tipo, prioridad y estado, con filtros combinables. |
| Preventivo | Horómetro, objetivo de servicio y horas restantes, ordenados por urgencia. |

Para regenerar el dashboard con Python 3.10 o superior:

```bash
python build_dashboard.py
```

El generador crea y consulta una base SQLite en memoria. Usa funciones de ventana para obtener la última inspección y su cambio, y empaqueta los resultados en HTML con los estilos y JavaScript de `dashboard/`. Los umbrales de inspección y servicio son valores ilustrativos.

## Importador de inspecciones CSV

Requiere Python 3.10 o superior. Desde la carpeta del proyecto:

```bash
python monitor.py data/inspecciones.csv
```

Abre `reporte.html` en tu navegador. También puedes abrir `demo.html`, una copia del resultado con los datos de ejemplo.

```bash
python monitor.py data/inspecciones.csv --umbral 8 --db inspecciones.sqlite --salida reporte.html
```

## Cómo funciona

1. Valida que cada fila tenga un equipo, una fecha en formato AAAA-MM-DD y una medición finita en milímetros mayor o igual a cero.
2. Persiste los registros en SQLite. La clave compuesta de equipo y fecha evita duplicados. Si otro CSV trae una medición corregida para esa clave, el valor se actualiza. Dentro de un mismo CSV, dos valores distintos para una misma clave generan un error.
3. Usa `ROW_NUMBER` y `LAG` para obtener la última inspección y calcular el cambio frente a la medición anterior de cada equipo.
4. Genera un informe HTML que marca para revisión las mediciones que alcanzan el umbral configurable. El valor inicial de 10 mm es ilustrativo.

Con el CSV incluido, el informe muestra cuatro equipos y dos para revisar. EQ-101 presenta una última medición de 10,40 mm y un aumento de 4,30 mm frente a la inspección anterior. EQ-104 aparece sin medición previa.

## Archivos principales

- `monitor.py` — validación del CSV, persistencia, consulta SQL y generación de HTML.
- `data/inspecciones.csv` — datos sintéticos de ejemplo.
- `demo.html` — informe generado con los datos incluidos.
