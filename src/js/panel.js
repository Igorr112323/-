import { el, svgIcon, emit, formatCoord, formatFullDate, formatShortDate } from "./util.js";
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

  const status = document.getElementById("coords-status");
  if (store.point) {
    box.classList.add("has-point");
    empty.classList.add("hidden");
    values.classList.remove("hidden");
    lat.textContent = `${formatCoord(store.point.lat)}°`;
    lon.textContent = `${formatCoord(store.point.lon)}°`;
    status.textContent = "Точка выбрана — прогноз доступен";
  } else {
    box.classList.remove("has-point");
    empty.classList.remove("hidden");
    values.classList.add("hidden");
    status.textContent = "Выберите точку, чтобы разблокировать прогноз";
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

function buildCalendar() {
  const wrap = document.getElementById("calendar-wrap");
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
      }
    })
  );
  note.textContent = `Доступный период: ${formatFullDate(min)} — ${formatFullDate(max)}`;
}

function refreshDateButton() {
  const button = document.getElementById("date-button");
  const value = document.getElementById("date-value");
  const today = new Date();
  const isToday = store.selectedDate.toDateString() === today.toDateString();
  value.textContent = isToday ? "Сегодня" : formatFullDate(store.selectedDate);
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
  const pill = document.getElementById("meta-count");
  pill.textContent = `${count} ${pluralize(count, "сорт", "сорта", "сортов")}`;
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

export async function renderHistory() {
  const list = document.getElementById("history-list");
  const empty = document.getElementById("history-empty");
  const items = await listForecasts(8);
  list.replaceChildren();
  empty.style.display = items.length === 0 ? "" : "none";

  items.forEach((item, index) => {
    const icon = el("span", { class: "history-ico" }, [svgIcon("M13 2 4 14h6l-1 8 9-12h-6z")]);
    const title = el("span", { class: "history-title", text: item.variety_name || `${formatCoord(item.lat)}°, ${formatCoord(item.lon)}°` });
    const sub = el("span", { class: "history-sub", text: `${formatShortDate(new Date(item.target_date))} · ${formatShortDate(new Date(item.created_at))}` });
    const badge = el("span", { class: "history-badge", text: `${item.range_months} мес` });

    const deleteButton = el(
      "button",
      {
        class: "icon-btn",
        type: "button",
        title: "Удалить из истории",
        onclick: async (event) => {
          event.stopPropagation();
          const confirmed = await confirmDialog({ title: "Удалить прогноз", message: "Удалить запись из истории прогнозов?" });
          if (confirmed) {
            await deleteForecast(item.id);
            renderHistory();
          }
        }
      },
      [svgIcon("M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14")]
    );

    const row = el(
      "div",
      {
        class: "history-item",
        style: `animation-delay:${index * 40}ms`,
        onclick: () => emit("history:open", item)
      },
      [icon, el("div", { class: "history-main" }, [title, sub]), badge, deleteButton]
    );
    list.append(row);
  });
}

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

  document.getElementById("varieties-manage").addEventListener("click", () => emit("nav", { view: "varieties" }));

  document.getElementById("forecast-btn").addEventListener("click", () => {
    if (!store.point) {
      return;
    }
    callbacks.onForecast();
  });

  const collapseButton = document.getElementById("panel-collapse");
  const panel = document.getElementById("panel");
  collapseButton.addEventListener("click", () => {
    panel.classList.toggle("is-collapsed");
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
