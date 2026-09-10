import { el, svgIcon, emit, formatCoord, formatMonthYear, formatShortDate } from "./util.js";
import { createCalendar, computeForecastRange } from "./calendar.js";
import { confirmDialog } from "./ui.js";
import { listVarieties, listForecasts, deleteForecast } from "./db.js";

let store = null;
let callbacks = null;
let calendarOpen = false;

function setCoordsBox() {
  const box = document.getElementById("coords-box");
  const empty = document.getElementById("coords-empty");
  const values = document.getElementById("coords-values");
  const lat = document.getElementById("coord-lat");
  const lon = document.getElementById("coord-lon");

  if (store.point) {
    box.classList.add("has-point");
    empty.classList.add("hidden");
    values.classList.remove("hidden");
    lat.textContent = `${formatCoord(store.point.lat)}°`;
    lon.textContent = `${formatCoord(store.point.lon)}°`;
  } else {
    box.classList.remove("has-point");
    empty.classList.remove("hidden");
    values.classList.add("hidden");
  }
  syncForecastButton();
}

function syncForecastButton() {
  const button = document.getElementById("forecast-btn");
  button.disabled = !store.point;
}

function syncThumb() {
  const seg = document.getElementById("range-seg");
  const thumb = document.getElementById("seg-thumb");
  const active = seg.querySelector(".seg-btn.is-active");
  if (!active) {
    return;
  }
  thumb.style.width = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${active.offsetLeft - 4}px)`;
}

function setRangeUI() {
  const seg = document.getElementById("range-seg");
  seg.querySelectorAll(".seg-btn").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.range) === store.rangeMonths);
  });
  syncThumb();
  refreshCalendarIfOpen();
}

function refreshCalendarIfOpen() {
  if (!calendarOpen) {
    return;
  }
  buildCalendar();
}

function closeCalendar() {
  calendarOpen = false;
  document.getElementById("calendar-wrap").classList.remove("is-open");
  document.getElementById("date-button").classList.remove("is-open");
}

function buildCalendar() {
  const calendarRoot = document.getElementById("calendar");
  const note = document.getElementById("calendar-note");
  const { min, max } = computeForecastRange(new Date(), store.rangeMonths);

  calendarRoot.replaceChildren();
  calendarRoot.append(
    createCalendar({
      min,
      max,
      selected: store.selectedDate,
      onSelect: (date) => {
        store.selectedDate = date;
        callbacks.onDateChange(date);
        refreshDateButton();
        closeCalendar();
      }
    })
  );
  note.textContent = `Доступный период: ${formatMonthYear(min)} — ${formatMonthYear(max)}`;
}

function refreshDateButton() {
  const value = document.getElementById("date-value");
  value.textContent = formatMonthYear(store.selectedDate);
}

export async function populateVarietySelect() {
  const select = document.getElementById("variety-select");
  const varieties = await listVarieties();
  const current = store.varietyId;
  select.replaceChildren();
  const placeholder = el("option", { value: "", text: "Без сорта" });
  select.append(placeholder);
  for (const variety of varieties) {
    select.append(el("option", { value: variety.id, text: variety.name }));
  }
  if (current && varieties.some((variety) => variety.id === current)) {
    select.value = current;
  } else {
    select.value = "";
    store.varietyId = null;
    store.varietyName = null;
  }
  syncMetaCount(varieties.length);
}

function syncMetaCount(count) {
}

function pluralize(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }
  return many;
}

export async function renderHistory() {}

export function initPanel(state, handlers) {
  store = state;
  callbacks = handlers;

  document.querySelectorAll("#range-seg .seg-btn").forEach((button) => {
    button.addEventListener("click", () => {
      store.rangeMonths = Number(button.dataset.range);
      setRangeUI();
      callbacks.onRangeChange(store.rangeMonths);
    });
  });

  const dateButton = document.getElementById("date-button");
  const calendarWrap = document.getElementById("calendar-wrap");
  dateButton.addEventListener("click", () => {
    calendarOpen = !calendarOpen;
    calendarWrap.classList.toggle("is-open", calendarOpen);
    dateButton.classList.toggle("is-open", calendarOpen);
    if (calendarOpen) {
      buildCalendar();
    }
  });

  const select = document.getElementById("variety-select");
  select.addEventListener("change", () => {
    store.varietyId = select.value || null;
    store.varietyName = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : null;
    callbacks.onVarietyChange(store.varietyId, store.varietyName);
  });


  document.getElementById("forecast-btn").addEventListener("click", () => {
    if (!store.point) {
      return;
    }
    callbacks.onForecast();
  });


  window.addEventListener("resize", syncThumb);

  setCoordsBox();
  setRangeUI();
  refreshDateButton();
  syncForecastButton();
}

export function updatePanel() {
  setCoordsBox();
  setRangeUI();
  refreshDateButton();
}
