import { on, emit, addMonths, toISODate } from "./util.js";
import { openDatabase, addForecast } from "./db.js";
import { initMap } from "./map.js";
import { initPanel, updatePanel, populateVarietySelect, renderHistory } from "./panel.js";
import { initVarietiesPage } from "./varieties.js";
import { runLoading } from "./loading.js";
import { renderResults } from "./results.js";
import { showToast } from "./ui.js";
import { generateForecast } from "../../calculations/forecast_engine.js";

const state = {
  point: null,
  rangeMonths: 1,
  selectedDate: new Date(),
  varietyId: null,
  varietyName: null
};

let mapHandle = null;

function switchView(name) {
  const views = document.querySelectorAll(".view");
  views.forEach((view) => {
    view.classList.toggle("is-active", view.id === `view-${name}`);
  });
  const navMap = document.getElementById("nav-map");
  const navVarieties = document.getElementById("nav-varieties");
  navMap.classList.toggle("is-active", name === "map");
  navVarieties.classList.toggle("is-active", name === "varieties");
  if (name === "map" && mapHandle) {
    mapHandle.invalidate();
  }
}

function handlePointSelect(point) {
  state.point = { lat: point.lat, lon: point.lon };
  document.getElementById("map-hint").classList.add("is-hidden");
  updatePanel();
}

function clampDateToRange() {
  const today = new Date();
  const max = addMonths(new Date(today.getFullYear(), today.getMonth(), today.getDate()), state.rangeMonths);
  if (state.selectedDate > max) {
    state.selectedDate = max;
  }
  if (state.selectedDate < today) {
    state.selectedDate = today;
  }
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
  try {
    const forecast = generateForecast(request);
    renderResults(forecast);
    switchView("results");
  } catch {
    showToast("Не удалось построить прогноз", "error");
    return;
  }

  try {
    await addForecast({
      lat: request.lat,
      lon: request.lon,
      varietyId: state.varietyId || null,
      varietyName: request.varietyName || "",
      rangeMonths: request.rangeMonths,
      targetDate: request.targetDate
    });
    renderHistory();
  } catch {
    showToast("Не удалось сохранить прогноз в историю", "error");
  }
}

function openForecastFromHistory(record) {
  const request = {
    lat: record.lat,
    lon: record.lon,
    varietyName: record.variety_name || null,
    rangeMonths: record.range_months,
    targetDate: record.target_date
  };
  const forecast = generateForecast(request);
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
  document.getElementById("nav-varieties").addEventListener("click", () => emit("nav", { view: "varieties" }));

  on("nav", ({ view }) => switchView(view));
  on("varieties:changed", () => {
    populateVarietySelect();
  });
  on("history:open", (record) => openForecastFromHistory(record));
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
