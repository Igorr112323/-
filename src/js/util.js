export const MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

export const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export const MONTHS_GEN_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

export function off(event, handler) {
  const set = listeners.get(event);
  if (set) {
    set.delete(handler);
  }
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (set) {
    for (const handler of set) {
      handler(payload);
    }
  }
}

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const key of Object.keys(props || {})) {
    const value = props[key];
    if (key === "class") {
      node.className = value;
    } else if (key === "dataset") {
      for (const dk of Object.keys(value)) {
        node.dataset[dk] = value[dk];
      }
    } else if (key === "text") {
      node.textContent = value;
    } else if (key === "on" && value && typeof value === "object") {
      for (const eventName of Object.keys(value)) {
        if (typeof value[eventName] === "function") {
          node.addEventListener(eventName, value[eventName]);
        }
      }
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined && value !== false) {
      node.setAttribute(key, value === true ? "" : value);
    }
  }
  const childArray = Array.isArray(children) ? children : (children ? [children] : []);
  for (const child of childArray) {
    if (child === null || child === undefined) {
      continue;
    }
    node.append(child);
  }
  return node;
}

export function svgIcon(pathData, viewBox = "0 0 24 24", className = "nav-ico") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  if (className) {
    svg.setAttribute("class", className);
  }
  const paths = Array.isArray(pathData) ? pathData : [pathData];
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

export function pad2(number) {
  return String(number).padStart(2, "0");
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date, months) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function formatFullDate(date) {
  return `${date.getDate()} ${MONTHS_GEN[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatShortDate(date) {
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
}

export function formatMonthYear(date) {
  return `${MONTHS_NOM[date.getMonth()]} ${date.getFullYear()}`;
}

export function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatCoord(value) {
  return Number(value).toFixed(4);
}

export function formatSignedCoord(value, positive, negative) {
  const sign = value >= 0 ? positive : negative;
  return `${Math.abs(Number(value)).toFixed(4)}° ${sign}`;
}

export function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function debounce(fn, wait) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatInteger(value) {
  return Math.round(value).toLocaleString("ru-RU");
}

export function assetUrl(relativePath) {
  return new URL(relativePath, document.baseURI).href;
}

// --- helpers for the light workspace screens (do not affect the map view) ---

export function parseISODate(iso) {
  if (iso instanceof Date) {
    return new Date(iso.getTime());
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function plural(count, one, few, many) {
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

export function formatPeriod(start, end) {
  const first = parseISODate(start);
  const last = parseISODate(end);
  if (!first || !last) {
    return "—";
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${pad2(first.getDate())}.${pad2(first.getMonth() + 1)} — ${pad2(last.getDate())}.${pad2(last.getMonth() + 1)}.${last.getFullYear()}`;
  }
  return `${formatShortDate(first)} — ${formatShortDate(last)}`;
}

export function formatDateTime(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return `${formatShortDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatDecimal(value, digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "—";
  }
  return num.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatDecimalOrDash(value, digits = 1, suffix = "") {
  const num = Number(value);
  if (value === null || value === undefined || !Number.isFinite(num)) {
    return "—";
  }
  return `${num.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`;
}

export function normalizeDecimalText(text) {
  return String(text ?? "").trim().replace(/\s|\u00A0/g, "").replace(/,/g, ".");
}

export function shortId(id) {
  const value = String(id || "");
  const core = value.includes("-") ? value.split("-").pop() : value;
  return core.slice(0, 8);
}

export function escapeCsvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",;\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(rows) {
  return "\uFEFF" + rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function setBusy(button, busy, busyLabel = "Выполняется…") {
  if (!button) {
    return;
  }
  if (busy) {
    if (!button.dataset.busySaved) {
      button.dataset.busySaved = "1";
      button.dataset.busyHtml = "";
      button._busyRestore = Array.from(button.childNodes);
    }
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    const spinner = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    spinner.setAttribute("viewBox", "0 0 24 24");
    spinner.setAttribute("class", "w-spinner");
    spinner.setAttribute("aria-hidden", "true");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "path");
    circle.setAttribute("d", "M12 3a9 9 0 1 0 9 9");
    spinner.append(circle);
    button.replaceChildren(spinner, el("span", { text: busyLabel }));
  } else if (button.dataset.busySaved) {
    delete button.dataset.busySaved;
    button.disabled = false;
    button.removeAttribute("aria-busy");
    const children = button._busyRestore || [];
    button.replaceChildren(...children);
    delete button._busyRestore;
  }
}
