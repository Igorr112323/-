import {
  el, emit, formatDateTime, formatFullDate, formatDecimalOrDash, formatPeriod,
  formatSignedCoord, parseISODate, MONTHS_GEN_SHORT, clamp
} from "./util.js";
import { icon } from "./icons.js";
import { showToast } from "./ui.js";
import { addForecast } from "./db.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const viewState = {
  forecast: null,
  meta: {},
  saved: false,
  saving: false,
  mode: "chart",
  saveButton: null,
  charts: []
};

function makeSvg(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const key of Object.keys(attributes)) {
    node.setAttribute(key, attributes[key]);
  }
  return node;
}

function dayLabel(iso) {
  const date = parseISODate(iso);
  if (!date) {
    return iso || "—";
  }
  return `${date.getDate()} ${MONTHS_GEN_SHORT[date.getMonth()]}`;
}

function niceTicks(min, max, target) {
  const span = Math.max(1e-6, max - min);
  const rough = span / Math.max(2, target);
  const mag = 10 ** Math.floor(Math.log10(rough));
  const candidates = [1, 2, 2.5, 5, 10].map((c) => c * mag);
  let step = candidates[candidates.length - 1];
  for (const candidate of candidates) {
    if (span / candidate <= target + 0.5) {
      step = candidate;
      break;
    }
  }
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    ticks.push(Math.round(v * 1000) / 1000);
  }
  if (ticks.length < 2) {
    return [min, max];
  }
  return ticks;
}

function formatTick(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return (Math.abs(value) < 10 ? value.toFixed(1) : String(Math.round(value)));
}

// Interactive SVG chart shared by temperature (lines + band) and precipitation (bars).
function createChart(container, series, { height, drawTemp, drawPrecip }) {
  const root = el("div", { class: "w-chart" });
  const tip = el("div", { class: "w-chart-tip" });
  root.append(tip);
  container.append(root);

  let g = null; // current geometry: { xAt, y, svg, guide, dot, width, pad, plotW }

  function render() {
    const width = Math.max(300, root.clientWidth || container.clientWidth || 600);
    const pad = { t: 14, r: 16, b: 26, l: 44 };
    const plotW = width - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;
    const n = series.length;

    const finiteOf = (key) => series.map((d) => Number(d[key])).filter(Number.isFinite);
    const means = finiteOf("tMean");
    const mins = drawTemp ? finiteOf("tMin") : [];
    const maxs = drawTemp ? finiteOf("tMax") : [];
    const precs = drawPrecip ? finiteOf("precip") : [];

    let vMin;
    let vMax;
    if (drawTemp) {
      vMin = mins.length ? Math.min(...mins, 0) - 1 : (means.length ? means[0] - 1 : 0);
      vMax = maxs.length ? Math.max(...maxs, 5) + 1 : (means.length ? means[0] + 1 : 1);
    } else {
      vMin = 0;
      vMax = Math.max(5, precs.length ? Math.max(...precs) * 1.12 : 1);
      if (vMax > 10) {
        vMax = Math.ceil(vMax / 5) * 5;
      } else {
        vMax = Math.ceil(vMax);
      }
    }

    const xAt = (i) => (n === 1 ? pad.l + plotW / 2 : pad.l + (i / (n - 1)) * plotW);
    const y = (v) => (Number.isFinite(v) ? pad.t + plotH - ((v - vMin) / ((vMax - vMin) || 1)) * plotH : pad.t + plotH);

    const svg = makeSvg("svg", { width: String(width), height: String(height), viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true" });

    for (const tick of niceTicks(vMin, vMax, plotH / 46)) {
      const yy = y(tick);
      if (yy < pad.t - 2 || yy > pad.t + plotH + 2) {
        continue;
      }
      if (yy > pad.t + 2 && yy < pad.t + plotH - 2) {
        svg.append(makeSvg("line", { class: "w-chart-gridline", x1: pad.l, y1: yy, x2: pad.l + plotW, y2: yy }));
      }
      const label = makeSvg("text", { class: "w-chart-axis", x: pad.l - 7, y: yy + 3.5, "text-anchor": "end" });
      label.textContent = formatTick(tick);
      svg.append(label);
    }
    if (drawTemp && vMin < 0 && vMax > 0) {
      const zeroY = y(0);
      svg.append(makeSvg("line", { class: "w-chart-zeroline", x1: pad.l, y1: zeroY, x2: pad.l + plotW, y2: zeroY }));
    }
    const unitText = makeSvg("text", { class: "w-chart-unit", x: 5, y: pad.t + 7 });
    unitText.textContent = drawTemp ? "°C" : "мм";
    svg.append(unitText);

    // baseline of the plot
    svg.append(makeSvg("line", { class: "w-chart-gridline", x1: pad.l, y1: pad.t + plotH, x2: pad.l + plotW, y2: pad.t + plotH }));

    if (n > 0) {
      let xTicks = [];
      if (n > 120) {
        for (let i = 0; i < n; i += 1) {
          const date = parseISODate(series[i].date);
          if (date && date.getDate() <= 3) {
            xTicks.push({ i, text: MONTHS_GEN_SHORT[date.getMonth()] });
          }
        }
        if (xTicks.length > 8) {
          xTicks = xTicks.filter((t, idx) => idx % 2 === 0);
        }
      } else {
        const step = Math.max(1, Math.round(n / 6));
        for (let i = 0; i < n; i += step) {
          xTicks.push({ i, text: dayLabel(series[i].date) });
        }
      }
      for (const tick of xTicks) {
        const x = xAt(tick.i);
        const anchor = x < pad.l + 14 ? "start" : x > pad.l + plotW - 14 ? "end" : "middle";
        const label = makeSvg("text", { class: "w-chart-axis", x: String(x), y: String(height - 8), "text-anchor": anchor });
        label.textContent = tick.text;
        svg.append(label);
      }
    }

    if (drawPrecip && n > 0) {
      const slot = n === 1 ? plotW : plotW / n;
      const barW = clamp(slot * 0.62, 1, 22);
      for (let i = 0; i < n; i += 1) {
        const v = Number(series[i].precip);
        if (!Number.isFinite(v) || v <= 0) {
          continue;
        }
        const yTop = y(v);
        const base = pad.t + plotH;
        svg.append(makeSvg("rect", {
          class: "w-chart-bar",
          x: String(xAt(i) - barW / 2), y: String(yTop), width: String(barW),
          height: String(Math.max(1, base - yTop)), rx: String(Math.min(1.5, barW / 3))
        }));
      }
    }

    if (drawTemp && n > 1 && mins.length && maxs.length) {
      const band = [];
      for (let i = 0; i < n; i += 1) {
        band.push(`${i === 0 ? "M" : "L"} ${xAt(i)} ${y(series[i].tMax)}`);
      }
      for (let i = n - 1; i >= 0; i -= 1) {
        band.push(`L ${xAt(i)} ${y(series[i].tMin)}`);
      }
      svg.append(makeSvg("path", { class: "w-chart-band", d: `${band.join(" ")} Z` }));
      const minPts = series.map((d, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${y(d.tMin)}`).join(" ");
      const maxPts = series.map((d, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${y(d.tMax)}`).join(" ");
      svg.append(makeSvg("path", { class: "w-chart-line2", d: minPts }));
      svg.append(makeSvg("path", { class: "w-chart-line2", d: maxPts }));
      const meanPts = series.map((d, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${y(d.tMean)}`).join(" ");
      svg.append(makeSvg("path", { class: "w-chart-line", d: meanPts }));
    } else if (drawTemp && n === 1) {
      svg.append(makeSvg("circle", { cx: String(xAt(0)), cy: String(y(series[0].tMean)), r: "3.5", class: "w-chart-hover" }));
    }

    const guide = makeSvg("line", { class: "w-chart-guide", x1: "0", y1: String(pad.t), x2: "0", y2: String(pad.t + plotH), opacity: "0" });
    const dot = makeSvg("circle", { class: "w-chart-hover", r: "3.6", cx: "0", cy: "0", opacity: "0" });
    const catchRect = makeSvg("rect", { class: "w-chart-catch", x: String(pad.l - 6), y: String(pad.t), width: String(plotW + 12), height: String(plotH) });
    svg.append(guide, dot, catchRect);

    const oldSvg = root.querySelector("svg");
    if (oldSvg) {
      oldSvg.remove();
    }
    root.append(svg);
    g = { xAt, y, svg, guide, dot, width, pad, plotW };

    svg.addEventListener("mousemove", (event) => {
      if (!g) {
        return;
      }
      const rect = g.svg.getBoundingClientRect();
      const k = (event.clientX - rect.left) * (g.width / (rect.width || g.width));
      const rel = (k - g.pad.l) / (g.plotW || 1);
      if (series.length) {
        showHover(clamp(Math.round(rel * (series.length - 1)), 0, series.length - 1));
      }
    });
    svg.addEventListener("mouseleave", hide);
  }

  function showHover(i) {
    const day = series[i];
    if (!g || !day) {
      return;
    }
    const x = g.xAt(i);
    const focusValue = drawTemp ? Number(day.tMean) : Number(day.precip);
    const cy = g.y(Number.isFinite(focusValue) ? focusValue : 0);
    g.guide.setAttribute("x1", x);
    g.guide.setAttribute("x2", x);
    g.guide.setAttribute("opacity", "1");
    g.dot.setAttribute("cx", x);
    g.dot.setAttribute("cy", cy);
    g.dot.setAttribute("opacity", "1");

    tip.replaceChildren();
    tip.append(el("div", { class: "w-tip-date", text: day.date ? formatFullDate(parseISODate(day.date)) : "—" }));
    if (drawTemp) {
      tip.append(
        el("div", { class: "w-tip-row" }, [el("span", { text: "Т. средняя" }), el("b", { text: formatDecimalOrDash(day.tMean, 1, " °C") })]),
        el("div", { class: "w-tip-row" }, [el("span", { text: "Т. мин / макс" }), el("b", { text: `${formatDecimalOrDash(day.tMin, 1)} / ${formatDecimalOrDash(day.tMax, 1)} °C` })])
      );
    }
    tip.append(
      el("div", { class: "w-tip-row" }, [el("span", { text: "Осадки" }), el("b", { text: formatDecimalOrDash(day.precip, 1, " мм") })])
    );
    if (drawTemp) {
      tip.append(el("div", { class: "w-tip-row" }, [el("span", { text: "Влажность" }), el("b", { text: formatDecimalOrDash(day.humidity, 0, " %") })]));
    }
    tip.classList.add("is-visible");

    const rect = g.svg.getBoundingClientRect();
    const scale = (rect.width || g.width) / g.width;
    const tipW = tip.offsetWidth || 160;
    const tipH = tip.offsetHeight || 70;
    tip.style.left = `${clamp(x * scale - tipW / 2, 2, Math.max(2, rect.width - tipW - 2))}px`;
    tip.style.top = `${clamp(cy * scale - tipH - 12, 2, Math.max(2, height - tipH - 4))}px`;
  }

  function hide() {
    if (g) {
      g.guide.setAttribute("opacity", "0");
      g.dot.setAttribute("opacity", "0");
    }
    tip.classList.remove("is-visible");
  }

  render();

  return { render, showHover, hide, root };
}

function metricCell({ label, tipText, value, sub }) {
  return el("div", { class: "w-metric" }, [
    el("div", { class: "w-metric-label" }, [
      el("span", { text: label }),
      tipText
        ? el("span", { class: "w-tip", tabindex: "0", "aria-label": `Пояснение: ${tipText}`, dataset: { tip: tipText } }, [icon("info")])
        : null
    ]),
    el("div", { class: "w-metric-value", text: value }),
    sub ? el("div", { class: "w-metric-sub", text: sub }) : null
  ]);
}

function buildMetrics(indicators) {
  const ind = indicators || {};
  const ok = (v) => Number.isFinite(Number(v));
  return el("section", { class: "w-panel w-metrics", "aria-label": "Основные показатели" }, [
    metricCell({
      label: "Средняя температура",
      tipText: "Среднее арифметическое средних суточных температур за период.",
      value: ok(ind.avgTemp) ? `${formatDecimalOrDash(ind.avgTemp, 1)} °C` : "—"
    }),
    metricCell({
      label: "Сумма осадков",
      tipText: "Сумма суточных осадков за период.",
      value: ok(ind.totalPrecip) ? `${formatDecimalOrDash(ind.totalPrecip, 0)} мм` : "—"
    }),
    metricCell({
      label: "Сумма активных температур",
      tipText: "Σ (Tср − 10 °C) по дням, где Tср > 10 °C.",
      value: ok(ind.gdd) ? `${formatDecimalOrDash(ind.gdd, 0)} °C·сут` : "—"
    }),
    metricCell({
      label: "ГТК",
      tipText: "Σ осадков ÷ (Σ средних температур > 10 °C ÷ 10), ограничен диапазоном 0–5.",
      value: ok(ind.gtk) ? formatDecimalOrDash(ind.gtk, 2) : "—"
    }),
    metricCell({
      label: "Влажность воздуха",
      tipText: "Среднее арифметическое суточных значений влажности за период.",
      value: ok(ind.humidityAvg) ? `${formatDecimalOrDash(ind.humidityAvg, 0)} %` : "—"
    })
  ]);
}

function buildSeriesTable(series) {
  const table = el("table", { class: "w-table" });
  const head = el("tr");
  [
    "Дата", "Т мин, °C", "Т макс, °C", "Т сред, °C", "Осадки, мм", "Влажность, %", "Влажн. почвы, %"
  ].forEach((text, index) => {
    head.append(el("th", { class: index === 0 ? "w-th-plain" : "w-th-plain w-td-right", text }));
  });
  table.append(el("thead", {}, [head]));
  const body = el("tbody");
  for (const day of series) {
    body.append(el("tr", {}, [
      el("td", { text: formatFullDate(parseISODate(day.date)) }),
      el("td", { class: "w-num w-td-right", text: formatDecimalOrDash(day.tMin, 1) }),
      el("td", { class: "w-num w-td-right", text: formatDecimalOrDash(day.tMax, 1) }),
      el("td", { class: "w-num w-td-right", text: formatDecimalOrDash(day.tMean, 1) }),
      el("td", { class: "w-num w-td-right", text: formatDecimalOrDash(day.precip, 1) }),
      el("td", { class: "w-num w-td-right", text: formatDecimalOrDash(day.humidity, 0) }),
      el("td", { class: "w-num w-td-right", text: formatDecimalOrDash(day.soilMoisture, 0) })
    ]));
  }
  table.append(body);
  return el("div", { class: "w-table-scroll w-series-table" }, [table]);
}

const LEVEL_LABELS = { low: "Низкий", medium: "Средний", high: "Высокий" };

function normalizeLevel(level) {
  const value = String(level || "").toLowerCase();
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "medium";
}

function buildRisks(risks) {
  const panel = el("section", { class: "w-panel", "aria-label": "Риски" });
  panel.append(
    el("div", { class: "w-panel-head" }, [
      el("h2", { class: "w-h2" }, [icon("alert", "w-ico w-ico--lg"), el("span", { text: "Риски" })])
    ])
  );
  if (!Array.isArray(risks) || risks.length === 0) {
    panel.append(el("div", { class: "w-state w-state--sm" }, [el("p", { text: "Нет данных о рисках" })]));
    return panel;
  }
  const list = el("ul", { class: "w-risks" });
  for (const risk of risks) {
    const level = normalizeLevel(risk.level);
    const levelLabel = LEVEL_LABELS[level];
    list.append(
      el("li", { class: `w-risk w-risk--${level}` }, [
        el("span", { class: "w-risk-name" }, [el("span", { class: "w-dot" }), el("span", { text: risk.name || "—" })]),
        el("span", { class: `w-level w-level--${level}` }, [el("span", { class: "w-dot" }), el("span", { text: levelLabel })]),
        risk.hint ? el("span", { class: "w-risk-hint", text: risk.hint }) : null
      ])
    );
  }
  panel.append(list);
  return panel;
}

function buildContextPanel() {
  const forecast = viewState.forecast;
  const req = forecast.request || {};
  const period = forecast.period || {};
  const rows = [
    ["Сорт", req.varietyName || "Без сорта"],
    ["Точка", `${formatSignedCoord(req.lat, "с.ш.", "ю.ш.")}, ${formatSignedCoord(req.lon, "в.д.", "з.д.")}`],
    ["Период", formatPeriod(period.start, period.end)],
    ["Дней в ряду", String(period.days != null ? period.days : (forecast.series || []).length)],
    ["Дальность", `${req.rangeMonths || "—"} мес`],
    ["Целевая дата", req.targetDate ? formatFullDate(parseISODate(req.targetDate)) : "—"]
  ];
  if (viewState.saved && viewState.meta.savedRecord && viewState.meta.savedRecord.created_at) {
    rows.push(["Сохранён", formatDateTime(viewState.meta.savedRecord.created_at)]);
  }
  const dl = el("dl", { class: "w-kv" });
  for (const [key, value] of rows) {
    dl.append(el("dt", { text: key }), el("dd", { text: value }));
  }
  return el("section", { class: "w-panel", "aria-label": "Условия расчёта" }, [
    el("div", { class: "w-panel-head" }, [el("h2", { class: "w-h2" }, [icon("doc", "w-ico w-ico--lg"), el("span", { text: "Условия расчёта" })])]),
    el("div", { class: "w-panel-body", style: "padding:12px 18px 16px" }, [dl])
  ]);
}

function renderSideColumn() {
  if (!sideColumn) {
    return;
  }
  sideColumn.replaceChildren(
    buildRisks(viewState.forecast && viewState.forecast.risks),
    buildContextPanel()
  );
}

let sideColumn = null;

function renderSeriesArea(container) {
  container.replaceChildren();
  viewState.charts = [];
  const series = viewState.forecast.series || [];

  if (viewState.mode === "chart") {
    const tempCard = el("section", { class: "w-panel w-chart-card", "aria-label": "Температура по дням" });
    const tempBox = el("div");
    tempCard.append(
      el("div", { class: "w-chart-head" }, [
        el("h2", { class: "w-h2", text: "Температура по дням" }),
        el("div", { class: "w-legend" }, [
          el("span", { class: "w-legend-item" }, [el("i", { class: "w-legend-swatch w-legend-swatch--band", style: "background:rgba(40,122,61,0.16);border:1px solid #9DBE9F" }), el("span", { text: "мин / макс" })]),
          el("span", { class: "w-legend-item" }, [el("i", { class: "w-legend-swatch", style: "background:#287A3D" }), el("span", { text: "средняя" })])
        ])
      ]),
      tempBox
    );

    const precipCard = el("section", { class: "w-panel w-chart-card", "aria-label": "Осадки по дням" });
    const precipBox = el("div");
    precipCard.append(
      el("div", { class: "w-chart-head" }, [
        el("h2", { class: "w-h2", text: "Осадки" }),
        el("div", { class: "w-legend" }, [
          el("span", { class: "w-legend-item" }, [el("i", { class: "w-legend-swatch w-legend-swatch--bar", style: "background:#4E7FAD" }), el("span", { text: "мм за сутки" })])
        ])
      ]),
      precipBox
    );

    container.append(tempCard, precipCard);
    viewState.charts.push(
      createChart(tempBox, series, { height: 252, drawTemp: true, drawPrecip: false }),
      createChart(precipBox, series, { height: 148, drawTemp: false, drawPrecip: true })
    );
  } else {
    container.append(
      el("section", { class: "w-panel", "aria-label": "Ряд данных по дням" }, [
        el("div", { class: "w-panel-head" }, [
          el("h2", { class: "w-h2", text: "Ряд данных по дням" }),
          el("span", { class: "w-count", text: `${series.length} запис${series.length === 1 ? "ь" : series.length < 5 ? "и" : "ей"}` })
        ]),
        buildSeriesTable(series)
      ])
    );
  }
}

function updateSaveButton() {
  const button = viewState.saveButton;
  if (!button) {
    return;
  }
  button.replaceChildren();
  if (viewState.saved) {
    button.disabled = true;
    button.className = "w-btn w-btn--secondary";
    button.append(icon("check", "w-ico"), el("span", { text: "Сохранено" }));
    button.title = "Этот прогноз уже сохранён в отчёты";
  } else {
    button.disabled = viewState.saving;
    button.className = "w-btn w-btn--primary";
    button.append(icon("save", "w-ico"), el("span", { text: viewState.saving ? "Сохранение…" : "Сохранить отчёт" }));
    button.removeAttribute("title");
  }
}

async function saveCurrentReport() {
  if (viewState.saving || viewState.saved || !viewState.forecast) {
    return;
  }
  viewState.saving = true;
  updateSaveButton();
  const req = viewState.forecast.request || {};
  try {
    const record = await addForecast(
      {
        lat: req.lat,
        lon: req.lon,
        varietyId: viewState.meta.varietyId || null,
        varietyName: req.varietyName === "Без сорта" ? "" : req.varietyName || "",
        rangeMonths: req.rangeMonths,
        targetDate: req.targetDate
      },
      viewState.forecast
    );
    viewState.saved = true;
    viewState.meta.savedRecord = record;
    showToast("Отчёт сохранён", "success");
    emit("forecasts:changed");
  } catch {
    showToast("Не удалось сохранить отчёт. Попробуйте ещё раз.", "error");
  } finally {
    viewState.saving = false;
    updateSaveButton();
    renderSideColumn();
  }
}

export function renderResults(forecast, meta = {}) {
  viewState.forecast = forecast;
  viewState.meta = meta;
  viewState.saved = Boolean(meta.savedRecord);
  viewState.saving = false;
  viewState.mode = "chart";

  const root = document.getElementById("results-root");
  root.replaceChildren();

  if (!forecast || !Array.isArray(forecast.series) || forecast.series.length === 0) {
    root.append(el("div", { class: "w-page" }, [
      el("div", { class: "w-state w-state--error" }, [
        el("span", { class: "w-state-ico" }, [icon("alert", "w-ico w-ico--lg")]),
        el("h3", { text: "Не удалось отобразить результат" }),
        el("p", { text: "Запись повреждена или не содержит данных." }),
        el("div", { class: "w-state-actions" }, [
          el("button", { class: "w-btn w-btn--secondary", type: "button", text: "К карте", onclick: () => emit("nav", { view: "map" }) })
        ])
      ])
    ]));
    return;
  }

  const req = forecast.request || {};
  const period = forecast.period || {};
  const generatedAt = meta.savedRecord ? meta.savedRecord.created_at : Date.now();

  viewState.saveButton = el("button", { class: "w-btn w-btn--primary", type: "button", onclick: saveCurrentReport });
  updateSaveButton();

  const backButton = el("button", { class: "w-btn w-btn--secondary", type: "button", onclick: () => emit("nav", { view: "map" }) }, [
    icon("back", "w-ico"), el("span", { text: "К карте" })
  ]);

  const demoBadge = el("span", {
    class: "w-badge w-badge--demo",
    tabindex: "0",
    role: "note",
    "aria-label": "Демонстрационные данные: не предназначены для агрономических решений",
    title: "Прогноз построен локальным демонстрационным движком"
  }, [el("i", { class: "w-dot" }), el("span", { text: "Демонстрационные данные" })]);

  const chips = el("div", { class: "w-chips" }, [
    el("div", { class: "w-chip" }, [el("b", { text: "Сорт" }), el("span", { text: req.varietyName || "Без сорта" })]),
    el("div", { class: "w-chip" }, [el("b", { text: "Точка" }), el("span", { text: `${formatSignedCoord(req.lat, "с.ш.", "ю.ш.")}, ${formatSignedCoord(req.lon, "в.д.", "з.д.")}` })]),
    el("div", { class: "w-chip" }, [el("b", { text: "Период" }), el("span", { text: formatPeriod(period.start, period.end) })])
  ]);

  const bar = el("header", { class: "w-results-bar" }, [
    el("div", { class: "w-rb-titles" }, [
      el("h1", { text: "Результаты прогноза" }),
      el("span", { text: `Сформирован ${formatDateTime(generatedAt)}` })
    ]),
    chips,
    demoBadge,
    el("div", { class: "w-rb-actions" }, [viewState.saveButton, backButton])
  ]);

  const seriesContainer = el("div", { class: "w-results-col" });
  sideColumn = el("div", { class: "w-results-col" });

  const seg = el("div", { class: "w-seg", role: "group", "aria-label": "Способ отображения ряда" });
  const chartButton = el("button", { class: "is-active", type: "button", "aria-pressed": "true", text: "График" });
  const tableButton = el("button", { type: "button", "aria-pressed": "false", text: "Таблица" });
  const setMode = (mode) => {
    viewState.mode = mode;
    chartButton.className = mode === "chart" ? "is-active" : "";
    tableButton.className = mode === "table" ? "is-active" : "";
    chartButton.setAttribute("aria-pressed", mode === "chart" ? "true" : "false");
    tableButton.setAttribute("aria-pressed", mode === "table" ? "true" : "false");
    renderSeriesArea(seriesContainer);
  };
  chartButton.addEventListener("click", () => setMode("chart"));
  tableButton.addEventListener("click", () => setMode("table"));
  seg.append(chartButton, tableButton);

  const seriesHead = el("div", { class: "w-toolbar", style: "margin:0" }, [
    el("h2", { class: "w-h2", text: "Данные по дням" }),
    el("span", { class: "w-spacer" }),
    seg
  ]);

  const main = el("div", { class: "w-results-main" }, [
    buildMetrics(forecast.indicators),
    el("div", { class: "w-results-grid" }, [
      el("div", { class: "w-results-col" }, [seriesHead, seriesContainer]),
      el("div", { class: "w-results-col" }, [sideColumn])
    ]),
    el("div", { class: "w-demo-note", role: "note" }, [
      icon("info", "w-ico w-ico--lg"),
      el("div", {}, [
        el("b", { text: "Демонстрационные данные. " }),
        el("span", { text: "Результат построен локальным демонстрационным движком и не предназначен для агрономических решений." })
      ])
    ])
  ]);

  renderSideColumn();
  renderSeriesArea(seriesContainer);

  root.append(bar, main);
  root.scrollTop = 0;

  // The view may have been hidden while rendering; lay charts out again once visible.
  requestAnimationFrame(() => {
    if (viewState.mode === "chart") {
      for (const chart of viewState.charts) {
        chart.render();
      }
    }
  });
}

export function onResultsShown() {
  if (viewState.mode !== "chart") {
    return;
  }
  requestAnimationFrame(() => {
    for (const chart of viewState.charts) {
      chart.render();
    }
  });
}

let resizeBound = false;
export function bindResultsResize() {
  if (resizeBound) {
    return;
  }
  resizeBound = true;
  let frame = null;
  window.addEventListener("resize", () => {
    const view = document.getElementById("view-results");
    if (!view || !view.classList.contains("is-active") || viewState.mode !== "chart") {
      return;
    }
    if (frame) {
      cancelAnimationFrame(frame);
    }
    frame = requestAnimationFrame(() => {
      frame = null;
      for (const chart of viewState.charts) {
        chart.render();
      }
    });
  });
}
