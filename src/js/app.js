import { on, emit, toISODate } from "./util.js";
import { openDatabase, addForecast } from "./db.js";
import { initMap } from "./map.js";
import { initPanel, updatePanel, populateVarietySelect, renderHistory } from "./panel.js";
import { initVarietiesPage } from "./varieties.js";
import { initReportsPage, refreshReports } from "./reports.js";
import { initDataPage, refreshData } from "./data.js";
import { runLoading } from "./loading.js";
import { renderResults } from "./results.js";
import { showToast } from "./ui.js";
import { generateForecast } from "../../calculations/forecast_engine.js";

const state = {
  point: null,
  rangeMonths: 1,
  selectedDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
  varietyId: null,
  varietyName: null
};

let mapHandle = null;

function switchView(name) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-active", view.id === `view-${name}`);
  });
  ["map", "data", "reports", "varieties"].forEach((viewName) => {
    const nav = document.getElementById(`nav-${viewName}`);
    if (nav) {
      nav.classList.toggle("is-active", viewName === name);
    }
  });
  if (name === "map" && mapHandle) {
    mapHandle.invalidate();
  }
  if (name === "data") {
    refreshData();
  }
  if (name === "reports") {
    refreshReports();
  }
}

function handlePointSelect(point) {
  const lat = Number(point.lat);
  const lon = Number(point.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return;
  }
  state.point = { lat, lon };
  document.getElementById("map-hint").classList.add("is-hidden");
  updatePanel();
}

function clampDateToRange() {
  const today = new Date();
  const minMonth = today.getFullYear() * 12 + today.getMonth();
  const maxMonth = minMonth + state.rangeMonths;
  const current = state.selectedDate.getFullYear() * 12 + state.selectedDate.getMonth();
  const clamped = Math.min(maxMonth, Math.max(minMonth, current));
  state.selectedDate = new Date(Math.floor(clamped / 12), (clamped % 12) + 1, 0);
}

async function handleForecast() {
  if (!state.point) {
    return;
  }
  clampDateToRange();
  const request = {
    lat: state.point.lat,
    lon: state.point.lon,
    varietyName: state.varietyName || null,
    rangeMonths: state.rangeMonths,
    targetDate: toISODate(state.selectedDate)
  };

  await runLoading({ title: "Загрузка погодных данных" });
  let forecast = null;
  try {
    forecast = generateForecast(request);
    renderResults(forecast);
    switchView("results");
  } catch {
    showToast("Не удалось построить прогноз", "error");
    return;
  }

  try {
    await addForecast(
      {
        lat: request.lat,
        lon: request.lon,
        varietyId: state.varietyId || null,
        varietyName: request.varietyName || "",
        rangeMonths: request.rangeMonths,
        targetDate: request.targetDate
      },
      forecast
    );
    renderHistory();
  } catch (error) {
    console.error(error);
    showToast("Не удалось сохранить прогноз в историю", "error");
  }
}

function openForecastFromHistory(record) {
  let forecast = null;
  if (record.data_json) {
    try {
      forecast = JSON.parse(record.data_json);
    } catch {
      forecast = null;
    }
  }
  if (!forecast) {
    forecast = generateForecast({
      lat: record.lat,
      lon: record.lon,
      varietyName: record.variety_name || null,
      rangeMonths: record.range_months,
      targetDate: record.target_date
    });
  }
  renderResults(forecast);
  switchView("results");
}

async function boot() {
  initPanel(state, {
    onForecast: handleForecast,
    onRangeChange: () => {
      clampDateToRange();
      updatePanel();
    },
    onDateChange: () => {
      updatePanel();
    },
    onVarietyChange: (id, name) => {
      state.varietyId = id;
      state.varietyName = name;
    }
  });

  document.getElementById("nav-map").addEventListener("click", () => emit("nav", { view: "map" }));
  document.getElementById("nav-data").addEventListener("click", () => emit("nav", { view: "data" }));
  document.getElementById("nav-reports").addEventListener("click", () => emit("nav", { view: "reports" }));
  document.getElementById("nav-varieties").addEventListener("click", () => emit("nav", { view: "varieties" }));

  on("nav", ({ view }) => switchView(view));
  on("varieties:changed", () => {
    populateVarietySelect();
  });
  on("history:open", (record) => openForecastFromHistory(record));
  on("report:open", (record) => openForecastFromHistory(record));
  on("forecasts:changed", () => {
    renderHistory();
    refreshReports();
    refreshData();
  });
  on("map:error", () => {
    showToast("Не удалось загрузить картографические данные", "error");
  });

  try {
    await openDatabase();
  } catch {
    showToast("Не удалось открыть базу данных", "error");
  }

  try {
    await populateVarietySelect();
    await renderHistory();
    await initVarietiesPage();
    await initReportsPage();
    await initDataPage();
    mapHandle = initMap(document.getElementById("map"), { onSelect: handlePointSelect });
    switchView("map");
  } catch (error) {
    console.error(error);
    showToast("Произошла ошибка при запуске приложения", "error");
  }
}

if (document.readyState !== "loading") {
  boot();
} else {
  window.addEventListener("DOMContentLoaded", boot);
}
