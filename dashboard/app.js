"use strict";

const data = JSON.parse(document.querySelector("#dataset").textContent);
const view = document.querySelector("#view");
const fleet = document.querySelector("#fleet");
const equipment = document.querySelector("#equipment");
const number = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("es-CO", {dateStyle: "medium", timeZone: "UTC"});
const formatDate = value => date.format(new Date(value + "T00:00:00Z"));
const mm = value => number.format(value) + " mm";
const hours = value => number.format(value) + " h";
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const equipmentById = new Map(data.equipment.map(row => [row.id, row]));
const fleets = [...new Set(data.equipment.map(row => row.flota))];
let activeView = "overview";
let orderStatus = "";
let orderType = "";

function options(values, label, selected = "") {
  return [["", label], ...values.map(value => [value, value])]
    .map(([value, text]) =>
      `<option value="${escape(value)}"${value === selected ? " selected" : ""}>${escape(text)}</option>`)
    .join("");
}

function table(headers, rows) {
  if (!rows.length) return '<p class="hint" role="status">No hay registros para estos filtros.</p>';
  return `<div class="table-wrap" tabindex="0" aria-label="Tabla de resultados">
    <table><thead><tr>${headers.map(label => `<th scope="col">${label}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>`;
}

function card(label, value, alert = false) {
  return `<div class="card${alert ? " alert" : ""}"><span>${label}</span><strong>${value}</strong></div>`;
}

function pill(label, tone = "") {
  return `<span class="pill ${tone}">${escape(label)}</span>`;
}

function serviceStatus(remaining) {
  if (remaining <= 0) return pill("Vencido", "danger");
  if (remaining <= 100) return pill("Próximo", "warn");
  return pill("Al día");
}

function bars(items) {
  const maximum = Math.max(1, ...items.map(([, count]) => count));
  return items.map(([label, count]) => `<div class="bar-row">
    <span>${escape(label)}</span><span class="track" aria-hidden="true">
    <span class="fill" style="width:${100 * count / maximum}%"></span></span>
    <strong>${count}</strong></div>`).join("");
}

function renderOverview(assets, orders) {
  const alerts = assets.filter(row => row.ultima >= data.threshold);
  const overdue = assets.filter(row => row.restantes <= 0);
  const open = orders.filter(row => row.estado !== "Cerrada");
  const groups = (fleet.value ? [fleet.value] : fleets).map(name => {
    const members = assets.filter(row => row.flota === name);
    return [name, members.length, members.filter(row => row.ultima >= data.threshold).length,
      members.filter(row => row.restantes <= 0).length];
  });
  view.innerHTML = `<div class="metrics">
    ${card("Equipos", assets.length)}${card("Alertas de inspección", alerts.length, alerts.length > 0)}
    ${card("Órdenes pendientes", open.length)}${card("Preventivos vencidos", overdue.length, overdue.length > 0)}
    </div><div class="panels"><article class="panel"><h2>Órdenes por estado</h2>
    ${bars(["Abierta", "En ejecución", "Cerrada"].map(state =>
      [state, orders.filter(row => row.estado === state).length]))}</article>
    <article class="panel"><h2>Equipos por flota</h2>
    ${bars(groups.map(([name, count]) => [name, count]))}</article></div>
    <article class="panel"><h2>Estado por flota</h2>
    ${table(["Flota", "Equipos", "Alertas", "Preventivos vencidos"], groups.map(([name, ...counts]) => [escape(name), ...counts]))}</article>`;
}

function drawTrend(canvas, points) {
  const ratio = window.devicePixelRatio || 1;
  const {width, height} = canvas.getBoundingClientRect();
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  const left = 38, right = width - 15, top = 16, bottom = height - 28;
  const maximum = Math.max(1, ...points.map(point => point.average)) * 1.12;
  const x = index => left + (right - left) * index / Math.max(1, points.length - 1);
  const y = value => bottom - (bottom - top) * value / maximum;
  context.font = "11px system-ui";
  context.fillStyle = "#4d625d";
  for (let index = 0; index <= 4; index++) {
    const value = maximum * index / 4;
    context.fillText(number.format(value), 0, y(value) + 3);
    context.strokeStyle = "#d8e4df";
    context.beginPath();
    context.moveTo(left, y(value));
    context.lineTo(right, y(value));
    context.stroke();
  }
  context.beginPath();
  context.strokeStyle = "#116657";
  context.lineWidth = 2.5;
  points.forEach((point, index) => context.lineTo(x(index), y(point.average)));
  context.stroke();
  points.forEach((point, index) => {
    context.beginPath();
    context.arc(x(index), y(point.average), 3.5, 0, 2 * Math.PI);
    context.fillStyle = "#116657";
    context.fill();
    if (width > 480 || index % 2 === 0 || index === points.length - 1) {
      context.fillStyle = "#4d625d";
      context.textAlign = index === points.length - 1 ? "right" : "center";
      context.fillText(point.day.slice(8) + "/" + point.day.slice(5, 7), x(index), bottom + 20);
    }
  });
}

function renderInspections(assets, ids) {
  const readings = data.readings.filter(row => ids.has(row.equipo));
  const dates = [...new Set(readings.map(row => row.fecha))];
  const points = dates.map(day => {
    const daily = readings.filter(row => row.fecha === day);
    return {day, average: daily.reduce((sum, row) => sum + row.medicion_mm, 0) / daily.length};
  });
  const rows = [...assets].sort((a, b) => b.ultima - a.ultima).map(row => [
    escape(row.id), escape(row.flota), mm(row.ultima), mm(row.cambio),
    row.ultima >= data.threshold ? pill("Revisar", "danger") : pill("Dentro del umbral"),
  ]);
  view.innerHTML = `<article class="panel"><h2>Tendencia de inspecciones</h2>
    <p>${equipment.value ? "Medición del equipo" : "Promedio de equipos seleccionados"} por fecha, en milímetros.</p>
    <canvas id="trend" role="img" aria-label="${escape(points.map(point =>
      formatDate(point.day) + ": " + mm(point.average)).join("; "))}"></canvas></article>
    <article class="panel"><h2>Última inspección por equipo</h2><p>Umbral de ejemplo de ${mm(data.threshold)}.</p>
    ${table(["Equipo", "Flota", "Medición", "Cambio anterior", "Estado"], rows)}</article>
    ${equipment.value ? `<article class="panel"><h2>Historial del equipo</h2>
      ${table(["Fecha", "Medición"], [...readings].reverse().map(row =>
        [formatDate(row.fecha), mm(row.medicion_mm)]))}</article>` : ""}`;
  drawTrend(document.querySelector("#trend"), points);
}

function renderOrders(orders) {
  const shown = orders.filter(row =>
    (!orderStatus || row.estado === orderStatus) && (!orderType || row.clase === orderType));
  const rows = shown.map(row => [
    escape(row.id), escape(row.equipo), escape(equipmentById.get(row.equipo).flota),
    formatDate(row.fecha), escape(row.clase), escape(row.actividad),
    pill(row.prioridad, row.prioridad === "Alta" ? "danger" : ""),
    pill(row.estado, row.estado === "Cerrada" ? "" : "warn"),
  ]);
  view.innerHTML = `<article class="panel"><h2>Órdenes de trabajo</h2>
    <div class="toolbar">
    <label>Estado<select id="order-status">${options(["Abierta", "En ejecución", "Cerrada"], "Todos", orderStatus)}</select></label>
    <label>Tipo<select id="order-type">${options(["Preventivo", "Correctivo", "Predictivo"], "Todos", orderType)}</select></label>
    </div><p role="status">${shown.length} órdenes de ${orders.length}</p>
    ${table(["Orden", "Equipo", "Flota", "Fecha", "Tipo", "Actividad", "Prioridad", "Estado"], rows)}
    </article>`;
  document.querySelector("#order-status").addEventListener("change", event => {
    orderStatus = event.target.value;
    renderOrders(orders);
    document.querySelector("#order-status").focus();
  });
  document.querySelector("#order-type").addEventListener("change", event => {
    orderType = event.target.value;
    renderOrders(orders);
    document.querySelector("#order-type").focus();
  });
}

function renderPreventive(assets) {
  const overdue = assets.filter(row => row.restantes <= 0).length;
  const upcoming = assets.filter(row => row.restantes > 0 && row.restantes <= 100).length;
  const rows = [...assets].sort((a, b) => a.restantes - b.restantes).map(row => [
    escape(row.id), escape(row.flota), hours(row.horas), hours(row.proximo_servicio),
    hours(row.restantes), serviceStatus(row.restantes),
  ]);
  view.innerHTML = `<div class="metrics">${card("Servicios vencidos", overdue, overdue > 0)}
    ${card("Servicios próximos", upcoming)}${card("Servicios al día", assets.length - overdue - upcoming)}</div>
    <article class="panel"><h2>Plan por horómetro</h2>
    <p>Un servicio se marca como próximo cuando faltan entre 1 y 100 horas.</p>
    ${table(["Equipo", "Flota", "Horómetro", "Servicio a las", "Horas restantes", "Estado"], rows)}</article>`;
}

function render() {
  const assets = data.equipment.filter(row =>
    (!fleet.value || row.flota === fleet.value) && (!equipment.value || row.id === equipment.value));
  const ids = new Set(assets.map(row => row.id));
  const orders = data.orders.filter(row => ids.has(row.equipo));
  if (activeView === "overview") renderOverview(assets, orders);
  if (activeView === "inspections") renderInspections(assets, ids);
  if (activeView === "orders") renderOrders(orders);
  if (activeView === "preventive") renderPreventive(assets);
}

function updateEquipment() {
  const assets = data.equipment.filter(row => !fleet.value || row.flota === fleet.value);
  equipment.innerHTML = options(assets.map(row => row.id), "Todos los equipos");
}

document.querySelector("#reference").textContent = "Corte de la demo: " + formatDate(data.reference);
fleet.innerHTML = options(fleets, "Todas las flotas");
updateEquipment();
fleet.addEventListener("change", () => {
  updateEquipment();
  render();
});
equipment.addEventListener("change", render);
document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelector("[aria-current]").removeAttribute("aria-current");
    button.setAttribute("aria-current", "page");
    activeView = button.dataset.view;
    render();
  });
});
new ResizeObserver(() => {
  if (activeView !== "inspections") return;
  const canvas = document.querySelector("#trend");
  if (canvas && Math.abs(canvas.width / (window.devicePixelRatio || 1) - canvas.clientWidth) > 1) render();
}).observe(view);
render();
