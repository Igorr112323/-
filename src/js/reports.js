import { el, svgIcon, emit, formatFullDate, formatShortDate, formatSignedCoord } from "./util.js";
import { listForecasts, deleteForecast, clearAllForecasts } from "./db.js";
import { confirmDialog, openModal, showToast } from "./ui.js";

let gridNode = null;
let countNode = null;

function buildReportCard(record, index) {
  const titleText = record.variety_name || "Прогноз погоды";
  const title = el("div", { class: "report-title", text: titleText });
  const dateBadge = el("span", { class: "report-badge", text: `${record.range_months} мес` });
  const head = el("div", { class: "report-head" }, [title, dateBadge]);

  const meta = el("div", { class: "report-meta" }, [
    el("span", {}, [el("b", { text: "Точка: " }), el("span", { text: `${formatSignedCoord(record.lat, "с.ш.", "ю.ш.")}, ${formatSignedCoord(record.lon, "в.д.", "з.д.")}` })]),
    el("span", {}, [el("b", { text: "Прогноз на: " }), el("span", { text: formatFullDate(new Date(record.target_date)) })]),
    el("span", {}, [el("b", { text: "Создан: " }), el("span", { text: formatFullDate(new Date(record.created_at)) })])
  ]);

  const openButton = el("button", { class: "mini-btn primary", type: "button", onclick: () => emit("report:open", record) }, [svgIcon("M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"), el("span", { text: "Открыть" })]);
  const deleteButton = el("button", { class: "mini-btn danger", type: "button", onclick: () => confirmDelete(record) }, [svgIcon("M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"), el("span", { text: "Удалить" })]);

  const foot = el("div", { class: "report-actions" }, [openButton, deleteButton]);

  return el("article", { class: "card report-card", style: `animation-delay:${index * 45}ms` }, [head, meta, foot]);
}

function confirmDelete(record) {
  const body = el("p", { class: "confirm-text" }, [el("span", { text: "Удалить отчёт за " }), el("b", { text: formatFullDate(new Date(record.target_date)) }), el("span", { text: "? Вместе с ним будут удалены скачанные метеоданные." })]);
  const cancel = el("button", { class: "btn-ghost", type: "button", text: "Отмена" });
  const ok = el("button", { class: "btn-primary", type: "button", style: "width:auto; background:linear-gradient(180deg,#ff7b7b,#e04444); box-shadow:0 10px 26px rgba(224,68,68,0.34), inset 0 1px 0 rgba(255,255,255,0.4); color:#fff" }, [el("span", { text: "Удалить" })]);
  const footer = el("div", { class: "form-actions" }, [cancel, ok]);
  const modal = openModal({ title: "Удаление отчёта", body, footer, small: true });
  cancel.addEventListener("click", () => modal.close());
  ok.addEventListener("click", async () => {
    await deleteForecast(record.id);
    modal.close();
    showToast("Отчёт удалён", "success");
    await refreshReports();
    emit("forecasts:changed");
  });
}

async function confirmClearAll() {
  const ok = await confirmDialog({ title: "Очистить все отчёты", message: "Удалить все сохранённые отчёты и скачанные метеоданные? Это действие нельзя отменить.", confirmLabel: "Очистить всё" });
  if (!ok) {
    return;
  }
  await clearAllForecasts();
  showToast("Все отчёты удалены", "success");
  await refreshReports();
  emit("forecasts:changed");
}

export async function refreshReports() {
  const records = await listForecasts(50);
  countNode.textContent = `${records.length} ${plural(records.length, "отчёт", "отчёта", "отчётов")}`;
  gridNode.replaceChildren();

  if (records.length === 0) {
    gridNode.append(
      el("div", { class: "empty-state" }, [
        svgIcon("M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"),
        el("h3", { text: "Отчётов пока нет" }),
        el("p", { text: "Постройте первый прогноз на карте — отчёт сохранится здесь автоматически." })
      ])
    );
    return;
  }

  records.forEach((record, index) => gridNode.append(buildReportCard(record, index)));
}

function plural(count, one, few, many) {
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

export async function initReportsPage() {
  const root = document.getElementById("view-reports");
  const backButton = el("button", { class: "page-back", type: "button", onclick: () => emit("nav", { view: "map" }) }, [svgIcon("M15 18l-6-6 6-6"), el("span", { text: "Назад к карте" })]);

  const clearButton = el("button", { class: "btn-ghost danger-ghost", type: "button", onclick: confirmClearAll }, [svgIcon("M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"), el("span", { text: "Очистить все" })]);

  const head = el("div", { class: "page-head" }, [
    backButton,
    el("div", {}, [el("h1", { class: "page-title", text: "Отчёты" }), el("p", { class: "page-sub", text: "Сохранённые результаты прогнозов — открывайте и удаляйте" })]),
    el("div", { class: "page-actions" }, [clearButton])
  ]);

  countNode = el("span", { class: "count-pill", text: "" });
  const toolbar = el("div", { class: "toolbar" }, [countNode]);

  gridNode = el("div", { class: "reports-grid" });
  root.replaceChildren(el("div", { class: "view-page" }, [head, toolbar, gridNode]));

  await refreshReports();
}
