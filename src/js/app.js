import { on, emit, toISODate, el } from "./util.js";
import { openDatabase, addDataset, unpackForecast } from "./db.js";
import { initMap } from "./map.js";
import { initPanel, updatePanel, populateVarietySelect, renderHistory } from "./panel.js";
import { initVarietiesPage } from "./varieties.js";
import { initReportsPage, refreshReports } from "./reports.js";
import { initDataPage, refreshData } from "./data.js";
import { runLoading } from "./loading.js";
import { renderResults, bindResultsResize, onResultsShown } from "./results.js";
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
let generating = false;

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
  if (name === "results") {
    onResultsShown();
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
  const minMonth = 1990 * 12;
  const maxMonth = (today.getFullYear() * 12 + today.getMonth()) + state.rangeMonths;
  const current = state.selectedDate.getFullYear() * 12 + state.selectedDate.getMonth();
  const clamped = Math.min(maxMonth, Math.max(minMonth, current));
  state.selectedDate = new Date(Math.floor(clamped / 12), (clamped % 12) + 1, 0);
}

async function handleForecast() {
  if (!state.point || generating) {
    return;
  }
  generating = true;
  const forecastButton = document.getElementById("forecast-btn");
  forecastButton.disabled = true;
  clampDateToRange();
  const request = {
    lat: state.point.lat,
    lon: state.point.lon,
    varietyName: state.varietyName || null,
    rangeMonths: state.rangeMonths,
    targetDate: toISODate(state.selectedDate)
  };

  try {
    await runLoading({ title: "Загрузка погодных данных" });
    let forecast = null;
    try {
      forecast = generateForecast(request);
    } catch {
      showToast("Не удалось построить прогноз", "error");
      return;
    }
    renderResults(forecast, { varietyId: state.varietyId, savedRecord: null });
    switchView("results");

    try {
      await addDataset(
        {
          lat: request.lat,
          lon: request.lon,
          varietyName: request.varietyName || "",
          rangeMonths: request.rangeMonths,
          targetDate: request.targetDate
        },
        forecast
      );
      refreshData();
    } catch {
      showToast("Не удалось сохранить набор данных", "error");
    }
  } finally {
    generating = false;
    updatePanel();
  }
}

function openForecastFromHistory(record) {
  let forecast = null;
  if (record.data_json) {
    forecast = unpackForecast(record.data_json);
  }
  if (!forecast) {
    if (record.data_json) {
      renderResults(null);
      switchView("results");
      return;
    }
    // Legacy records without a stored snapshot fall back to the engine (deterministic for the same request).
    try {
      forecast = generateForecast({
        lat: record.lat,
        lon: record.lon,
        varietyName: record.variety_name || null,
        rangeMonths: record.range_months,
        targetDate: record.target_date
      });
    } catch {
      forecast = null;
    }
    renderResults(forecast, { savedRecord: null });
    switchView("results");
    return;
  }
  renderResults(forecast, { savedRecord: record });
  switchView("results");
}

function showPageInitError(sectionId, retry) {
  const section = document.getElementById(sectionId);
  if (!section) {
    return;
  }
  const root = section.querySelector(".w-root");
  if (!root) {
    return;
  }
  root.replaceChildren(
    el("div", { class: "w-page" }, [
      el("div", { class: "w-panel", style: "border:1px solid var(--w-border, #DCE4DA)" }, [
        el("div", { class: "w-state" }, [
          el("h3", { text: "Раздел не удалось загрузить" }),
          el("p", { text: "Проверьте доступность базы данных." }),
          el("div", { class: "w-state-actions" }, [
            el("button", { class: "w-btn w-btn--primary", type: "button", text: "Повторить", onclick: retry })
          ])
        ])
      ])
    ])
  );
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

  bindResultsResize();

  try {
    await openDatabase();
  } catch {
    showToast("Не удалось открыть базу данных", "error");
  }

  try {
    mapHandle = initMap(document.getElementById("map"), { onSelect: handlePointSelect });
    switchView("map");
  } catch (error) {
    console.error(error);
    showToast("Произошла ошибка при запуске приложения", "error");
  }

  const pages = [
    { section: "view-data", init: initDataPage },
    { section: "view-reports", init: initReportsPage },
    { section: "view-varieties", init: initVarietiesPage }
  ];
  for (const page of pages) {
    try {
      await page.init();
    } catch (error) {
      console.error(error);
      showPageInitError(page.section, async () => {
        try {
          await openDatabase();
          await page.init();
        } catch {
          showPageInitError(page.section, async () => {});
        }
      });
    }
  }

  try {
    await populateVarietySelect();
    await renderHistory();
  } catch (error) {
    console.error(error);
  }
}

if (document.readyState !== "loading") {
  boot();
} else {
  window.addEventListener("DOMContentLoaded", boot);
}
