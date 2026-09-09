import { el, svgIcon, emit, formatShortDate, formatSignedCoord, formatInteger } from "./util.js";
import { listForecasts, clearAllForecasts } from "./db.js";
import { confirmDialog, showToast } from "./ui.js";

let packageSelect = null;
let summaryNode = null;
let tableWrap = null;

function parseData(record) {
  if (!record || !record.data_json) {
    return null;
  }
  try {
    return JSON.parse(record.data_json);
  } catch {
    return null;
  }
}

function buildTable(forecast) {
  const table = el("table", { class: "data-table" });
  const thead = el("thead");
  const headRow = el("tr");
  ["Дата", "Т. мин", "Т. макс", "Т. ср.", "Осадки, мм", "Влажн., %", "Почва, %"].forEach((label) => headRow.append(el("th", { text: label })));
  thead.append(headRow);

  const tbody = el("tbody");
  for (const day of forecast.series) {
    const row = el("tr");
    row.append(
      el("td", { text: day.label }),
      el("td", { class: "num", text: `${day.tMin}°` }),
      el("td", { class: "num", text: `${day.tMax}°` }),
      el("td", { class: "num strong", text: `${day.tMean}°` }),
      el("td", { class: "num", text: String(day.precip) }),
      el("td", { class: "num", text: `${day.humidity}%` }),
      el("td", { class: "num", text: `${day.soilMoisture}%` })
    );
    tbody.append(row);
  }
  table.append(thead, tbody);
  return el("div", { class: "data-table-wrap" }, [table]);
}

function renderPackage(record) {
  const forecast = parseData(record);
  summaryNode.replaceChildren();
  if (!forecast) {
    summaryNode.append(el("span", { class: "count-pill", text: "Данные отсутствуют" }));
    tableWrap.replaceChildren();
    return;
  }

  const chips = [
    { label: "Точка", value: `${formatSignedCoord(forecast.request.lat, "с.ш.", "ю.ш.")}, ${formatSignedCoord(forecast.request.lon, "в.д.", "з.д.")}` },
    { label: "Период", value: `${formatShortDate(new Date(forecast.period.start))} — ${formatShortDate(new Date(forecast.period.end))}` },
    { label: "Записей", value: String(forecast.series.length) },
    { label: "Скачано", value: `${formatInteger(forecast.series.length * 7)} показателей` },
    { label: "Сорт", value: forecast.request.varietyName || "Без сорта" }
  ];

  summaryNode.append(
    el("div", { class: "chips-row" }, chips.map((chip) => el("div", { class: "chip" }, [el("span", { class: "chip-label", text: chip.label }), el("span", { class: "chip-value", text: chip.value })])))
  );

  tableWrap.replaceChildren(buildTable(forecast));
}

async function clearAll() {
  const ok = await confirmDialog({ title: "Очистить данные", message: "Удалить все скачанные метеоданные и отчёты? Это действие нельзя отменить.", confirmLabel: "Очистить всё" });
  if (!ok) {
    return;
  }
  await clearAllForecasts();
  showToast("Данные удалены", "success");
  await refreshData();
  emit("forecasts:changed");
}

export async function refreshData() {
  const forecasts = await listForecasts(50);
  const withData = forecasts.filter((record) => record.data_json);

  const previous = packageSelect.value;
  packageSelect.replaceChildren();

  if (withData.length === 0) {
    packageSelect.append(el("option", { value: "", text: "Нет скачанных данных" }));
    summaryNode.replaceChildren();
    tableWrap.replaceChildren(
      el("div", { class: "empty-state" }, [
        svgIcon("M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"),
        el("h3", { text: "Данные ещё не скачаны" }),
        el("p", { text: "Запустите прогноз на карте — скачанные метеоданные появятся здесь." })
      ])
    );
    return;
  }

  for (const record of withData) {
    const forecast = parseData(record);
    const point = forecast ? `${formatShortDate(new Date(forecast.period.end))} · ${forecast.request.varietyName || `${Number(record.lat).toFixed(2)}, ${Number(record.lon).toFixed(2)}`}` : formatShortDate(new Date(record.target_date));
    packageSelect.append(el("option", { value: record.id, text: point }));
  }

  if (previous && withData.some((record) => record.id === previous)) {
    packageSelect.value = previous;
  }
  const selected = withData.find((record) => record.id === packageSelect.value) || withData[0];
  packageSelect.value = selected.id;
  renderPackage(selected);
}

export async function initDataPage() {
  const root = document.getElementById("view-data");
  const backButton = el("button", { class: "page-back", type: "button", onclick: () => emit("nav", { view: "map" }) }, [svgIcon("M15 18l-6-6 6-6"), el("span", { text: "Назад к карте" })]);

  const clearButton = el("button", { class: "btn-ghost danger-ghost", type: "button", onclick: clearAll }, [svgIcon("M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"), el("span", { text: "Очистить данные" })]);

  const head = el("div", { class: "page-head" }, [
    backButton,
    el("div", {}, [el("h1", { class: "page-title", text: "Данные о погоде" }), el("p", { class: "page-sub", text: "Метеоданные, скачанные для построения прогнозов" })]),
    el("div", { class: "page-actions" }, [clearButton])
  ]);

  packageSelect = el("select", { class: "select data-select" });
  packageSelect.addEventListener("change", async () => {
    const forecasts = await listForecasts(50);
    const record = forecasts.find((item) => item.id === packageSelect.value);
    renderPackage(record);
  });

  const toolbar = el("div", { class: "toolbar" }, [
    el("div", { class: "data-toolbar-label" }, [el("span", { text: "Набор данных:" }), packageSelect])
  ]);

  summaryNode = el("div", { class: "data-summary" });
  tableWrap = el("div", { class: "data-table-container" });

  root.replaceChildren(el("div", { class: "view-page" }, [head, toolbar, summaryNode, tableWrap]));

  await refreshData();
}
