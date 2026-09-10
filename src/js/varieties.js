import { el, emit, debounce, formatShortDate, parseISODate, plural } from "./util.js";
import { icon, iconButton } from "./icons.js";
import { confirmDialog, openDialog, showToast } from "./ui.js";
import { listVarieties, createVariety, updateVariety, deleteVariety } from "./db.js";

const store = {
  rows: [],
  query: "",
  ripening: "all",
  error: false,
  selectedId: null,
  scroll: 0
};

let rootNode = null;
let renderToken = 0;

function ripeningLabel(fao) {
  const value = Number(fao);
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (value < 200) {
    return "Очень ранний";
  }
  if (value < 300) {
    return "Раннеспелый";
  }
  if (value < 400) {
    return "Среднеранний";
  }
  if (value < 500) {
    return "Среднеспелый";
  }
  return "Позднеспелый";
}

const RIPENING_OPTIONS = [
  ["all", "Все группы"],
  ["very-early", "Очень ранние (ФАО < 200)"],
  ["early", "Раннеспелые (200–299)"],
  ["mid-early", "Среднеранние (300–399)"],
  ["mid", "Среднеспелые (400–499)"],
  ["late", "Позднеспелые (500+)"]
];

function ripeningMatch(fao, key) {
  const value = Number(fao);
  if (key === "all" || !Number.isFinite(value)) {
    return key === "all";
  }
  if (key === "very-early") {
    return value < 200;
  }
  if (key === "early") {
    return value >= 200 && value < 300;
  }
  if (key === "mid-early") {
    return value >= 300 && value < 400;
  }
  if (key === "mid") {
    return value >= 400 && value < 500;
  }
  return value >= 500;
}

function filteredRows() {
  const q = store.query.trim().toLowerCase();
  let rows = store.rows;
  if (q) {
    rows = rows.filter((row) => String(row.name || "").toLowerCase().includes(q));
  }
  if (store.ripening !== "all") {
    rows = rows.filter((row) => ripeningMatch(row.fao, store.ripening));
  }
  return rows;
}

function numberValue(value, digits = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "—";
  }
  return num.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
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
    placeholder: "Поиск по названию…",
    value: store.query,
    "aria-label": "Поиск по названию сорта"
  });
  const searchClear = el("button", { class: "w-search-clear", type: "button", "aria-label": "Очистить поиск" }, [icon("close", "w-ico")]);
  const searchBox = el("div", { class: `w-search${store.query ? " is-filled" : ""}` }, [icon("search", "w-ico"), searchInput, searchClear]);
  searchInput.addEventListener("input", debounce(() => {
    store.query = searchInput.value;
    searchBox.classList.toggle("is-filled", Boolean(store.query));
    render();
  }, 120));
  searchClear.addEventListener("click", () => {
    store.query = "";
    searchInput.value = "";
    searchBox.classList.remove("is-filled");
    render();
  });

  const ripeningSelect = el("select", { class: "w-select", "aria-label": "Фильтр по группе спелости" });
  for (const [value, text] of RIPENING_OPTIONS) {
    const option = el("option", { value, text });
    if (store.ripening === value) {
      option.selected = true;
    }
    ripeningSelect.append(option);
  }
  ripeningSelect.addEventListener("change", () => {
    store.ripening = ripeningSelect.value;
    render();
  });

  return el("div", { class: "w-toolbar" }, [
    searchBox,
    selectWrap(ripeningSelect),
    el("span", { class: "w-spacer" }),
    el("button", { class: "w-btn w-btn--primary", type: "button", onclick: () => openForm(null) }, [
      icon("plus", "w-ico"), el("span", { text: "Добавить сорт" })
    ])
  ]);
}

function meterRow(label, value, max, variant) {
  const num = Number(value);
  const width = Number.isFinite(num) ? Math.max(0, Math.min(100, (num / max) * 100)) : 0;
  return el("div", { class: `w-meter ${variant ? `w-meter--${variant}` : ""}` }, [
    el("span", { class: "w-meter-label", text: label }),
    el("div", { class: "w-meter-track" }, [el("div", { class: "w-meter-fill", style: `width:${width}%` })]),
    el("span", { class: "w-meter-value", text: Number.isFinite(num) ? `${num}` : "—" })
  ]);
}

function kvRow(key, value) {
  return [el("dt", { text: key }), el("dd", { text: value })];
}

function buildDetail(variety) {
  const body = el("div", { class: "w-detail-body" });

  const summary = el("dl", { class: "w-kv" });
  summary.append(
    ...kvRow("Группа спелости", ripeningLabel(variety.fao)),
    ...kvRow("ФАО", numberValue(variety.fao)),
    ...kvRow("Урожайность", `${numberValue(variety.yield, 1)} ц/га`)
  );
  body.append(el("div", { class: "w-group" }, [el("div", { class: "w-group-title", text: "Основные" }), summary]));

  const temps = el("dl", { class: "w-kv" });
  temps.append(
    ...kvRow("Σ активных температур", `${numberValue(variety.gdd)} °C·сут`),
    ...kvRow("ГТК", numberValue(variety.gtk, 2))
  );
  body.append(el("div", { class: "w-group" }, [el("div", { class: "w-group-title", text: "Требования к теплу и влаге" }), temps]));

  const resistance = el("div", {}, [
    meterRow("Засухоустойчивость", variety.drought, 10),
    meterRow("Холодостойкость", variety.cold, 10, "blue")
  ]);
  body.append(el("div", { class: "w-group" }, [el("div", { class: "w-group-title", text: "Устойчивость (1–10)" }), resistance]));

  const description = String(variety.description || "").trim();
  if (description) {
    body.append(el("div", { class: "w-group" }, [
      el("div", { class: "w-group-title", text: "Примечания" }),
      el("p", { style: "margin:0; font-size:13.5px; line-height:1.55; overflow-wrap:anywhere;", text: description })
    ]));
  }

  const created = variety.created_at ? parseISODate(variety.created_at) : null;
  const updated = variety.updated_at ? parseISODate(variety.updated_at) : null;
  const dates = [];
  if (created) {
    dates.push(`Создан ${formatShortDate(created)}`);
  }
  if (updated && created && updated.getTime() !== created.getTime()) {
    dates.push(` · изменён ${formatShortDate(updated)}`);
  }

  const head = el("div", { class: "w-detail-head" }, [
    el("div", { style: "display:flex;align-items:flex-start;gap:10px" }, [
      el("div", { style: "min-width:0;flex:1" }, [
        el("div", { class: "w-detail-name", text: variety.name }),
        el("div", { class: "w-detail-badges" }, [
          el("span", { class: "w-badge w-badge--period", text: `ФАО ${numberValue(variety.fao)}` }),
          el("span", { class: "w-badge w-badge--period", text: ripeningLabel(variety.fao) })
        ])
      ]),
      iconButton("close", {
        label: "Свернуть карточку",
        className: "w-btn w-btn--sm w-btn--icon w-btn--ghost",
        onclick: () => {
          store.selectedId = null;
          render();
        }
      })
    ])
  ]);

  const foot = el("div", { class: "w-detail-foot" }, [
    el("span", { class: "w-cell-sub", text: dates.join("") || "—" }),
    el("div", { class: "w-row-actions" }, [
      el("button", { class: "w-btn w-btn--sm w-btn--secondary", type: "button", onclick: () => openForm(variety) }, [
        icon("edit", "w-ico"), el("span", { text: "Редактировать" })
      ]),
      el("button", { class: "w-btn w-btn--sm w-btn--danger-ghost", type: "button", onclick: () => confirmDelete(variety) }, [
        icon("trash", "w-ico"), el("span", { text: "Удалить" })
      ])
    ])
  ]);

  return el("section", { class: "w-panel w-detail-card", "aria-label": "Карточка сорта" }, [head, body, foot]);
}

function buildListTable(rows) {
  const table = el("table", { class: "w-table" });
  const head = el("tr");
  [
    ["Сорт", false], ["Созревание", false], ["САТ, °C·сут", true], ["ГТК", true], ["Урож., ц/га", true], ["", true]
  ].forEach(([text, right]) => {
    head.append(el("th", { scope: "col", class: right ? "w-th-plain w-td-right" : "w-th-plain", text }));
  });
  table.append(el("thead", {}, [head]));

  const body = el("tbody");
  for (const variety of rows) {
    const tr = el("tr", { class: store.selectedId === variety.id ? "is-selected" : "" });
    const titleButton = el("button", { class: "w-link", type: "button", text: variety.name, onclick: () => selectVariety(variety.id) });
    tr.append(
      el("td", {}, [titleButton]),
      el("td", {}, [
        el("div", { text: ripeningLabel(variety.fao) }),
        el("div", { class: "w-cell-sub", text: `ФАО ${numberValue(variety.fao)}` })
      ]),
      el("td", { class: "w-num w-td-right", text: numberValue(variety.gdd) }),
      el("td", { class: "w-num w-td-right", text: numberValue(variety.gtk, 2) }),
      el("td", { class: "w-num w-td-right", text: numberValue(variety.yield, 1) }),
      el("td", { class: "w-td-actions" }, [
        el("div", { class: "w-row-actions" }, [
          iconButton("edit", { label: `Редактировать сорт ${variety.name}`, className: "w-btn w-btn--sm w-btn--icon w-btn--secondary", onclick: () => openForm(variety) }),
          iconButton("trash", { label: `Удалить сорт ${variety.name}`, className: "w-btn w-btn--sm w-btn--icon w-btn--danger-ghost", onclick: () => confirmDelete(variety) })
        ])
      ])
    );
    tr.addEventListener("click", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      selectVariety(variety.id);
    });
    body.append(tr);
  }
  table.append(body);
  return el("section", { class: "w-panel" }, [el("div", { class: "w-table-scroll w-table-scroll--full" }, [table])]);
}

function selectVariety(id) {
  store.selectedId = store.selectedId === id ? null : id;
  render();
}

async function refresh() {
  store.error = false;
  try {
    store.rows = await listVarieties();
  } catch {
    store.error = true;
  }
  if (!store.error && store.rows.length > 0 && !store.rows.some((row) => row.id === store.selectedId)) {
    store.selectedId = store.rows[0].id;
  }
  render();
}

function render() {
  const token = ++renderToken;
  const view = document.getElementById("view-varieties");
  requestAnimationFrame(() => {
    if (token !== renderToken || !rootNode) {
      return;
    }
    const wrap = el("div", { class: "w-page" });
    const count = store.rows.length;
    wrap.append(
      el("div", { class: "w-head" }, [
        el("div", {}, [
          el("h1", { class: "w-h1", text: "Сорта кукурузы" }),
          el("p", { class: "w-sub", text: count ? `${count} ${plural(count, "сорт", "сорта", "сортов")} в справочнике` : "Справочник сортов используется при прогнозировании" })
        ])
      ])
    );
    wrap.append(toolbarNode());

    if (store.error) {
      wrap.append(el("section", { class: "w-panel" }, [
        el("div", { class: "w-state" }, [
          el("span", { class: "w-state-ico" }, [icon("alert", "w-ico w-ico--lg")]),
          el("h3", { text: "Не удалось загрузить сорта" }),
          el("p", { text: "Проверьте доступность базы данных и повторите попытку." }),
          el("div", { class: "w-state-actions" }, [
            el("button", { class: "w-btn w-btn--primary", type: "button", text: "Повторить", onclick: () => refresh() })
          ])
        ])
      ]));
    } else if (count === 0) {
      wrap.append(el("section", { class: "w-panel" }, [
        el("div", { class: "w-state" }, [
          el("span", { class: "w-state-ico" }, [icon("sprout", "w-ico w-ico--lg")]),
          el("h3", { text: "Сортов пока нет" }),
          el("p", { text: "Добавьте первый сорт, чтобы выбирать его при прогнозировании." }),
          el("div", { class: "w-state-actions" }, [
            el("button", { class: "w-btn w-btn--primary", type: "button", text: "Добавить сорт", onclick: () => openForm(null) }, )
          ])
        ])
      ]));
    } else {
      const rows = filteredRows();
      const selected = rows.find((row) => row.id === store.selectedId) || null;
      if (rows.length === 0) {
        wrap.append(el("section", { class: "w-panel" }, [
          el("div", { class: "w-state" }, [
            el("span", { class: "w-state-ico" }, [icon("search", "w-ico w-ico--lg")]),
            el("h3", { text: "Ничего не найдено" }),
            el("p", { text: "Измените запрос или сбросьте фильтры." }),
            el("div", { class: "w-state-actions" }, [
              el("button", {
                class: "w-btn w-btn--secondary", type: "button", text: "Сбросить фильтры",
                onclick: () => {
                  store.query = "";
                  store.ripening = "all";
                  render();
                }
              })
            ])
          ])
        ]));
      } else if (selected) {
        wrap.append(el("div", { class: "w-split" }, [
          el("div", { class: "w-col", style: "min-width:0" }, [buildListTable(rows)]),
          buildDetail(selected)
        ]));
      } else {
        const list = buildListTable(rows);
        wrap.append(list);
      }
    }

    rootNode.replaceChildren(wrap);
    if (view) {
      view.scrollTop = store.scroll;
    }
  });
}

function updateRangeFill(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const pos = ((Number(input.value) - min) / (max - min || 1)) * 100;
  input.style.setProperty("--range-pos", `${pos}%`);
}

function buildField({ labelText, required = false, hint, control, errorNode, full = false }) {
  const id = `fld-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  const label = el("label", { class: "w-label", for: id }, [
    el("span", { text: labelText }),
    required ? el("span", { class: "w-req", text: "*", "aria-hidden": "true" }) : null
  ]);
  if (required) {
    control.setAttribute("aria-required", "true");
  }
  return el("div", { class: `w-field ${full ? "w-full" : ""}` }, [
    label,
    control,
    errorNode || el("span", { class: "w-field-error" }),
    hint ? el("span", { class: "w-hintline", text: hint }) : null
  ]);
}

function confirmDelete(variety) {
  confirmDialog({
    title: "Удалить сорт",
    message: el("p", {}, [
      el("span", { text: `Удалить сорт «${variety.name}» из справочника? ` }),
      el("b", { text: "Сохранённые отчёты не изменятся — они хранят свои копии данных." })
    ]),
    confirmLabel: "Удалить",
    danger: true
  }).then(async (ok) => {
    if (!ok) {
      return;
    }
    try {
      const result = await deleteVariety(variety.id);
      if (!result.ok) {
        throw new Error("not found");
      }
      showToast("Сорт удалён", "success");
      if (store.selectedId === variety.id) {
        store.selectedId = null;
      }
      await refresh();
      emit("varieties:changed");
    } catch {
      showToast("Не удалось удалить сорт. Попробуйте ещё раз.", "error");
    }
  });
}

function openForm(variety) {
  const isEdit = Boolean(variety);
  const initial = variety || { name: "", fao: 300, gtk: 1, gdd: 1400, drought: 5, cold: 5, yield: 90, description: "" };

  const nameInput = el("input", { class: "w-input", type: "text", value: String(initial.name || ""), maxlength: "60", placeholder: "Например, Днепровский 181 СВ", autocomplete: "off" });
  const faoInput = el("input", { class: "w-input", type: "text", inputmode: "numeric", maxlength: "6", value: String(initial.fao ?? "") });
  const gddInput = el("input", { class: "w-input", type: "text", inputmode: "numeric", maxlength: "7", value: String(initial.gdd ?? "") });
  const gtkInput = el("input", { class: "w-input", type: "text", inputmode: "decimal", maxlength: "7", value: String(initial.gtk ?? "") });
  const yieldInput = el("input", { class: "w-input", type: "text", inputmode: "decimal", maxlength: "7", value: String(initial.yield ?? "") });
  const descriptionInput = el("textarea", { class: "w-input", rows: "3", maxlength: "500", placeholder: "Краткое описание сорта" });
  descriptionInput.value = String(initial.description || "");

  const droughtInput = el("input", { type: "range", min: "1", max: "10", step: "1", value: String(initial.drought ?? 5) });
  const droughtValue = el("span", { class: "w-range-value", text: String(initial.drought ?? 5) });
  const coldInput = el("input", { type: "range", min: "1", max: "10", step: "1", value: String(initial.cold ?? 5) });
  const coldValue = el("span", { class: "w-range-value", text: String(initial.cold ?? 5) });
  updateRangeFill(droughtInput);
  updateRangeFill(coldInput);
  droughtInput.addEventListener("input", () => {
    droughtValue.textContent = droughtInput.value;
    updateRangeFill(droughtInput);
  });
  coldInput.addEventListener("input", () => {
    coldValue.textContent = coldInput.value;
    updateRangeFill(coldInput);
  });

  const errors = {
    name: el("span", { class: "w-field-error" }),
    fao: el("span", { class: "w-field-error" }),
    gtk: el("span", { class: "w-field-error" }),
    gdd: el("span", { class: "w-field-error" }),
    yield: el("span", { class: "w-field-error" }),
    description: el("span", { class: "w-field-error" })
  };
  const inputs = { name: nameInput, fao: faoInput, gtk: gtkInput, gdd: gddInput, yield: yieldInput, description: descriptionInput };

  const formErrorStrip = el("div", { class: "w-error-strip", hidden: true });

  const snapshot = () => JSON.stringify(readPayload());
  const initialSnapshot = snapshot();
  function readPayload() {
    return {
      name: nameInput.value,
      fao: faoInput.value,
      gtk: gtkInput.value,
      gdd: gddInput.value,
      drought: droughtInput.value,
      cold: coldInput.value,
      yield: yieldInput.value,
      description: descriptionInput.value
    };
  }

  const form = el("form", { class: "w-form", novalidate: true }, [
    formErrorStrip,
    buildField({ labelText: "Название сорта", required: true, hint: "до 60 символов", control: nameInput, errorNode: errors.name, full: true }),
    buildField({ labelText: "Группа спелости (ФАО)", hint: "100–900", control: faoInput, errorNode: errors.fao }),
    buildField({ labelText: "Сумма активных температур, °C·сут", hint: "0–4000", control: gddInput, errorNode: errors.gdd }),
    buildField({ labelText: "Требуемый ГТК", hint: "0.1–3.0", control: gtkInput, errorNode: errors.gtk }),
    buildField({ labelText: "Урожайность, ц/га", hint: "1–300", control: yieldInput, errorNode: errors.yield }),
    el("div", { class: "w-field" }, [
      el("label", { class: "w-label" }, [el("span", { text: "Засухоустойчивость" })]),
      el("div", { class: "w-range-row" }, [droughtInput, droughtValue]),
      el("div", { class: "w-range-ends" }, [el("span", { text: "1" }), el("span", { text: "10" })])
    ]),
    el("div", { class: "w-field" }, [
      el("label", { class: "w-label" }, [el("span", { text: "Холодостойкость" })]),
      el("div", { class: "w-range-row" }, [coldInput, coldValue]),
      el("div", { class: "w-range-ends" }, [el("span", { text: "1" }), el("span", { text: "10" })])
    ]),
    buildField({ labelText: "Примечания", control: descriptionInput, errorNode: errors.description, full: true })
  ]);

  const cancelButton = el("button", { class: "w-btn w-btn--secondary", type: "button", text: "Отмена" });
  const saveButton = el("button", { class: "w-btn w-btn--primary", type: "submit" }, [el("span", { text: "Сохранить" })]);

  const submitForm = () => {
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  };
  saveButton.addEventListener("click", (event) => {
    event.preventDefault();
    submitForm();
  });

  const dialog = openDialog({
    title: isEdit ? `Редактирование: ${initial.name}` : "Новый сорт",
    body: form,
    footer: [cancelButton, saveButton],
    initialFocus: nameInput
  });

  function clearErrors() {
    for (const node of Object.values(errors)) {
      node.textContent = "";
    }
    for (const input of Object.values(inputs)) {
      input.classList.remove("is-invalid");
    }
    formErrorStrip.hidden = true;
  }

  function showErrors(map) {
    for (const [key, text] of Object.entries(map)) {
      if (errors[key]) {
        errors[key].textContent = text;
      }
      if (inputs[key]) {
        inputs[key].classList.add("is-invalid");
      }
    }
  }

  function localValidate(payload) {
    const local = {};
    const emptyNumber = (raw) => String(raw ?? "").trim() === "";
    if (emptyNumber(payload.fao)) {
      local.fao = "Укажите значение";
    }
    if (emptyNumber(payload.gdd)) {
      local.gdd = "Укажите значение";
    }
    if (emptyNumber(payload.gtk)) {
      local.gtk = "Укажите значение";
    }
    if (emptyNumber(payload.yield)) {
      local.yield = "Укажите значение";
    }
    return local;
  }

  const tryClose = async () => {
    if (snapshot() !== initialSnapshot) {
      const leave = await confirmDialog({
        title: "Закрыть форму без сохранения?",
        message: "Внесённые изменения не будут сохранены.",
        confirmLabel: "Закрыть",
        cancelLabel: "Продолжить редактирование",
        danger: true
      });
      if (!leave) {
        return;
      }
    }
    dialog.close(null);
  };

  cancelButton.addEventListener("click", tryClose);
  dialog.onRequestClose(() => {
    tryClose();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saveButton.disabled) {
      return;
    }
    clearErrors();
    const payload = readPayload();
    const local = localValidate(payload);
    if (Object.keys(local).length) {
      showErrors(local);
      return;
    }
    saveButton.disabled = true;
    saveButton.setAttribute("aria-busy", "true");
    try {
      const result = isEdit ? await updateVariety(variety.id, payload) : await createVariety(payload);
      if (!result.ok) {
        showErrors(result.errors || {});
        return;
      }
      showToast(isEdit ? "Изменения сохранены" : "Сорт добавлен", "success");
      store.selectedId = isEdit ? variety.id : result.variety?.id || store.selectedId;
      dialog.close(null);
      await refresh();
      emit("varieties:changed");
    } catch {
      formErrorStrip.hidden = false;
      formErrorStrip.replaceChildren(icon("alert", "w-ico"), el("span", { text: "Не удалось сохранить сорт. Попробуйте ещё раз." }));
    } finally {
      saveButton.disabled = false;
      saveButton.removeAttribute("aria-busy");
    }
  });
}

export async function initVarietiesPage() {
  rootNode = document.getElementById("varieties-root");
  const view = document.getElementById("view-varieties");
  if (view && !view.dataset.varietiesBound) {
    view.dataset.varietiesBound = "1";
    view.addEventListener("scroll", () => {
      store.scroll = view.scrollTop;
    }, { passive: true });
  }
  await refresh();
}


