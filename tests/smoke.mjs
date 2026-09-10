// Functional smoke tests for the light workspace (jsdom-based).
// Run: node tests/smoke.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";

const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url).pathname;

const results = [];
function check(name, fn) {
  results.push({ name, fn });
}
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
function includesText(haystack, needle, message) {
  assert(String(haystack).includes(needle), `${message} — got: ${JSON.stringify(String(haystack).slice(0, 400))}`);
}

const bundleResult = await build({
  entryPoints: [`${root}tests/entry.mjs`],
  bundle: true,
  format: "iife",
  target: ["chrome120"],
  write: false
});
const bundleCode = bundleResult.outputFiles[0].text;
writeFileSync("/tmp/agro-test-bundle.js", bundleCode);

let html = readFileSync(`${root}src/index.html`, "utf8");
html = html
  .replace(/<link rel="stylesheet" href="\.\/vendor\/leaflet\/leaflet\.css" \/>/, "")
  .replace(/<link rel="stylesheet" href="\.\/css\/app\.css" \/>/, "")
  .replace(/<link rel="stylesheet" href="\.\/css\/workspace\.css" \/>/, "")
  .replace(/<script src="\.\/vendor\/sqljs\/sql-wasm\.js"><\/script>/, "")
  .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, `<script>${bundleCode}</script>`);

const virtualConsole = new VirtualConsole();
const consoleErrors = [];
virtualConsole.on("jsdomError", (error) => {
  if (!/navigation \(except hash changes\)/.test(String(error))) {
    consoleErrors.push(String(error));
  }
});
virtualConsole.on("error", (msg) => consoleErrors.push(String(msg)));

const initSqlJs = require("sql.js");

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    // Node loads the wasm next to its dist; ignore the browser-style locateFile.
    window.initSqlJs = () => initSqlJs({});
    window.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ type: "FeatureCollection", features: [] })
    });
    window.URL.createObjectURL = () => "blob:fake";
    window.URL.revokeObjectURL = () => {};
    window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  }
});

const { window } = dom;
const { document } = window;

const tick = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
const q = (sel, scope = document) => scope.querySelector(sel);
const qa = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));
const text = (sel, scope = document) => (q(sel, scope) ? q(sel, scope).textContent : null);
const click = (node) => {
  node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
};
const clickText = (label, scope = document) => {
  const node = qa("button", scope).find((b) => b.textContent.trim() === label);
  if (!node) {
    throw new Error(`button not found: ${label}`);
  }
  click(node);
};
const setInput = (node, value) => {
  node.value = value;
  node.dispatchEvent(new window.Event("input", { bubbles: true }));
  node.dispatchEvent(new window.Event("change", { bubbles: true }));
};
const findButton = (label, scope = document) =>
  qa("button", scope).find((b) => b.textContent.trim() === label || b.getAttribute("aria-label") === label);
const cleanupDialogs = async () => {
  window.__hooks.closeAllDialogs();
  await tick(300);
};
const topDialog = () => qa(".w-dialog").at(-1) || null;
const clickTop = (label) => {
  const node = topDialog();
  if (!node) {
    throw new Error("no dialog open to click: " + label);
  }
  const btn = qa("button", node).find((b) => b.textContent.trim() === label);
  if (!btn) {
    throw new Error(`button "${label}" not in top dialog`);
  }
  click(btn);
};
const submitDialog = (dialog) => {
  click(findButton("Сохранить", dialog));
};

await tick(600); // boot: DOM, sql.js, seeds

check("app boots and seeds four varieties", async () => {
  click(q("#nav-varieties"));
  await tick(150);
  const rows = qa("#varieties-root tbody tr");
  assert(rows.length === 4, `expected 4 variety rows, got ${rows.length}`);
  includesText(rows.map((r) => r.textContent).join(" | "), "Днепровский 181 СВ", "seeded variety");
});

check("search filters varieties; empty state for no matches", async () => {
  const search = q("#varieties-root input[type=text]");
  setInput(search, "Пионер");
  await tick(250);
  assert(qa("#varieties-root tbody tr").length === 1, "search should narrow to 1 row");
  setInput(search, "ксюшндб");
  await tick(250);
  includesText(text("#varieties-root .w-state h3"), "Ничего не найдено", "empty search state");
  clickText("Сбросить фильтры", q("#varieties-root"));
  await tick(150);
  assert(qa("#varieties-root tbody tr").length === 4, "reset filters restores all rows");
});

check("detail panel shows grouped fields of the selected variety", async () => {
  let detail = q("#varieties-root .w-detail-card");
  assert(detail, "detail card auto-selected");
  const secondLink = qa("#varieties-root tbody tr .w-link")[1];
  click(secondLink);
  await tick(150);
  detail = q("#varieties-root .w-detail-card");
  assert(detail, "detail card after picking another row");
  includesText(detail.textContent, "Краснодарский 194 МВ", "second variety in detail");
  includesText(detail.textContent, "ФАО 300", "fao badge");
  includesText(detail.textContent, "°C·сут", "gdd unit");
  includesText(detail.textContent, "ц/га", "yield unit");
  includesText(detail.textContent, "Засухоустойчивость", "resistance group");
  includesText(detail.textContent, "Среднеранний", "derived ripening label");
});

check("create variety with comma decimals validates and saves", async () => {
  clickText("Добавить сорт", q("#varieties-root .w-toolbar"));
  await tick(150);
  const dialog = q(".w-dialog");
  assert(dialog, "form dialog opened");
  const inputs = qa("input.w-input", dialog);
  const [nameInput, faoInput, gddInput, gtkInput, yieldInput] = inputs;
  nameInput.value = "Тестовый гибрид СМ1";
  faoInput.value = "210";
  gddInput.value = "2300";
  gtkInput.value = "1,15"; // russian decimal comma
  yieldInput.value = "87,5";
  const desc = q("textarea", dialog);
  desc.value = "Тестовое описание";
  submitDialog(dialog);
  await tick(350);
  assert(!q(".w-dialog"), "dialog closed after save");
  assert(qa("#varieties-root tbody tr").length === 5, "variety count grew to 5");
  includesText(document.getElementById("toast-root").textContent, "Сорт добавлен", "success toast");
});

check("validation errors stick to fields and dialog stays open", async () => {
  clickText("Добавить сорт", q("#varieties-root .w-toolbar"));
  await tick(150);
  const dialog = q(".w-dialog");
  const inputs = qa("input.w-input", dialog);
  const [nameInput, faoInput] = inputs;
  nameInput.value = "";
  faoInput.value = "50";
  submitDialog(dialog);
  await tick(200);
  assert(q(".w-dialog"), "dialog still open on invalid submit");
  const fieldErrors = qa(".w-field-error:not(:empty)", dialog).map((n) => n.textContent);
  assert(fieldErrors.some((t) => t.includes("Введите название")), `name error shown: ${fieldErrors}`);
  assert(fieldErrors.some((t) => t.includes("ФАО")), `fao error shown: ${fieldErrors}`);
  assert(nameInput.value === "", "typed values preserved");
  faoInput.value = "250";
  nameInput.value = "Валидный тест";
  const gtk = inputs[3];
  const yieldI = inputs[4];
  gtk.value = "1";
  yieldI.value = "90";
  inputs[1].dispatchEvent(new window.Event("input", { bubbles: true }));
  submitDialog(dialog);
  await tick(350);
  assert(!q(".w-dialog"), "fixed form submits");
});

check("dirty guard on close of modified form", async () => {
  const editBtn = findButton("Редактировать", q("#varieties-root .w-detail-card")) || qa(".w-detail-card .w-btn", document).find((b) => b.textContent.includes("Редактировать"));
  assert(editBtn, "edit button in detail card");
  click(editBtn);
  await tick(150);
  const dialog = q(".w-dialog");
  const nameInput = qa("input.w-input", dialog)[0];
  nameInput.value = `${nameInput.value}!`;
  nameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  click(findButton("Отмена", dialog));
  await tick(200);
  const guard = topDialog();
  assert(guard !== dialog, "guard dialog opened on top");
  includesText(guard.textContent, "Закрыть форму без сохранения?", "dirty guard dialog");
  clickText("Продолжить редактирование", guard);
  await tick(200);
  includesText(topDialog().textContent, "Название сорта", "form remains open after continuing to edit");
  click(findButton("Отмена", topDialog()));
  await tick(200);
  clickText("Закрыть", topDialog());
  await tick(300);
  assert(!q(".w-dialog"), "discarded changes close the form");
});

check("delete variety asks with name and removes the row", async () => {
  clickText("Добавить сорт", q("#varieties-root .w-toolbar"));
  await tick(120);
  const dialog = q(".w-dialog");
  qa("input.w-input", dialog)[0].value = "Временный сорт для удаления";
  submitDialog(dialog);
  await tick(350);
  const before = qa("#varieties-root tbody tr").length;
  const targetRow = qa("#varieties-root tbody tr").find((tr) => tr.textContent.includes("Временный сорт для удаления"));
  assert(targetRow, "target row present before delete");
  click(findButton("Удалить сорт Временный сорт для удаления", targetRow) || qa(".w-btn--danger-ghost", targetRow)[0]);
  await tick(200);
  includesText(topDialog().textContent, "Временный сорт для удаления", "confirm names the variety");
  includesText(topDialog().textContent, "Сохранённые отчёты не изменятся", "side-effect note");
  clickTop("Удалить");
  await tick(350);
  assert(qa("#varieties-root tbody tr").length === before - 1, "row deleted");
});

check("data page: dataset appears after forecast download", async () => {
  const { generateForecast, db, refreshData } = window.__hooks;
  const forecast = generateForecast({
    lat: 55.7559, lon: 37.6173, varietyName: "Днепровский 181 СВ",
    rangeMonths: 1, targetDate: "2026-09-30"
  });
  await db.addDataset(
    { lat: 55.7559, lon: 37.6173, varietyName: "Днепровский 181 СВ", rangeMonths: 1, targetDate: "2026-09-30" },
    forecast
  );
  await refreshData();
  click(q("#nav-data"));
  await tick(200);
  const rows = qa("#data-root tbody tr");
  assert(rows.length === 1, `one dataset row expected, got ${rows.length}`);
  includesText(rows[0].textContent, "Демо", "demo source badge");
  includesText(rows[0].textContent, "Днепровский 181 СВ", "variety in dataset title");
});

check("data page: open detail with day table, sorting and pagination", async () => {
  click(findButton("Открыть", q("#data-root")));
  await tick(300);
  const table = q("#data-root .w-panel .w-table");
  assert(table, "day table rendered");
  const rowCount = qa("#data-root tbody tr").length;
  assert(rowCount === 31, `page size 31 rows, got ${rowCount}`);
  includesText(q("#data-root .w-pager").textContent, "стр. 1 из", "pager visible");
  includesText(text("#data-root h1"), "Днепровский 181 СВ", "detail heading");
  includesText(q("#data-root .w-chips").textContent, "Демонстрационный движок", "source chip");
  // sort by Т макс desc → first row should have the largest tMax of that page
  const tmaxHeader = qa("#data-root thead button.w-th").find((b) => b.textContent.includes("Т макс"));
  click(tmaxHeader);
  await tick(200);
  const firstTmax = q("#data-root tbody tr td:nth-child(3)").textContent.replace(",", ".");
  const tmaxValues = qa("#data-root tbody tr td:nth-child(3)").map((td) => parseFloat(td.textContent.replace(",", ".")));
  assert(parseFloat(firstTmax.replace(/ /g, "")) === Math.max(...tmaxValues), `sorted desc: ${firstTmax} vs ${Math.max(...tmaxValues)}`);
  // CSV export produces a toast without throwing
  const exportBtn = findButton("Скачать CSV", q("#data-root"));
  click(exportBtn);
  await tick(120);
  includesText(document.getElementById("toast-root").textContent, "Файл CSV сохранён", "csv toast");
});

check("data page: back to list keeps filters; delete single set with explanation", async () => {
  // go back first
  click(findButton("К списку наборов", q("#data-root")));
  await tick(200);
  assert(q("#data-root tbody tr"), "list rows visible after back");
  const search = q("#data-root input[type=text]");
  setInput(search, "нет-такого");
  await tick(200);
  includesText(text("#data-root .w-state h3"), "Ничего не найдено", "search empty state");
  clickText("Сбросить фильтры", q("#data-root"));
  await tick(200);
  click(q("#data-root tbody tr .w-btn--danger-ghost"));
  await tick(200);
  includesText(topDialog().textContent, "Сохранённые отчёты не будут удалены", "safe-delete note");
  includesText(topDialog().textContent, "Днепровский", "confirm names the dataset");
  clickTop("Удалить");
  await tick(350);
  includesText(text("#data-root .w-state h3"), "Нет сохранённых метеонаборов", "empty catalog state");
  includesText(q("#data-root .w-state").textContent, "после расчёта прогноза", "helpful empty hint");
});

check("results: render, metrics, risks, demo note, save guard", async () => {
  const { generateForecast, renderResults, emit } = window.__hooks;
  const forecast = generateForecast({
    lat: 45.0, lon: 39.0, varietyName: "Краснодарский 194 МВ",
    rangeMonths: 3, targetDate: "2026-09-30"
  });
  renderResults(forecast, {});
  emit("nav", { view: "results" });
  await tick(250);
  const root = q("#results-root");
  includesText(text("#view-results .w-results-bar h1"), "Результаты прогноза", "results header");
  includesText(root.textContent, "Демонстрационные данные", "demo badge");
  includesText(root.textContent, "не предназначен для агрономических решений", "accessible demo disclaimer");
  assert(qa(".w-metric").length === 5, "five metrics rendered");
  includesText(root.textContent, "°C·сут", "gdd unit");
  const gtkValue = qa(".w-metric-value")[3].textContent;
  assert(/^[\d.,—]+$/.test(gtkValue), `gtk numeric value: ${gtkValue}`);
  assert(qa(".w-risk").length >= 3, "risks rendered");
  assert(qa("#results-root svg path").length > 0, "chart svg drawn");
  // table toggle renders actual values
  clickText("Таблица", q("#results-root .w-seg"));
  await tick(150);
  assert(qa("#results-root .w-series-table tbody tr").length > 60, "series table rows match 3-month length");
  clickText("График", q("#results-root .w-seg"));
  await tick(150);
  assert(qa("#results-root .w-chart svg").length === 2, "two charts (temp + precip) rendered");
  // save report once, guard double-save
  const saveBtn = findButton("Сохранить отчёт", q("#results-root"));
  click(saveBtn);
  await tick(350);
  includesText(document.getElementById("toast-root").textContent, "Отчёт сохранён", "save toast");
  const savedBtn = findButton("Сохранено", q("#results-root")) || q("#results-root .w-rb-actions .w-btn--secondary");
  assert(savedBtn && savedBtn.disabled, "save button becomes disabled 'Сохранено'");
});

check("reports: saved report opens without recompute and lists metadata", async () => {
  click(q("#nav-reports"));
  await tick(200);
  const rows = qa("#reports-root tbody tr");
  assert(rows.length >= 1, `report rows, got ${rows.length}`);
  includesText(rows[0].textContent, "Демо", "demo badge on report row");
  includesText(rows[0].textContent, "Краснодарский 194 МВ", "variety column");
  // filters persist across navigation
  setInput(q("#reports-root input[type=text]"), "Краснодарский");
  await tick(200);
  assert(qa("#reports-root tbody tr").length === 1, "search applied");
  click(q("#nav-varieties"));
  await tick(120);
  click(q("#nav-reports"));
  await tick(200);
  assert(q("#reports-root input[type=text]").value === "Краснодарский", "search filter persisted after revisit");
  clickText("Открыть", q("#reports-root"));
  await tick(250);
  includesText(text("#view-results .w-results-bar"), "Результаты прогноза", "saved report opens results view");
  const saveState = findButton("Сохранено", q("#results-root"));
  assert(saveState && saveState.disabled, "opened report shows saved state (no double save)");
});

check("reports: delete keeps dataset independent", async () => {
  click(q("#nav-reports"));
  await tick(200);
  const rowsBefore = qa("#reports-root tbody tr").length;
  click(q("#reports-root tbody tr .w-btn--danger-ghost"));
  await tick(200);
  includesText(topDialog().textContent, "Скачанный набор метеоданных останется", "dependency explanation");
  clickTop("Удалить");
  await tick(350);
  assert(qa("#reports-root tbody tr").length === rowsBefore - 1, "row removed");
});

check("corrupted snapshot yields readable error, not a crash", async () => {
  const { db, emit } = window.__hooks;
  const database = await db.openDatabase();
  const id = "corrupt-1";
  const now = Date.now();
  database.run(
    "INSERT INTO forecasts (id, lat, lon, variety_id, variety_name, range_months, target_date, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, 50, 40, null, "Сломанный", 1, "2026-09-01", now, "{not json"]
  );
  const records = await db.listForecasts(500);
  const broken = records.find((r) => r.id === id);
  emit("report:open", broken);
  await tick(200);
  includesText(text("#view-results h3"), "Не удалось отобразить результат", "friendly broken-record state");
  const visible = [
    document.getElementById("app").textContent,
    document.getElementById("modal-root").textContent,
    document.getElementById("toast-root").textContent
  ].join(" ");
  assert(!visible.includes("[object Object]"), "no [object Object] leak");
  assert(!visible.includes("undefined"), "no undefined leak");
  assert(!visible.includes("NaN"), "no NaN leak");
  clickText("К карте", q("#results-root"));
  await tick(120);
  // cleanup
  await db.deleteForecast(id);
  click(q("#nav-reports"));
  await tick(200);
});

check("dialogs close on Escape and restore focus", async () => {
  assert(!q(".w-dialog"), "cleanup closed dialogs");
  click(q("#nav-varieties"));
  await tick(150);
  const addButton = findButton("Добавить сорт", q("#varieties-root .w-toolbar"));
  addButton.focus();
  click(addButton);
  await tick(150);
  assert(q(".w-dialog"), "dialog open");
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await tick(250);
  assert(!q(".w-dialog"), "escape closes dialog");
});

check("persistence: database bytes saved to storage", async () => {
  const raw = window.localStorage.getItem("agroprognoz.database.v1");
  assert(raw && raw.length > 1000, "localStorage contains serialized DB");
});

check("db roundtrip preserves series values", async () => {
  const { generateForecast, db } = window.__hooks;
  const forecast = generateForecast({ lat: 51.5, lon: 46.0, varietyName: null, rangeMonths: 1, targetDate: "2026-09-15" });
  const packed = db.packForecast(forecast);
  const restored = db.unpackForecast(packed);
  assert(restored, "unpack succeeds");
  assert(restored.series.length === forecast.series.length, "series length preserved");
  for (let i = 0; i < forecast.series.length; i += 1) {
    for (const key of ["tMin", "tMax", "tMean", "precip", "humidity", "soilMoisture"]) {
      assert(restored.series[i][key] === forecast.series[i][key], `series[${i}].${key} mismatch`);
    }
    if (restored.series[i].date !== forecast.series[i].date) {
      throw new Error("date mismatch");
    }
  }
  for (const key of Object.keys(forecast.indicators)) {
    assert(restored.indicators[key] === forecast.indicators[key], `indicator ${key} mismatch`);
  }
  assert(JSON.stringify(restored.risks) === JSON.stringify(forecast.risks), "risks preserved");
});

check("csv escaping quotes and semicolons", async () => {
  const { util } = window.__hooks;
  assert(util.escapeCsvCell('a"b') === '"a""b"', "quotes escaped");
  assert(util.escapeCsvCell("a;b") === '"a;b"', "semicolon quoted");
  assert(util.escapeCsvCell("abc") === "abc", "plain unquoted");
});

check("no duplicate dataset rows / stable re-render", async () => {
  const { refreshData } = window.__hooks;
  await refreshData();
  await refreshData();
  click(q("#nav-data"));
  await tick(200);
  assert(qa("#data-root tbody tr").length === 0, "dataset list empty after earlier delete");
  includesText(text("#data-root .w-state h3"), "Нет сохранённых метеонаборов", "stable empty state");
});

check("no unexpected runtime console errors", async () => {
  const real = consoleErrors.filter((e) => !/Could not parse CSS|Error: Not implemented/.test(e));
  assert(real.length === 0, `console errors:\n${real.slice(0, 4).join("\n").slice(0, 2000)}`);
});

let failed = 0;
for (const { name, fn } of results) {
  try {
    await cleanupDialogs();
    await fn();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${name}\n        ${String(error.message).slice(0, 300)}\n${error.stack ? error.stack.split("\n").slice(1, 4).join("\n") : ""}`);
  }
}
console.log(failed === 0 ? "\nSMOKE OK" : `\nSMOKE FAILED (${failed})`);
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
