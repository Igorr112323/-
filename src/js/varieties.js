import { el, svgIcon, emit, debounce, formatShortDate } from "./util.js";
import { openModal, showToast } from "./ui.js";
import { listVarieties, createVariety, updateVariety, deleteVariety, validateVariety } from "./db.js";

let pageRoot = null;
let gridNode = null;
let searchNode = null;
let countNode = null;
let allVarieties = [];
let query = "";

function faoLabel(fao) {
  const value = Number(fao);
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

function buildVarietyCard(variety, index) {
  const name = el("div", { class: "variety-name", text: variety.name });
  const chip = el("span", { class: "fao-chip", text: `ФАО ${variety.fao}` });
  const head = el("div", { class: "variety-head" }, [name, chip]);

  const desc = el("div", { class: "variety-desc", text: variety.description || "Описание не указано" });

  const stats = el("div", { class: "variety-stats" }, [
    el("div", { class: "variety-stat" }, [el("span", { class: "vstat-value", text: `${variety.gdd}` }), el("span", { class: "vstat-label", text: "САТ, °C·дн" })]),
    el("div", { class: "variety-stat" }, [el("span", { class: "vstat-value", text: `${variety.gtk}` }), el("span", { class: "vstat-label", text: "ГТК" })]),
    el("div", { class: "variety-stat" }, [el("span", { class: "vstat-value", text: `${variety.yield}` }), el("span", { class: "vstat-label", text: "ц/га" })])
  ]);

  const bars = el("div", { class: "variety-bars" }, [
    el("div", { class: "vbar-row" }, [el("span", { text: "Засухоустойчивость" }), el("div", { class: "vbar-track" }, [el("div", { class: "vbar-fill", style: `width:0%`, dataset: { width: `${(variety.drought / 10) * 100}%` } })]), el("span", { class: "vbar-value", text: `${variety.drought}` })]),
    el("div", { class: "vbar-row" }, [el("span", { text: "Холодостойкость" }), el("div", { class: "vbar-track" }, [el("div", { class: "vbar-fill", style: `width:0%`, dataset: { width: `${(variety.cold / 10) * 100}%` } })]), el("span", { class: "vbar-value", text: `${variety.cold}` })])
  ]);

  const editBtn = el("button", { class: "mini-btn", type: "button", onclick: () => openForm(variety) }, [svgIcon("M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z")]);
  const deleteBtn = el("button", { class: "mini-btn danger", type: "button", onclick: () => confirmDelete(variety) }, [svgIcon("M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14")]);

  const foot = el("div", { class: "variety-foot" }, [
    el("span", { class: "variety-date", text: `Создан ${formatShortDate(new Date(variety.created_at))}` }),
    el("div", { class: "variety-actions" }, [editBtn, deleteBtn])
  ]);

  const card = el("article", { class: "variety-card", style: `animation-delay:${index * 45}ms` }, [head, desc, stats, bars, foot]);
  setTimeout(() => {
    card.querySelectorAll(".vbar-fill").forEach((node) => {
      node.style.width = node.dataset.width;
    });
  }, 120 + index * 45);
  return card;
}

function renderList() {
  const filtered = allVarieties.filter((variety) => variety.name.toLowerCase().includes(query));
  countNode.textContent = `${filtered.length} из ${allVarieties.length}`;
  gridNode.replaceChildren();

  if (filtered.length === 0) {
    const empty = el("div", { class: "empty-state" }, [
      svgIcon("M12 21a7 7 0 0 1-7-7c0-4 7-11 7-11s7 7 7 11a7 7 0 0 1-7 7z"),
      el("h3", { text: allVarieties.length === 0 ? "Сортов пока нет" : "Ничего не найдено" }),
      el("p", { text: allVarieties.length === 0 ? "Добавьте первый сорт кукурузы, чтобы использовать его при прогнозировании." : "Попробуйте изменить поисковый запрос." })
    ]);
    gridNode.append(empty);
    return;
  }
  filtered.forEach((variety, index) => gridNode.append(buildVarietyCard(variety, index)));
}

function buildField(label, hint, inputNode, errorNode, required = false) {
  return el("div", { class: "field" }, [
    el("label", { text: label }, required ? [el("span", { text: label }), el("span", { class: "req", text: " *" })] : [el("span", { text: label })]),
    inputNode,
    errorNode,
    hint ? el("span", { class: "field-hint", text: hint }) : null
  ]);
}

function openForm(variety) {
  const isEdit = Boolean(variety);
  const initial = variety || { name: "", fao: 300, gtk: 1.0, gdd: 1400, drought: 5, cold: 5, yield: 90, description: "" };

  const nameInput = el("input", { type: "text", value: initial.name, maxlength: "60", placeholder: "Например, Днепровский 181 СВ" });
  const nameError = el("span", { class: "field-error" });
  const faoInput = el("input", { type: "number", value: String(initial.fao), min: "100", max: "900", step: "10" });
  const faoError = el("span", { class: "field-error" });
  const gtkInput = el("input", { type: "number", value: String(initial.gtk), min: "0.1", max: "3", step: "0.05" });
  const gtkError = el("span", { class: "field-error" });
  const gddInput = el("input", { type: "number", value: String(initial.gdd), min: "0", max: "4000", step: "10" });
  const gddError = el("span", { class: "field-error" });
  const yieldInput = el("input", { type: "number", value: String(initial.yield), min: "1", max: "300", step: "0.1" });
  const yieldError = el("span", { class: "field-error" });
  const descriptionInput = el("textarea", { rows: "3", maxlength: "500", placeholder: "Краткое описание сорта" });
  descriptionInput.value = initial.description;
  const descriptionError = el("span", { class: "field-error" });

  const droughtInput = el("input", { type: "range", min: "1", max: "10", step: "1", value: String(initial.drought) });
  const droughtValue = el("span", { class: "range-value", text: String(initial.drought) });
  const coldInput = el("input", { type: "range", min: "1", max: "10", step: "1", value: String(initial.cold) });
  const coldValue = el("span", { class: "range-value", text: String(initial.cold) });

  droughtInput.addEventListener("input", () => {
    droughtValue.textContent = droughtInput.value;
  });
  coldInput.addEventListener("input", () => {
    coldValue.textContent = coldInput.value;
  });

  const form = el("form", { class: "form" }, [
    el("div", { class: "form-row" }, [
      buildField("Название сорта", "До 60 символов", nameInput, nameError, true),
      buildField("Группа спелости (ФАО)", "100–900", faoInput, faoError)
    ]),
    el("div", { class: "form-row" }, [
      buildField("ГТК Селянинова", "0.1–3.0", gtkInput, gtkError),
      buildField("Сумма активных температур", "°C·дней, 0–4000", gddInput, gddError)
    ]),
    el("div", { class: "form-row" }, [
      buildField("Урожайность", "ц/га, 1–300", yieldInput, yieldError),
      el("div", { class: "field" }, [el("label", { text: "Засухоустойчивость" }), el("div", { class: "range-input" }, [droughtInput, droughtValue])])
    ]),
    el("div", { class: "form-row" }, [
      el("div", { class: "field" }, [el("label", { text: "Холодостойкость" }), el("div", { class: "range-input" }, [coldInput, coldValue])])
    ]),
    el("div", { class: "field full" }, [el("label", { text: "Описание" }), descriptionInput, descriptionError])
  ]);

  const errors = { name: nameError, fao: faoError, gtk: gtkError, gdd: gddError, yield: yieldError, description: descriptionError };

  const cancelButton = el("button", { class: "btn-ghost", type: "button", text: "Отмена" });
  const saveButton = el("button", { class: "btn-primary", type: "submit", style: "width:auto" }, [svgIcon("M5 12l4 4 10-10"), el("span", { text: isEdit ? "Сохранить" : "Добавить" })]);

  const footer = el("div", { class: "form-actions" }, [cancelButton, saveButton]);
  const modal = openModal({ title: isEdit ? "Редактирование сорта" : "Новый сорт", body: form, footer });

  cancelButton.addEventListener("click", () => modal.close());

  const clearErrors = () => {
    for (const node of Object.values(errors)) {
      node.textContent = "";
    }
    [nameInput, faoInput, gtkInput, gddInput, yieldInput, descriptionInput].forEach((node) => node.classList.remove("is-invalid"));
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();
    const payload = {
      name: nameInput.value,
      fao: faoInput.value,
      gtk: gtkInput.value,
      gdd: gddInput.value,
      drought: droughtInput.value,
      cold: coldInput.value,
      yield: yieldInput.value,
      description: descriptionInput.value
    };
    const result = isEdit ? await updateVariety(variety.id, payload) : await createVariety(payload);
    if (!result.ok) {
      for (const key of Object.keys(result.errors)) {
        if (errors[key]) {
          errors[key].textContent = result.errors[key];
        }
        const inputMap = { name: nameInput, fao: faoInput, gtk: gtkInput, gdd: gddInput, yield: yieldInput, description: descriptionInput };
        if (inputMap[key]) {
          inputMap[key].classList.add("is-invalid");
        }
      }
      return;
    }
    modal.close();
    showToast(isEdit ? "Сорт обновлён" : "Сорт добавлен", "success");
    await refresh();
    emit("varieties:changed");
  });

  nameInput.focus();
}

function confirmDelete(variety) {
  const message = el("p", { class: "confirm-text" }, [el("span", { text: "Вы действительно хотите удалить сорт " }), el("b", { text: `«${variety.name}»` }), el("span", { text: "? Это действие нельзя отменить." })]);

  const cancelButton = el("button", { class: "btn-ghost", type: "button", text: "Отмена" });
  const deleteButton = el("button", { class: "btn-primary", type: "button", style: "width:auto; background:linear-gradient(180deg,#ff7b7b,#e04444); box-shadow:0 10px 26px rgba(224,68,68,0.34), inset 0 1px 0 rgba(255,255,255,0.4); color:#fff" }, [svgIcon("M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"), el("span", { text: "Удалить" })]);

  const footer = el("div", { class: "form-actions" }, [cancelButton, deleteButton]);
  const modal = openModal({ title: "Удаление сорта", body: message, footer, small: true });

  cancelButton.addEventListener("click", () => modal.close());
  deleteButton.addEventListener("click", async () => {
    const result = await deleteVariety(variety.id);
    if (result.ok) {
      modal.close();
      showToast("Сорт удалён", "success");
      await refresh();
      emit("varieties:changed");
    } else {
      showToast("Не удалось удалить сорт", "error");
    }
  });
}

async function refresh() {
  allVarieties = await listVarieties();
  renderList();
}

export async function initVarietiesPage() {
  pageRoot = document.getElementById("view-varieties");
  const backButton = el(
    "button",
    { class: "page-back", type: "button", onclick: () => emit("nav", { view: "map" }) },
    [svgIcon("M15 18l-6-6 6-6"), el("span", { text: "Назад к карте" })]
  );

  const addButton = el("button", { class: "btn-primary", type: "button", style: "width:auto", onclick: () => openForm(null) }, [
    svgIcon("M12 5v14M5 12h14"),
    el("span", { text: "Добавить сорт" })
  ]);

  const head = el("div", { class: "page-head" }, [
    backButton,
    el("div", {}, [el("h1", { class: "page-title", text: "База сортов кукурузы" }), el("p", { class: "page-sub", text: "Характеристики сортов используются при прогнозировании" })]),
    el("div", { class: "page-actions" }, [addButton])
  ]);

  searchNode = el("input", { type: "text", placeholder: "Поиск по названию…" });
  const search = el("div", { class: "search" }, [svgIcon("M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 0l8 8"), searchNode]);
  countNode = el("span", { class: "count-pill", text: "" });
  const toolbar = el("div", { class: "toolbar" }, [search, countNode]);

  gridNode = el("div", { class: "varieties-grid" });
  const page = el("div", { class: "view-page" }, [head, toolbar, gridNode]);
  pageRoot.replaceChildren(page);

  searchNode.addEventListener(
    "input",
    debounce(() => {
      query = searchNode.value.trim().toLowerCase();
      renderList();
    }, 140)
  );

  await refresh();
}
