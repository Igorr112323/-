import { el, svgIcon, emit, formatFullDate, formatSignedCoord, uid } from "./util.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const ICONS = {
  temp: "M12 2a2 2 0 0 1 2 2v10.1a4 4 0 1 1-4 0V4a2 2 0 0 1 2-2z",
  precip: "M12 3s6 6.5 6 11a6 6 0 1 1-12 0c0-4.5 6-11 6-11z",
  gdd: "M13 2 4 14h6l-1 8 9-12h-6z",
  gtk: "M3 12h4l2-7 4 14 2-7h6",
  humidity: "M12 3s6 7 6 12a6 6 0 1 1-12 0c0-5 6-12 6-12z",
  soil: "M12 21a7 7 0 0 1-7-7c0-4 7-11 7-11s7 7 7 11a7 7 0 0 1-7 7z"
};

const RISK_LEVEL_LABEL = { low: "Низкий", medium: "Средний", high: "Высокий" };

function makeSvgElement(tag, attributes) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const key of Object.keys(attributes)) {
    node.setAttribute(key, attributes[key]);
  }
  return node;
}

function buildStatCard({ label, value, unit, icon, tone, barValue, barTone, index }) {
  const ico = el("span", { class: `stat-ico ${tone}` }, [svgIcon(ICONS[icon] || ICONS.temp)]);
  const valueNode = el("div", { class: "stat-value" }, [el("span", { text: value }), unit ? el("span", { class: "stat-unit", text: unit }) : null]);
  const card = el("article", { class: "card stat-card", style: `animation-delay:${index * 60}ms` }, [el("div", { class: "stat-label" }, [ico, el("span", { text: label })]), valueNode]);

  if (barValue !== undefined) {
    const fill = el("div", { class: "stat-bar-fill", style: `background:${barTone || "linear-gradient(90deg, var(--gold-strong), var(--gold))"}` });
    card.append(el("div", { class: "stat-bar" }, [fill]));
    setTimeout(() => {
      fill.style.width = `${Math.min(100, Math.max(0, barValue))}%`;
    }, 90 + index * 60);
  }
  return card;
}

function buildChart(series) {
  const width = 1000;
  const height = 300;
  const padLeft = 40;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 30;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const tMinValues = series.map((day) => day.tMin);
  const tMaxValues = series.map((day) => day.tMax);
  const precipValues = series.map((day) => day.precip);
  const tempMin = Math.min(...tMinValues) - 2;
  const tempMax = Math.max(...tMaxValues) + 2;
  const precipMax = Math.max(1, ...precipValues) * 1.15;

  const xFor = (index) => padLeft + (series.length <= 1 ? 0 : (index / (series.length - 1)) * plotWidth);
  const yForTemp = (value) => padTop + (1 - (value - tempMin) / (tempMax - tempMin)) * plotHeight;
  const barHeight = (value) => (value / precipMax) * plotHeight;

  const svg = makeSvgElement("svg", { class: "chart-canvas", viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none" });
  const gradientId = `temp-band-${uid()}`;
  const defs = makeSvgElement("defs", {});
  const bandGradient = makeSvgElement("linearGradient", { id: gradientId, x1: "0", y1: "0", x2: "0", y2: "1" });
  bandGradient.append(makeSvgElement("stop", { offset: "0%", "stop-color": "#ffc53d", "stop-opacity": "0.34" }));
  bandGradient.append(makeSvgElement("stop", { offset: "100%", "stop-color": "#ff9f43", "stop-opacity": "0.05" }));
  defs.append(bandGradient);
  svg.append(defs);

  for (let tick = 0; tick <= 4; tick += 1) {
    const value = tempMin + ((tempMax - tempMin) * tick) / 4;
    const y = yForTemp(value);
    svg.append(makeSvgElement("line", { x1: padLeft, y1: y, x2: width - padRight, y2: y, stroke: "rgba(255,255,255,0.06)", "stroke-width": 1 }));
    const label = makeSvgElement("text", { x: padLeft - 8, y: y + 4, "text-anchor": "end", "font-size": 12, fill: "#6d8073", "font-family": "Inter, sans-serif" });
    label.textContent = `${Math.round(value)}°`;
    svg.append(label);
  }

  const monthStops = [];
  for (let index = 0; index < series.length; index += 1) {
    if (index === 0 || series[index].date.slice(5, 7) !== series[index - 1].date.slice(5, 7)) {
      monthStops.push(index);
    }
  }
  for (const index of monthStops) {
    const x = xFor(index);
    svg.append(makeSvgElement("line", { x1: x, y1: padTop, x2: x, y2: height - padBottom, stroke: "rgba(255,255,255,0.05)", "stroke-width": 1 }));
    const label = makeSvgElement("text", { x, y: height - padBottom + 18, "text-anchor": "middle", "font-size": 12, fill: "#6d8073", "font-family": "Inter, sans-serif" });
    label.textContent = series[index].label;
    svg.append(label);
  }

  const bandPoints = [];
  for (let index = 0; index < series.length; index += 1) {
    bandPoints.push(`${xFor(index).toFixed(1)},${yForTemp(series[index].tMax).toFixed(1)}`);
  }
  for (let index = series.length - 1; index >= 0; index -= 1) {
    bandPoints.push(`${xFor(index).toFixed(1)},${yForTemp(series[index].tMin).toFixed(1)}`);
  }
  svg.append(makeSvgElement("polygon", { points: bandPoints.join(" "), fill: `url(#${gradientId})` }));

  const meanPoints = series.map((day, index) => `${xFor(index).toFixed(1)},${yForTemp(day.tMean).toFixed(1)}`).join(" ");
  const meanLine = makeSvgElement("polyline", { class: "chart-line", points: meanPoints, fill: "none", stroke: "#ffc53d", "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" });
  svg.append(meanLine);

  const barGroup = makeSvgElement("g", {});
  series.forEach((day, index) => {
    const bw = Math.max(1.2, plotWidth / series.length - 1.4);
    const bh = barHeight(day.precip);
    const bar = makeSvgElement("rect", {
      x: (xFor(index) - bw / 2).toFixed(1),
      y: (height - padBottom - bh).toFixed(1),
      width: bw.toFixed(1),
      height: Math.max(0, bh).toFixed(1),
      fill: "#3f8cff",
      rx: "1",
      opacity: "0.55"
    });
    barGroup.append(bar);
  });
  svg.append(barGroup);

  return svg;
}

function buildRiskChip(risk, index) {
  const dot = el("span", { class: `risk-dot ${risk.level}` });
  const name = el("span", { class: "risk-name", text: risk.name });
  const level = el("span", { class: "risk-level", text: `${RISK_LEVEL_LABEL[risk.level]} · ${risk.hint}` });
  return el("div", { class: "risk-chip", style: `animation-delay:${320 + index * 70}ms` }, [dot, el("div", { class: "risk-text" }, [name, level])]);
}

export function renderResults(forecast) {
  const container = document.getElementById("view-results");
  container.replaceChildren();

  const request = forecast.request;
  const indicators = forecast.indicators;

  const backButton = el(
    "button",
    {
      class: "page-back",
      type: "button",
      onclick: () => emit("nav", { view: "map" })
    },
    [svgIcon("M15 18l-6-6 6-6"), el("span", { text: "Назад к карте" })]
  );

  const head = el("div", { class: "page-head" }, [
    backButton,
    el("div", {}, [
      el("h1", { class: "page-title", text: "Результаты прогноза" }),
      el("p", { class: "page-sub", text: `Период: ${formatFullDate(new Date(forecast.period.start))} — ${formatFullDate(new Date(forecast.period.end))}` })
    ])
  ]);

  const page = el("div", { class: "view-page" }, [head]);

  const grid = el("div", { class: "results-grid" });

  grid.append(
    buildStatCard({ label: "Средняя температура", value: `${indicators.avgTemp}`, unit: "°C", icon: "temp", tone: "", barValue: ((indicators.avgTemp + 10) / 50) * 100, index: 0 }),
    buildStatCard({ label: "Макс. / мин.", value: `+${indicators.maxTemp} / ${indicators.minTemp}`, unit: "°C", icon: "temp", tone: "red", index: 1 }),
    buildStatCard({ label: "Сумма осадков", value: `${indicators.totalPrecip}`, unit: "мм", icon: "precip", tone: "blue", barValue: (indicators.totalPrecip / (forecast.period.days * 4)) * 100, index: 2 }),
    buildStatCard({ label: "Сумма активных температур", value: `${indicators.gdd}`, unit: "°C·дн", icon: "gdd", tone: "green", barValue: (indicators.gdd / 1600) * 100, index: 3 }),
    buildStatCard({ label: "ГТК Селянинова", value: `${indicators.gtk}`, icon: "gtk", tone: "teal", barValue: (indicators.gtk / 2.5) * 100, index: 4 }),
    buildStatCard({ label: "Влажность воздуха", value: `${indicators.humidityAvg}`, unit: "%", icon: "humidity", tone: "blue", barValue: indicators.humidityAvg, index: 5 })
  );

  const chartCard = el("article", { class: "card chart-card", style: "animation-delay:240ms" }, [
    el("div", { class: "chart-head" }, [
      el("h2", { class: "chart-title", text: "Температура и осадки" }),
      el("div", { class: "chart-legend" }, [
        el("span", { class: "chart-legend-item" }, [el("span", { class: "chart-swatch swatch-temp" }), el("span", { text: "Температура" })]),
        el("span", { class: "chart-legend-item" }, [el("span", { class: "chart-swatch swatch-precip" }), el("span", { text: "Осадки" })])
      ])
    ]),
    el("div", { class: "chart-body" }, [buildChart(forecast.series)])
  ]);

  grid.append(chartCard);

  const riskRow = el("div", { class: "risk-row" });
  forecast.risks.forEach((risk, index) => riskRow.append(buildRiskChip(risk, index)));
  grid.append(riskRow);

  const meta = el("div", { class: "card forecast-meta", style: "animation-delay:520ms" }, [
    el("span", {}, [el("b", { text: "Координаты: " }), el("span", { text: `${formatSignedCoord(request.lat, "с.ш.", "ю.ш.")}, ${formatSignedCoord(request.lon, "в.д.", "з.д.")}` })]),
    el("span", {}, [el("b", { text: "Сорт: " }), el("span", { text: request.varietyName })]),
    el("span", {}, [el("b", { text: "Дальность: " }), el("span", { text: `${request.rangeMonths} мес.` })]),
    el("span", {}, [el("b", { text: "Дата прогноза: " }), el("span", { text: formatFullDate(new Date(request.targetDate)) })]),
    el("span", {}, [el("b", { text: "Влажность почвы: " }), el("span", { text: `${indicators.soilAvg}%` })])
  ]);
  grid.append(meta);

  const note = el("div", { class: "demo-note", style: "animation-delay:600ms", text: "Прогноз построен демонстрационным модулем расчётов. Подключение реального метео-движка выполняется в папке calculations." });
  grid.append(note);

  page.append(grid);
  container.append(page);

  requestAnimationFrame(() => {
    const line = container.querySelector(".chart-line");
    if (line && typeof line.getTotalLength === "function") {
      const length = line.getTotalLength();
      line.style.strokeDasharray = String(length);
      line.style.strokeDashoffset = String(length);
      requestAnimationFrame(() => {
        line.style.transition = "stroke-dashoffset 1.4s cubic-bezier(0.22, 1, 0.36, 1)";
        line.style.strokeDashoffset = "0";
      });
    }
  });
}
