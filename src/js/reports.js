import {
  el, emit, formatDateTime, formatFullDate, parseISODate, plural, shortId
} from "./util.js";
import { icon, iconButton } from "./icons.js";
import { confirmDialog, showToast } from "./ui.js";
import { listForecasts, deleteForecast } from "./db.js";

const store = {
  rows: [],
  query: "",
  variety: "all",
  sort: "date-desc",
  error: false,
  scroll: 0
};

let rootNode = null;
let renderToken = 0;

function reportTitle(record) {
  const variety = String(record.variety_name || "").trim();
  return variety ? `Прогноз · ${variety}` : "Прогноз без сорта";
}

function coordText(record) {
  return `${Number(record.lat).toFixed(4)}, ${Number(record.lon).toFixed(4)}`;
}

// Only what is actually stored for the record — no derived guesses about the start date.
function recordPeriod(record) {
  const target = parseISODate(record.target_date);
  if (!target) {
    return "—";
  }
  return `до ${formatFullDate(target)} · ${record.range_months} мес`;
}

function uniqueVarieties() {
  const seen = [];
  for (const record of store.rows) {
    const name = String(record.variety_name || "").trim();
    if (name && !seen.includes(name)) {
      seen.push(name);
    }
  }
  return seen.sort((a, b) => a.localeCompare(b, "ru"));
}

function filteredRows() {
  const q = store.query.trim().toLowerCase();
  let rows = store.rows;
  if (q) {
    rows = rows.filter((record) =>
      reportTitle(record).toLowerCase().includes(q) ||
      coordText(record).includes(q) ||
      shortId(record.id).toLowerCase().includes(q)
    );
  }
  if (store.variety !== "all") {
    rows = rows.filter((record) => String(record.variety_name || "").trim() === store.variety);
  }
  const sorted = [...rows];
  if (store.sort === "date-desc") {
    sorted.sort((a, b) => b.created_at - a.created_at);
  } else if (store.sort === "date-asc") {
    sorted.sort((a, b) => a.created_at - b.created_at);
  }
  return sorted;
}

function selectWrap(select) {
  const caret = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  caret.setAttribute("class", "w-select-caret");
  caret.setAttribute("viewBox", "0 0 24 24");
  caret.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M6 9l6 6 6-6");
  caret.append(path);
  return el("div", { class: "w-select-wrap" }, [select, caret]);
}

function toolbarNode() {
  const searchInput = el("input", {
    class: "w-input",
    type: "text",
    placeholder: "Поиск по названию, координатам, номеру…",
    value: store.query,
    "aria-label": "Поиск по отчётам"
  });
  const searchClear = el("button", { class: "w-search-clear", type: "button", "aria-label": "Очистить поиск" }, [icon("close", "w-ico")]);
  const searchBox = el("div", { class: `w-search${store.query ? " is-filled" : ""}` }, [icon("search", "w-ico"), searchInput, searchClear]);
  searchInput.addEventListener("input", () => {
    store.query = searchInput.value;
    searchBox.classList.toggle("is-filled", Boolean(store.query));
    render();
  });
  searchClear.addEventListener("click", () => {
    store.query = "";
    searchInput.value = "";
    searchBox.classList.remove("is-filled");
    render();
  });

  const varietySelect = el("select", { class: "w-select", "aria-label": "Фильтр по сорту" });
  varietySelect.append(el("option", { value: "all", text: "Все сорта" }));
  for (const name of uniqueVarieties()) {
    const option = el("option", { value: name, text: name });
    if (store.variety === name) {
      option.selected = true;
    }
    varietySelect.append(option);
  }
  if (store.variety !== "all" && !uniqueVarieties().includes(store.variety)) {
    store.variety = "all";
    varietySelect.value = "all";
  }
  varietySelect.addEventListener("change", () => {
    store.variety = varietySelect.value;
    render();
  });

  const sortSelect = el("select", { class: "w-select", "aria-label": "Сортировка по дате" });
  [
    ["date-desc", "Сначала новые"],
    ["date-asc", "Сначала старые"]
  ].forEach(([value, text]) => {
    const option = el("option", { value, text });
    if (store.sort === value) {
      option.selected = true;
    }
    sortSelect.append(option);
  });
  sortSelect.addEventListener("change", () => {
    store.sort = sortSelect.value;
    render();
  });

  return el("div", { class: "w-toolbar" }, [
    searchBox,
    selectWrap(varietySelect),
    selectWrap(sortSelect),
    el("span", { class: "w-spacer" }),
    el("button", { class: "w-btn w-btn--secondary", type: "button", onclick: () => emit("nav", { view: "map" }) }, [
      icon("pin", "w-ico"), el("span", { text: "К карте" })
    ])
  ]);
}

async function confirmDelete(record) {
  const targetDate = parseISODate(record.target_date);
  const title = reportTitle(record);
  const ok = await confirmDialog({
    title: "Удалить отчёт",
    message: el("p", {}, [
      el("span", { text: `Удалить «${title}»${targetDate ? ` за ${formatFullDate(targetDate)}` : ""}? ` }),
      el("b", { text: "Скачанный набор метеоданных останется в разделе «Данные»." })
    ]),
    confirmLabel: "Удалить",
    danger: true
  });
  if (!ok) {
    return;
  }
  try {
    await deleteForecast(record.id);
    showToast("Отчёт удалён", "success");
    await refreshReports();
    emit("forecasts:changed");
  } catch {
    showToast("Не удалось удалить отчёт. Попробуйте ещё раз.", "error");
  }
}

function buildTable(rows) {
  const table = el("table", { class: "w-table" });
  const head = el("tr");
  ["Название", "Дата создания", "Сорт", "Координаты", "Прогнозный период", "Действия"].forEach((text, index) => {
    head.append(el("th", { scope: "col", class: index === 5 ? "w-th-plain w-td-right" : "w-th-plain", text }));
  });
  table.append(el("thead", {}, [head]));

  const body = el("tbody");
  for (const record of rows) {
    const open = () => emit("report:open", record);
    const titleLink = el("button", { class: "w-link", type: "button", text: reportTitle(record), onclick: open });
    const badges = el("div", { class: "w-cell-badges" }, [
      el("span", { class: "w-badge w-badge--demo", title: "Демонстрационные данные — не для агрономических решений" }, [
        el("i", { class: "w-dot" }), el("span", { text: "Демо" })
      ]),
      el("span", { class: "w-badge w-badge--period", text: `${record.range_months} мес` })
    ]);
    body.append(
      el("tr", {}, [
        el("td", {}, [titleLink, el("div", { class: "w-cell-sub", text: `#${shortId(record.id)}` }), badges]),
        el("td", { class: "w-num", text: formatDateTime(record.created_at) }),
        el("td", { text: String(record.variety_name || "").trim() || "—" }),
        el("td", { class: "w-num", text: coordText(record) }),
        el("td", { class: "w-num", text: recordPeriod(record) }),
        el("td", { class: "w-td-actions" }, [
          el("div", { class: "w-row-actions" }, [
            el("button", { class: "w-btn w-btn--sm w-btn--secondary", type: "button", text: "Открыть", onclick: open }),
            iconButton("trash", { label: `Удалить отчёт ${reportTitle(record)}`, className: "w-btn w-btn--sm w-btn--icon w-btn--danger-ghost", onclick: () => confirmDelete(record) })
          ])
        ])
      ])
    );
  }
  table.append(body);
  return el("section", { class: "w-panel" }, [el("div", { class: "w-table-scroll w-table-scroll--full" }, [table])]);
}

function render() {
  const token = ++renderToken;
  const view = document.getElementById("view-reports");
  requestAnimationFrame(() => {
    if (token !== renderToken || !rootNode) {
      return;
    }
    const wrap = el("div", { class: "w-page" });
    const count = store.rows.length;
    wrap.append(
      el("div", { class: "w-head" }, [
        el("div", {}, [
          el("h1", { class: "w-h1", text: "Отчёты" }),
          el("p", { class: "w-sub", text: count ? `${count} ${plural(count, "сохранённый отчёт", "сохранённых отчёта", "сохранённых отчётов")}` : "Архив сохранённых результатов прогноза" })
        ])
      ])
    );
    wrap.append(toolbarNode());

    if (store.error) {
      wrap.append(el("section", { class: "w-panel" }, [
        el("div", { class: "w-state" }, [
          el("span", { class: "w-state-ico" }, [icon("alert", "w-ico w-ico--lg")]),
          el("h3", { text: "Не удалось загрузить отчёты" }),
          el("p", { text: "Проверьте доступность базы данных и повторите попытку." }),
          el("div", { class: "w-state-actions" }, [
            el("button", { class: "w-btn w-btn--primary", type: "button", text: "Повторить", onclick: () => refreshReports() })
          ])
        ])
      ]));
    } else if (count === 0) {
      wrap.append(el("section", { class: "w-panel" }, [
        el("div", { class: "w-state" }, [
          el("span", { class: "w-state-ico" }, [icon("doc", "w-ico w-ico--lg")]),
          el("h3", { text: "Нет сохранённых отчётов" }),
          el("p", { text: "Постройте прогноз и сохраните его кнопкой «Сохранить отчёт»." }),
          el("div", { class: "w-state-actions" }, [
            el("button", { class: "w-btn w-btn--primary", type: "button", text: "К карте", onclick: () => emit("nav", { view: "map" }) })
          ])
        ])
      ]));
    } else {
      const rows = filteredRows();
      if (rows.length === 0) {
        wrap.append(el("section", { class: "w-panel" }, [
          el("div", { class: "w-state" }, [
            el("span", { class: "w-state-ico" }, [icon("search", "w-ico w-ico--lg")]),
            el("h3", { text: "Ничего не найдено" }),
            el("p", { text: "Измените запрос или сбросьте фильтры." }),
            el("div", { class: "w-state-actions" }, [
              el("button", {
                class: "w-btn w-btn--secondary",
                type: "button",
                text: "Сбросить фильтры",
                onclick: () => {
                  store.query = "";
                  store.variety = "all";
                  render();
                }
              })
            ])
          ])
        ]));
      } else {
        wrap.append(buildTable(rows));
      }
    }

    rootNode.replaceChildren(wrap);
    if (view) {
      view.scrollTop = store.scroll;
    }
  });
}

export async function refreshReports() {
  if (!rootNode) {
    return;
  }
  store.error = false;
  try {
    store.rows = await listForecasts(500);
  } catch {
    store.error = true;
  }
  render();
}

export async function initReportsPage() {
  rootNode = document.getElementById("reports-root");
  const view = document.getElementById("view-reports");
  if (view && !view.dataset.reportsBound) {
    view.dataset.reportsBound = "1";
    view.addEventListener("scroll", () => {
      store.scroll = view.scrollTop;
    }, { passive: true });
  }
  await refreshReports();
}
