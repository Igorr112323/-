import { el, emit, formatFullDate, formatSignedCoord } from "./util.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function makeSvg(tag, attributes) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const k of Object.keys(attributes)) node.setAttribute(k, attributes[k]);
  return node;
}

function renderChart(container, series) {
  const width = container.clientWidth || 600;
  const height = container.clientHeight || 300;
  const pad = { t: 20, r: 20, b: 30, l: 40 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;

  const svg = makeSvg("svg", { width: "100%", height: "100%", viewBox: `0 0 ${width} ${height}` });
  
  const temps = series.map(s => s.tAvg);
  const precips = series.map(s => s.precip);
  const maxT = Math.max(...temps, 25);
  const minT = Math.min(...temps, -5);
  const maxP = Math.max(...precips, 100);

  const tScale = val => pad.t + h - ((val - minT) / (maxT - minT)) * h;
  const pScale = val => pad.t + h - (val / maxP) * (h * 0.4);
  const xScale = idx => pad.l + (idx / (series.length - 1)) * w;

  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (i / 4) * h;
    svg.appendChild(makeSvg("line", { class: "chart-grid", x1: pad.l, y1: y, x2: pad.l + w, y2: y }));
    svg.appendChild(makeSvg("text", { class: "chart-axis", x: pad.l - 5, y: y + 4, "text-anchor": "end" }));
  }

  series.forEach((s, i) => {
    const x = xScale(i);
    const y = pScale(s.precip);
    const bw = w / series.length * 0.6;
    svg.appendChild(makeSvg("rect", { class: "chart-bar", x: x - bw/2, y, width: bw, height: pad.t + h - y }));
  });

  const pathData = series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${tScale(s.tAvg)}`).join(" ");
  svg.appendChild(makeSvg("path", { class: "chart-line", d: pathData }));

  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const idx = Math.floor(i * (series.length - 1) / steps);
    if (!series[idx]) continue;
    const x = xScale(idx);
    const textNode = makeSvg("text", { class: "chart-axis", x, y: height - 5, "text-anchor": "middle" });
    textNode.textContent = formatFullDate(series[idx].date);
    svg.appendChild(textNode);
  }

  container.innerHTML = "";
  container.appendChild(svg);
}

export function renderResults(report) {
  const view = document.getElementById("view-results");
  view.innerHTML = "";

  const data = report.data;
  const riskLabels = { Low: "Низкий", Medium: "Средний", High: "Высокий" };
  const riskLabel = riskLabels[data.riskLevel] || data.riskLevel;

  const titleBox = el("div", { class: "page-title-box" }, [
    el("div", {}, [
      el("h1", { class: "page-title", text: "Аналитический прогноз" }),
      el("p", { class: "page-subtitle", text: `ID: ${report.id.split("-")[0]} · Участок: ${formatSignedCoord(report.lat, report.lon)} · Сорт: ${report.variety_name}` })
    ]),
    el("button", { class: "btn-secondary", text: "К списку отчётов", on: { click: () => emit("nav", "reports") } })
  ]);

  const kpis = [
    { label: "Сумма активных температур", val: `${Math.round(data.gdd)}°C`, sub: "База 10°C" },
    { label: "ГТК Селянинова", val: data.gtk.toFixed(2), sub: "Показатель увлажнения" },
    { label: "Осадки за период", val: `${Math.round(data.totalPrecip)} мм`, sub: "Суммарно" },
    { label: "Уровень риска", val: riskLabel, sub: "Комплексная оценка", cls: `risk-${data.riskLevel}` }
  ];

  const grid = el("div", { class: "result-grid" }, [
    el("div", { class: "kpi-box" }, kpis.map(k => el("div", { class: `kpi-card ${k.cls ? `risk-bg-${data.riskLevel}` : ''}` }, [
      el("div", { class: "kpi-label", text: k.label }),
      el("div", { class: `kpi-val ${k.cls || ''}`, text: k.val }),
      el("div", { class: "kpi-sub", text: k.sub })
    ]))),
    el("div", { class: "chart-card" })
  ]);

  const page = el("div", { class: "page-container" }, [titleBox, grid]);
  view.appendChild(page);

  setTimeout(() => {
    const chartCard = view.querySelector(".chart-card");
    if (chartCard) renderChart(chartCard, data.series);
  }, 50);
}