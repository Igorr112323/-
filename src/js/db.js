import { loadDatabaseBytes, saveDatabaseBytes } from "./storage.js";
import { assetUrl, uid } from "./util.js";

const DATASET_KEEP_LIMIT = 30;
const DATASET_SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS varieties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  fao INTEGER NOT NULL DEFAULT 300,
  gtk REAL NOT NULL DEFAULT 1.0,
  gdd INTEGER NOT NULL DEFAULT 1400,
  drought INTEGER NOT NULL DEFAULT 5,
  cold INTEGER NOT NULL DEFAULT 5,
  yield REAL NOT NULL DEFAULT 90,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS forecasts (
  id TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  variety_id TEXT,
  variety_name TEXT,
  range_months INTEGER NOT NULL,
  target_date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  data_json TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  variety_name TEXT NOT NULL DEFAULT '',
  range_months INTEGER NOT NULL,
  target_date TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'demo',
  created_at INTEGER NOT NULL,
  data_json TEXT NOT NULL DEFAULT ''
);
`;

const SEED_VARIETIES = [
  { name: "Днепровский 181 СВ", fao: 250, gtk: 1.1, gdd: 2400, drought: 6, cold: 7, yield: 95, description: "Раннеспелый гибрид, устойчив к полеганию, хорошо адаптирован к умеренному климату." },
  { name: "Краснодарский 194 МВ", fao: 300, gtk: 1.0, gdd: 2600, drought: 7, cold: 6, yield: 100, description: "Среднеранний гибрид с высокой засухоустойчивостью и стабильной урожайностью." },
  { name: "Пионер П0023", fao: 210, gtk: 1.15, gdd: 2200, drought: 5, cold: 8, yield: 88, description: "Очень ранний холодостойкий гибрид для северных регионов выращивания." },
  { name: "ЛГ 30215", fao: 320, gtk: 0.95, gdd: 2800, drought: 7, cold: 5, yield: 110, description: "Среднеспелый интенсивный гибрид с высоким потенциалом урожайности." }
];

let sqlFactory = null;
let database = null;

function now() {
  return Date.now();
}

function normalizeNumeric(value) {
  return String(value ?? "").trim().replace(/[\s\u00A0]/g, "").replace(/,/g, ".");
}

function toNumber(value, fallback) {
  const parsed = Number(normalizeNumeric(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function toInteger(value, fallback) {
  const parsed = Number.parseInt(normalizeNumeric(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

export function validateVariety(input) {
  const errors = {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const fao = toInteger(input.fao, 0);
  const gtk = toNumber(input.gtk, 0);
  const gdd = toInteger(input.gdd, 0);
  const drought = toInteger(input.drought, 0);
  const cold = toInteger(input.cold, 0);
  const yieldValue = toNumber(input.yield, 0);

  if (!name) {
    errors.name = "Введите название сорта";
  } else if (name.length > 60) {
    errors.name = "Название не должно превышать 60 символов";
  }
  if (fao < 100 || fao > 900) {
    errors.fao = "ФАО: значение от 100 до 900";
  }
  if (gtk < 0.1 || gtk > 3) {
    errors.gtk = "ГТК: значение от 0.1 до 3.0";
  }
  if (gdd < 0 || gdd > 4000) {
    errors.gdd = "Сумма температур: 0–4000";
  }
  if (drought < 1 || drought > 10) {
    errors.drought = "Оценка от 1 до 10";
  }
  if (cold < 1 || cold > 10) {
    errors.cold = "Оценка от 1 до 10";
  }
  if (yieldValue < 1 || yieldValue > 300) {
    errors.yield = "Урожайность: 1–300 ц/га";
  }
  if (description.length > 500) {
    errors.description = "Описание не должно превышать 500 символов";
  }

  const value = { name, fao, gtk, gdd, drought, cold, yield: yieldValue, description };
  return { ok: Object.keys(errors).length === 0, errors, value };
}

export async function openDatabase() {
  if (database) {
    return database;
  }
  sqlFactory = globalThis.initSqlJs;
  const SQL = await sqlFactory({
    locateFile: (file) => assetUrl(`vendor/sqljs/${file}`)
  });
  const storedBytes = await loadDatabaseBytes();
  if (storedBytes && storedBytes.length > 0) {
    try {
      database = new SQL.Database(storedBytes);
    } catch {
      database = new SQL.Database();
    }
  } else {
    database = new SQL.Database();
  }
  database.run(SCHEMA);
  ensureColumn("forecasts", "data_json", "TEXT NOT NULL DEFAULT ''");
  seedDefaultVarieties();
  await persistDatabase();
  return database;
}

async function persistDatabase() {
  const exported = database.export();
  const saved = await saveDatabaseBytes(exported);
  if (!saved) {
    throw new Error("Не удалось сохранить базу данных");
  }
}

function seedDefaultVarieties() {
  const count = queryScalar("SELECT COUNT(*) AS count FROM varieties");
  if (count > 0) {
    return;
  }
  const insert = database.prepare(
    "INSERT INTO varieties (id, name, fao, gtk, gdd, drought, cold, yield, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const seed of SEED_VARIETIES) {
    const timestamp = now();
    insert.run([uid(), seed.name, seed.fao, seed.gtk, seed.gdd, seed.drought, seed.cold, seed.yield, seed.description, timestamp, timestamp]);
  }
  insert.free();
}

function queryScalar(sql, params = []) {
  const statement = database.prepare(sql);
  statement.bind(params);
  let result = 0;
  if (statement.step()) {
    const row = statement.getAsObject();
    result = row[Object.keys(row)[0]];
  }
  statement.free();
  return result;
}

function ensureColumn(tableName, columnName, columnType) {
  const rows = queryAll(`PRAGMA table_info(${tableName})`);
  const exists = rows.some((row) => row.name === columnName);
  if (!exists) {
    execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  }
}

function queryAll(sql, params = []) {
  const statement = database.prepare(sql);
  statement.bind(params);
  const rows = [];
  while (statement.step()) {
    rows.push(statement.getAsObject());
  }
  statement.free();
  return rows;
}

function execute(sql, params = []) {
  const statement = database.prepare(sql);
  statement.run(params);
  statement.free();
}

export async function listVarieties() {
  return queryAll("SELECT * FROM varieties ORDER BY name COLLATE NOCASE ASC");
}

export async function getVariety(id) {
  const rows = queryAll("SELECT * FROM varieties WHERE id = ?", [id]);
  return rows.length > 0 ? rows[0] : null;
}

export async function createVariety(input) {
  const validation = validateVariety(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, variety: null };
  }
  const value = validation.value;
  const id = uid();
  const timestamp = now();
  execute(
    "INSERT INTO varieties (id, name, fao, gtk, gdd, drought, cold, yield, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, value.name, value.fao, value.gtk, value.gdd, value.drought, value.cold, value.yield, value.description, timestamp, timestamp]
  );
  await persistDatabase();
  return { ok: true, errors: {}, variety: { id, ...value, created_at: timestamp, updated_at: timestamp } };
}

export async function updateVariety(id, input) {
  const existing = await getVariety(id);
  if (!existing) {
    return { ok: false, errors: { name: "Сорт не найден" }, variety: null };
  }
  const validation = validateVariety(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, variety: null };
  }
  const value = validation.value;
  const timestamp = now();
  execute(
    "UPDATE varieties SET name = ?, fao = ?, gtk = ?, gdd = ?, drought = ?, cold = ?, yield = ?, description = ?, updated_at = ? WHERE id = ?",
    [value.name, value.fao, value.gtk, value.gdd, value.drought, value.cold, value.yield, value.description, timestamp, id]
  );
  await persistDatabase();
  return { ok: true, errors: {}, variety: { id, ...value, created_at: existing.created_at, updated_at: timestamp } };
}

export async function deleteVariety(id) {
  const existing = await getVariety(id);
  if (!existing) {
    return { ok: false };
  }
  execute("DELETE FROM varieties WHERE id = ?", [id]);
  await persistDatabase();
  return { ok: true };
}

export async function addForecast(record, data = null) {
  const id = uid();
  const timestamp = now();
  execute(
    "INSERT INTO forecasts (id, lat, lon, variety_id, variety_name, range_months, target_date, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, record.lat, record.lon, record.varietyId || null, record.varietyName || "", record.rangeMonths, record.targetDate, timestamp, data ? packForecast(data) : ""]
  );
  await persistDatabase();
  return { id, ...record, created_at: timestamp };
}

// Compact storage format shared by reports and data sets; keeps the DB small in browser preview.
export function packForecast(forecast) {
  return JSON.stringify({
    v: DATASET_SCHEMA_VERSION,
    request: forecast.request,
    period: forecast.period,
    rows: (forecast.series || []).map((day) => [day.date, day.tMin, day.tMax, day.tMean, day.precip, day.humidity, day.soilMoisture]),
    indicators: forecast.indicators,
    risks: forecast.risks
  });
}

export function unpackForecast(text) {
  if (!text) {
    return null;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  // Legacy rows stored the full forecast object as-is.
  if (Array.isArray(parsed.series)) {
    return parsed;
  }
  if (Array.isArray(parsed.rows) && parsed.request && parsed.period) {
    const series = parsed.rows.map((row) => ({
      date: row[0],
      tMin: Number(row[1]),
      tMax: Number(row[2]),
      tMean: Number(row[3]),
      precip: Number(row[4]),
      humidity: Number(row[5]),
      soilMoisture: Number(row[6]),
      label: null
    }));
    if (series.some((day) => !Number.isFinite(day.tMean))) {
      return null;
    }
    return {
      request: parsed.request,
      period: parsed.period,
      series,
      indicators: parsed.indicators || null,
      risks: parsed.risks || []
    };
  }
  return null;
}

export async function addDataset(record, forecast) {
  const id = uid();
  const timestamp = now();
  execute(
    "INSERT INTO datasets (id, lat, lon, variety_name, range_months, target_date, period_start, period_end, record_count, source, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      record.lat,
      record.lon,
      record.varietyName || "",
      record.rangeMonths,
      record.targetDate,
      forecast.period.start,
      forecast.period.end,
      (forecast.series || []).length,
      "demo",
      timestamp,
      packForecast(forecast)
    ]
  );
  await pruneDatasets();
  await persistDatabase();
  return id;
}

// Keep only the most recent downloaded sets; reports hold their own snapshots and are never touched.
async function pruneDatasets() {
  const count = queryScalar("SELECT COUNT(*) AS count FROM datasets");
  if (count > DATASET_KEEP_LIMIT) {
    execute(
      "DELETE FROM datasets WHERE id NOT IN (SELECT id FROM datasets ORDER BY created_at DESC LIMIT ?)",
      [DATASET_KEEP_LIMIT]
    );
  }
}

export async function listDatasets(limit = 500) {
  return queryAll(
    "SELECT id, lat, lon, variety_name, range_months, target_date, period_start, period_end, record_count, source, created_at FROM datasets ORDER BY created_at DESC LIMIT ?",
    [limit]
  );
}

export async function getDataset(id) {
  const rows = queryAll("SELECT * FROM datasets WHERE id = ?", [id]);
  return rows.length > 0 ? rows[0] : null;
}

export async function deleteDataset(id) {
  execute("DELETE FROM datasets WHERE id = ?", [id]);
  await persistDatabase();
}

export async function clearAllDatasets() {
  execute("DELETE FROM datasets");
  await persistDatabase();
}

export async function listForecasts(limit = 12) {
  return queryAll("SELECT * FROM forecasts ORDER BY created_at DESC LIMIT ?", [limit]);
}

export async function getForecast(id) {
  const rows = queryAll("SELECT * FROM forecasts WHERE id = ?", [id]);
  return rows.length > 0 ? rows[0] : null;
}

export async function deleteForecast(id) {
  execute("DELETE FROM forecasts WHERE id = ?", [id]);
  await persistDatabase();
}

export async function clearAllForecasts() {
  execute("DELETE FROM forecasts");
  await persistDatabase();
}
