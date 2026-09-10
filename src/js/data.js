import {
  el, emit, escapeCsvCell, formatDateTime, formatPeriod, formatDecimalOrDash,
  plural, shortId, downloadTextFile, formatShortDate, parseISODate
} from "./util.js";
import { icon, iconButton } from "./icons.js";
import { confirmDialog, showToast } from "./ui.js";
import { listDatasets, getDataset, deleteDataset, clearAllDatasets, unpackForecast } from "./db.js";

const PAGE_SIZE = 31;
const DAY_COLUMNS = [
  { key: "date", label: "Дата", sortable: true },
  { key: "tMin", label: "Т мин, °C", sortable: true },
  { key: "tMax", label: "Т макс, °C", sortable: true },
  { key: "tMean", label: "Т сред, °C", sortable: true },
  { key: "precip", label: "Осадки, мм", sortable: true },
  { key: "humidity", label: "Влажность, %", sortable: true },
  { key: "soilMoisture", label: "Влажн. почвы, %", sortable: true }
];

const store = {
  rows: [],
  query: "",
  range: "all",
  sort: "date-desc",
  error: false,
  openId: null,
  openRecord: null,
  openForecast: null,
  openBroken: false,
  openLoading: false,
  detailScroll: 0,
  daySortKey: "date",
  daySortDir: 1,
  page: 1,
  listScroll: 0
};

let rootNode = null;
let renderToken = 0;

function coordText(lat, lon) {
  return `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`;
}

function datasetTitle(row) {
  return row.variety_name || "Без сорта";
}

function filteredRows() {
  const q = store.query.trim().toLowerCase();
  let rows = store.rows;
  if (q) {
    rows = rows.filter((row) =>
      datasetTitle(row).toLowerCase().includes(q) ||
      coordText(row.lat, row.lon).includes(q) ||
      shortId(row.id).toLowerCase().includes(q)
    );
  }
  if (store.range !== "all") {
    rows = rows.filter((row) => Number(row.range_months) === Number(store.range));
  }
  const sorted = [...rows];
  if (store.sort === "date-desc") {
    sorted.sort((a, b) => b.created_at - a.created_at);
  } else if (store.sort === "date-asc") {
    sorted.sort((a, b) => a.created_at - b.created_at);
  } else if (store.sort === "records-desc") {
    sorted.sort((a, b) => Number(b.record_count) - Number(a.record_count));
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

function toolbarNode(rerender) {
  const searchInput = el("input", {
    class: "w-input",
    type: "text",
    placeholder: "Поиск: сорт, координаты, номер…",
    value: store.query,
    "aria-label": "Поиск по наборам данных"
  });
  const searchClear = el("button", { class: "w-search-clear", type: "button", "aria-label": "Очистить поиск" }, [icon("close", "w-ico")]);
  const searchBox = el("div", { class: `w-search${store.query ? " is-filled" : ""}` }, [icon("search", "w-ico"), searchInput, searchClear]);
  searchInput.addEventListener("input", () => {
    store.query = searchInput.value;
    searchBox.classList.toggle("is-filled", Boolean(store.query));
    rerender();
  });
  searchClear.addEventListener("click", () => {
    store.query = "";
    searchInput.value = "";
    searchBox.classList.remove("is-filled");
    rerender();
  });

  const rangeSelect = el("select", { class: "w-select", "aria-label": "Фильтр по дальности прогноза" });
  [
    ["all", "Любой период"],
    ["1", "1 месяц"],
    ["3", "3 месяца"],
    ["6", "6 месяцев"]
  ].forEach(([value, text]) => {
    const option = el("option", { value, text });
    if (store.range === value) {
      option.selected = true;
    }
    rangeSelect.append(option);
  });
  const sortSelect = el("select", { class: "w-select", "aria-label": "Сортировка списков" });
  [
    ["date-desc", "Сначала новые"],
    ["date-asc", "Сначала старые"],
    ["records-desc", "Больше записей"]
  ].forEach(([value, text]) => {
    const option = el("option", { value, text });
    if (store.sort === value) {
      option.selected = true;
    }
    sortSelect.append(option);
  });
  rangeSelect.addEventListener("change", () => {
    store.range = rangeSelect.value;
    rerender();
  });
  sortSelect.addEventListener("change", () => {
    store.sort = sortSelect.value;
    rerender();
  });

  return el("div", { class: "w-toolbar" }, [
    searchBox,
    selectWrap(rangeSelect),
    selectWrap(sortSelect),
    el("span", { class: "w-spacer" }),
    el("button", { class: "w-btn w-btn--danger-ghost", type: "button", onclick: () => confirmClearAll() }, [
      icon("trash", "w-ico"),
      el("span", { text: "Очистить все наборы" })
    ])
  ]);
}

function stateBlock({ iconName, title, text, actions = [] }) {
  return el("div", { class: "w-state" }, [
    el("span", { class: "w-state-ico" }, [icon(iconName, "w-ico w-ico--lg")]),
    el("h3", { text: title }),
    text ? el("p", { text }) : null,
    actions.length ? el("div", { class: "w-state-actions" }, actions) : null
  ]);
}

async function confirmClearAll() {
  const count = store.rows.length;
  if (count === 0) {
    return;
  }
  const ok = await confirmDialog({
    title: "Очистить все наборы",
    message: `Удалить все скачанные метеонаборы (${count} ${plural(count, "набор", "набора", "наборов")})? Сохранённые отчёты не будут удалены. Это действие нельзя отменить.`,
    confirmLabel: "Очистить всё",
    danger: true
  });
  if (!ok) {
    return;
  }
  try {
    await clearAllDatasets();
    showToast("Все наборы удалены", "success");
  } catch {
    showToast("Не удалось очистить данные. Попробуйте ещё раз.", "error");
  }
  store.openId = null;
  store.openRecord = null;
  await refreshData();
}

async function confirmDeleteRow(row) {
  const title = row.variety_name != null || row.lat != null
    ? `«${datasetTitle(row)} · ${coordText(row.lat, row.lon)}» за ${formatPeriod(row.period_start, row.period_end)}`
    : `#${shortId(row.id)}`;
  const ok = await confirmDialog({
    title: "Удалить набор данных",
    message: el("p", {}, [
      el("span", { text: `Удалить набор ${title}? ` }),
      el("b", { text: "Сохранённые отчёты не будут удалены." })
    ]),
    confirmLabel: "Удалить",
    danger: true
  });
  if (!ok) {
    return;
  }
  try {
    await deleteDataset(row.id);
    showToast("Набор удалён", "success");
    if (store.openId === row.id) {
      closeDetail(true);
    }
    await refreshData();
  } catch {
    showToast("Не удалось удалить набор. Попробуйте ещё раз.", "error");
  }
}

function buildListTable(rows) {
  const table = el("table", { class: "w-table" });
  const head = el("tr");
  [
    ["Набор", false], ["Точка", false], ["Период", false], ["Дальность", false],
    ["Источник", false], ["Записей", true], ["Загружен", false], ["Действия", true]
  ].forEach(([text, right]) => {
    head.append(el("th", { scope: "col", class: right ? "w-th-plain w-td-right" : "w-th-plain", text }));
  });
  table.append(el("thead", {}, [head]));

  const body = el("tbody");
  for (const row of rows) {
    const titleLink = el("button", { class: "w-link", type: "button", text: datasetTitle(row), onclick: () => openDetail(row.id) });
    const demoBadge = el("span", {
      class: "w-badge w-badge--demo",
      title: "Данные построены демонстрационным движком, это не реальные наблюдения"
    }, [el("i", { class: "w-dot" }), el("span", { text: "Демо" })]);
    const tr = el("tr", {}, [
      el("td", {}, [titleLink, el("div", { class: "w-cell-sub", text: `#${shortId(row.id)}` })]),
      el("td", { class: "w-num", text: coordText(row.lat, row.lon) }),
      el("td", { class: "w-num", text: formatPeriod(row.period_start, row.period_end) }),
      el("td", {}, [el("span", { class: "w-badge w-badge--period", text: `${row.range_months} мес` })]),
      el("td", {}, [demoBadge]),
      el("td", { class: "w-num w-td-right", text: String(row.record_count) }),
      el("td", { class: "w-num", text: formatDateTime(row.created_at) }),
      el("td", { class: "w-td-actions" }, [
        el("div", { class: "w-row-actions" }, [
          el("button", { class: "w-btn w-btn--sm w-btn--secondary", type: "button", text: "Открыть", onclick: () => openDetail(row.id) }),
          iconButton("trash", { label: `Удалить набор ${datasetTitle(row)}`, className: "w-btn w-btn--sm w-btn--icon w-btn--danger-ghost", onclick: () => confirmDeleteRow(row) })
        ])
      ])
    ]);
    tr.addEventListener("dblclick", () => openDetail(row.id));
    body.append(tr);
  }
  table.append(body);
  return el("section", { class: "w-panel" }, [el("div", { class: "w-table-scroll w-table-scroll--full" }, [table])]);
}

function sortedDayRows(forecast) {
  const key = store.daySortKey;
  const dir = store.daySortDir;
  const rows = [...(forecast.series || [])];
  rows.sort((a, b) => {
    if (key === "date") {
      return dir * String(a.date).localeCompare(String(b.date));
    }
    const av = Number(a[key]);
    const bv = Number(b[key]);
    const aBad = !Number.isFinite(av);
    const bBad = !Number.isFinite(bv);
    if (aBad && bBad) {
      return 0;
    }
    if (aBad) {
      return 1;
    }
    if (bBad) {
      return -1;
    }
    return dir * (av - bv);
  });
  return rows;
}

function formatDayCell(column, day) {
  if (column.key === "date") {
    const date = parseISODate(day.date);
    return date ? formatShortDate(date) : String(day.date || "—");
  }
  const digits = column.key === "precip" || column.key === "tMin" || column.key === "tMax" || column.key === "tMean" ? 1 : 0;
  return formatDecimalOrDash(day[column.key], digits);
}

function dayTablePanel(forecast) {
  const rerender = () => render();
  const rows = sortedDayRows(forecast);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (store.page > pageCount) {
    store.page = pageCount;
  }
  if (store.page < 1) {
    store.page = 1;
  }
  const pageRows = rows.slice((store.page - 1) * PAGE_SIZE, store.page * PAGE_SIZE);

  const table = el("table", { class: "w-table" });
  const head = el("tr");
  for (const column of DAY_COLUMNS) {
    const th = el("th", { scope: "col", class: column.key === "date" ? "" : "w-td-right" });
    const active = store.daySortKey === column.key;
    if (active) {
      th.setAttribute("aria-sort", store.daySortDir === 1 ? "ascending" : "descending");
    }
    const button = el("button", { class: "w-th", type: "button", title: `Сортировать: ${column.label}` });
    button.append(el("span", { text: column.label }));
    if (column.sortable) {
      button.append(icon(active ? (store.daySortDir === 1 ? "sortUp" : "sortDown") : "sortUp", "w-ico w-th-ico"));
    }
    if (column.sortable) {
      button.addEventListener("click", () => {
        if (store.daySortKey === column.key) {
          store.daySortDir = -store.daySortDir;
        } else {
          store.daySortKey = column.key;
          store.daySortDir = column.key === "date" ? 1 : -1;
        }
        rerender();
      });
    }
    th.append(button);
    head.append(th);
  }
  table.append(el("thead", {}, [head]));

  const body = el("tbody");
  for (const day of pageRows) {
    body.append(el("tr", {}, DAY_COLUMNS.map((column) =>
      el("td", { class: column.key === "date" ? "w-cell-nowrap" : "w-num w-td-right", text: formatDayCell(column, day) })
    )));
  }
  table.append(body);

  const pager = el("div", { class: "w-pager" }, [
    iconButton("chevronLeft", {
      label: "Предыдущая страница",
      className: "w-btn w-btn--sm w-btn--icon w-btn--secondary",
      onclick: () => {
        if (store.page > 1) {
          store.page -= 1;
          rerender();
        }
      }
    }),
    el("span", { class: "w-num", text: `стр. ${store.page} из ${pageCount} · ${rows.length} ${plural(rows.length, "запись", "записи", "записей")}` }),
    iconButton("chevronRight", {
      label: "Следующая страница",
      className: "w-btn w-btn--sm w-btn--icon w-btn--secondary",
      onclick: () => {
        if (store.page < pageCount) {
          store.page += 1;
          rerender();
        }
      }
    })
  ]);

  return el("section", { class: "w-panel" }, [
    el("div", { class: "w-panel-head" }, [
      el("h2", { class: "w-h2", text: "Дневные записи" }),
      el("span", { class: "w-count", text: "Значения за сутки" })
    ]),
    el("div", { class: "w-table-scroll" }, [table]),
    el("div", { class: "w-panel-foot" }, [pager, el("span", { text: "«—» означает отсутствие значения" })])
  ]);
}

function exportCsv(record, forecast) {
  const header = [
    "Дата", "Температура минимальная, °C", "Температура максимальная, °C",
    "Температура средняя, °C", "Осадки, мм", "Влажность воздуха, %", "Влажность почвы, %"
  ];
  const lines = [header];
  for (const day of forecast.series || []) {
    lines.push([
      day.date || "",
      Number.isFinite(Number(day.tMin)) ? day.tMin : "",
      Number.isFinite(Number(day.tMax)) ? day.tMax : "",
      Number.isFinite(Number(day.tMean)) ? day.tMean : "",
      Number.isFinite(Number(day.precip)) ? day.precip : "",
      Number.isFinite(Number(day.humidity)) ? day.humidity : "",
      Number.isFinite(Number(day.soilMoisture)) ? day.soilMoisture : ""
    ]);
  }
  const text = "\uFEFF" + lines.map((line) => line.map(escapeCsvCell).join(";")).join("\r\n");
  downloadTextFile(`meteo_${record.period_start || "data"}_${record.period_end || ""}.csv`, text);
  showToast("Файл CSV сохранён", "success");
}

function buildDetailView() {
  const record = store.openRecord;
  const forecast = store.openForecast;
  const wrap = el("div", { class: "w-page" });

  wrap.append(
    el("div", { class: "w-toolbar", style: "margin:0 0 12px" }, [
      el("button", { class: "w-btn w-btn--ghost w-btn--sm", type: "button", onclick: () => closeDetail() }, [
        icon("back", "w-ico"), el("span", { text: "К списку наборов" })
      ])
    ])
  );

  wrap.append(
    el("div", { class: "w-head", style: "margin-bottom:14px" }, [
      el("div", {}, [
        el("h1", { class: "w-h1", text: datasetTitle(record) }),
        el("p", { class: "w-sub", text: `#${shortId(record.id)} · загружен ${formatDateTime(record.created_at)}` })
      ]),
      el("div", { class: "w-head-actions" }, [
        el("button", { class: "w-btn w-btn--secondary", type: "button", onclick: () => exportCsv(record, forecast) }, [
          icon("download", "w-ico"), el("span", { text: "Скачать CSV" })
        ]),
        el("button", { class: "w-btn w-btn--danger-ghost", type: "button", onclick: () => confirmDeleteRow(record) }, [
          icon("trash", "w-ico"), el("span", { text: "Удалить" })
        ])
      ])
    ])
  );

  wrap.append(
    el("div", { class: "w-panel w-detail-meta" }, [
      el("div", { class: "w-chips" }, [
        el("div", { class: "w-chip" }, [el("b", { text: "Точка" }), el("span", { text: coordText(record.lat, record.lon) })]),
        el("div", { class: "w-chip" }, [el("b", { text: "Период" }), el("span", { text: formatPeriod(record.period_start, record.period_end) })]),
        el("div", { class: "w-chip" }, [el("b", { text: "Дальность" }), el("span", { text: `${record.range_months} мес` })]),
        el("div", { class: "w-chip" }, [el("b", { text: "Записей" }), el("span", { text: String(record.record_count) })]),
        el("div", { class: "w-chip" }, [el("b", { text: "Источник" }), el("span", { text: "Демонстрационный движок" })]),
        el("span", { class: "w-badge w-badge--demo", title: "Не реальные наблюдения" }, [el("i", { class: "w-dot" }), el("span", { text: "Демонстрационные данные" })])
      ])
    ])
  );

  wrap.append(dayTablePanel(forecast));
  return wrap;
}

function buildListView() {
  const wrap = el("div", { class: "w-page" });
  const count = store.rows.length;
  const subText = count
    ? `${count} ${plural(count, "набор", "набора", "наборов")} · демонстрационный движок`
    : "Метеонаборы, скачанные для расчёта прогнозов";

  wrap.append(
    el("div", { class: "w-head" }, [
      el("div", {}, [
        el("h1", { class: "w-h1", text: "Данные" }),
        el("p", { class: "w-sub", text: subText })
      ])
    ])
  );
  wrap.append(toolbarNode(() => render()));

  if (store.error) {
    wrap.append(el("section", { class: "w-panel" }, [
      stateBlock({
        iconName: "alert",
        title: "Не удалось прочитать данные",
        text: "Проверьте доступность базы данных и повторите попытку.",
        actions: [el("button", { class: "w-btn w-btn--primary", type: "button", text: "Повторить", onclick: () => refreshData() })]
      })
    ]));
    return wrap;
  }

  if (store.rows.length === 0) {
    wrap.append(el("section", { class: "w-panel" }, [
      stateBlock({
        iconName: "database",
        title: "Нет сохранённых метеонаборов",
        text: "Наборы появляются здесь после расчёта прогноза на карте.",
        actions: [el("button", { class: "w-btn w-btn--primary", type: "button", text: "К карте", onclick: () => emit("nav", { view: "map" }) })]
      })
    ]));
    return wrap;
  }

  const rows = filteredRows();
  if (rows.length === 0) {
    wrap.append(el("section", { class: "w-panel" }, [
      stateBlock({
        iconName: "search",
        title: "Ничего не найдено",
        text: "Измените запрос или сбросьте фильтры.",
        actions: [el("button", {
          class: "w-btn w-btn--secondary",
          type: "button",
          text: "Сбросить фильтры",
          onclick: () => {
            store.query = "";
            store.range = "all";
            render();
          }
        })]
      })
    ]));
    return wrap;
  }

  wrap.append(buildListTable(rows));
  return wrap;
}

function loadingBlock() {
  return el("div", { class: "w-page" }, [
    el("div", { class: "w-toolbar", style: "margin:0 0 12px" }, [
      el("button", { class: "w-btn w-btn--ghost w-btn--sm", type: "button", onclick: () => closeDetail() }, [
        icon("back", "w-ico"), el("span", { text: "К списку наборов" })
      ])
    ]),
    el("div", { class: "w-panel w-panel--pad" }, [
      el("div", { class: "w-skeleton", style: "width:220px; height:18px" }),
      el("div", { style: "height:10px" }),
      el("div", { class: "w-skeleton", style: "width:70%" }),
      el("div", { style: "height:8px" }),
      el("div", { class: "w-skeleton", style: "width:90%" }),
      el("div", { style: "height:8px" }),
      el("div", { class: "w-skeleton", style: "width:90%" })
    ])
  ]);
}

function brokenBlock() {
  const wrap = el("div", { class: "w-page" }, [
    el("div", { class: "w-toolbar", style: "margin:0 0 12px" }, [
      el("button", { class: "w-btn w-btn--ghost w-btn--sm", type: "button", onclick: () => closeDetail() }, [
        icon("back", "w-ico"), el("span", { text: "К списку наборов" })
      ])
    ]),
    el("section", { class: "w-panel" }, [
      stateBlock({
        iconName: "alert",
        title: "Запись повреждена",
        text: "Не удалось прочитать содержимое набора. Остальные данные не затронуты — набор можно удалить и получить заново.",
        actions: [el("button", {
          class: "w-btn w-btn--danger",
          type: "button",
          text: "Удалить набор",
          onclick: () => confirmDeleteRow({ id: store.openId, lat: null, lon: null, variety_name: null, period_start: null, period_end: null })
        })]
      })
    ])
  ]);
  return wrap;
}

function render() {
  const token = ++renderToken;
  const view = document.getElementById("view-data");
  requestAnimationFrame(() => {
    if (token !== renderToken || !rootNode) {
      return;
    }
    let content;
    if (store.openId) {
      if (store.openLoading) {
        content = loadingBlock();
      } else if (store.openBroken || !store.openForecast) {
        content = brokenBlock();
      } else {
        content = buildDetailView();
      }
    } else {
      content = buildListView();
    }
    rootNode.replaceChildren(content);
    if (view) {
      view.scrollTop = store.openId ? store.detailScroll : store.listScroll;
    }
  });
}

function closeDetail(keepScroll) {
  store.openId = null;
  store.openRecord = null;
  store.openForecast = null;
  store.openBroken = false;
  store.openLoading = false;
  if (keepScroll) {
    store.listScroll = 0;
  }
  render();
}

async function openDetail(id) {
  store.openId = id;
  store.openRecord = null;
  store.openForecast = null;
  store.openBroken = false;
  store.openLoading = true;
  store.page = 1;
  store.daySortKey = "date";
  store.daySortDir = 1;
  render();
  try {
    const record = await getDataset(id);
    if (store.openId !== id) {
      return;
    }
    if (!record) {
      store.openBroken = true;
      store.openLoading = false;
      render();
      return;
    }
    const forecast = unpackForecast(record.data_json);
    store.openRecord = record;
    store.openForecast = forecast;
    store.openBroken = !forecast;
    store.openLoading = false;
    render();
  } catch {
    if (store.openId !== id) {
      return;
    }
    store.openBroken = true;
    store.openLoading = false;
    render();
  }
}

export async function refreshData() {
  store.error = false;
  try {
    store.rows = await listDatasets(500);
    if (store.openId && !store.rows.some((row) => row.id === store.openId)) {
      store.openId = null;
      store.openRecord = null;
      store.openForecast = null;
      store.openBroken = false;
      store.openLoading = false;
    }
  } catch {
    store.error = true;
  }
  render();
}

export async function initDataPage() {
  rootNode = document.getElementById("data-root");
  const view = document.getElementById("view-data");
  if (view && !view.dataset.dataBound) {
    view.dataset.dataBound = "1";
    view.addEventListener("scroll", () => {
      if (store.openId) {
        store.detailScroll = view.scrollTop;
      } else {
        store.listScroll = view.scrollTop;
      }
    }, { passive: true });
  }
  await refreshData();
}
