const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

function isoOf(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function generateForecast(request) {
  const { lat, lon, varietyName, rangeMonths, targetDate } = request;

  const endDate = new Date(targetDate);
  endDate.setHours(23, 59, 59, 999);
  
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - rangeMonths);
  startDate.setHours(0, 0, 0, 0);

  const totalDays = Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);
  const seed = hashString(`${Number(lat).toFixed(2)}|${Number(lon).toFixed(2)}|${isoOf(endDate)}`);
  const random = seededRandom(seed);

  const hemisphere = lat >= 0 ? 1 : -1;
  const latitudeFactor = Math.abs(lat);
  const seasonalAmplitude = 2 + (latitudeFactor / 90) * 20;
  const annualMean = 27 - latitudeFactor * 0.3;
  const northernPeak = 172;
  const southernPeak = 355;
  const peak = hemisphere >= 0 ? northernPeak : southernPeak;
  const diurnalRange = 7 + random() * 3;
  const precipScale = 1.1 + random() * 1.6;

  const series = [];
  let gddSum = 0;
  let activeTempSum = 0;
  let precipTotal = 0;
  let frostDays = 0;
  let heatDays = 0;
  let tMinAll = Infinity;
  let tMaxAll = -Infinity;

  for (let index = 0; index < totalDays; index += 1) {
    const date = new Date(startDate.getTime() + index * 86400000);
    const doy = dayOfYear(date);
    const seasonal = Math.cos(((doy - peak) / 365) * Math.PI * 2);
    const wave = random() * 6 - 3;
    const tMean = annualMean + seasonalAmplitude * seasonal + wave;
    const spread = diurnalRange * (0.8 + random() * 0.4);
    const tMin = round(tMean - spread / 2);
    const tMax = round(tMean + spread / 2);
    const precip = round(Math.max(0, (0.5 + random() * 3.2 + (seasonal > 0.35 ? 1.1 : 0)) * precipScale * (0.4 + random())));
    const humidity = round(Math.min(96, Math.max(24, 58 + (seasonal * 12) + (random() * 22 - 11))));
    const soilMoisture = round(Math.min(100, Math.max(5, 34 + precip * 4.5 + (random() * 14 - 7))));

    if (tMean > 10) {
      activeTempSum += tMean;
      gddSum += Math.max(0, tMean - 10);
    }
    precipTotal += precip;
    if (tMin < 2) {
      frostDays += 1;
    }
    if (tMax > 32) {
      heatDays += 1;
    }
    tMinAll = Math.min(tMinAll, tMin);
    tMaxAll = Math.max(tMaxAll, tMax);

    series.push({
      date: isoOf(date),
      label: `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`,
      tMin,
      tMax,
      tMean: round(tMean),
      precip,
      humidity,
      soilMoisture
    });
  }

  const avgTemp = round(series.reduce((sum, day) => sum + day.tMean, 0) / series.length);
  const gtk = round(Math.min(5, Math.max(0, precipTotal / Math.max(1, activeTempSum / 10))), 2);
  const humidityAvg = round(series.reduce((sum, day) => sum + day.humidity, 0) / series.length);
  const soilAvg = round(series.reduce((sum, day) => sum + day.soilMoisture, 0) / series.length);

  const risks = [];
  if (frostDays > 0) {
    risks.push({
      id: "frost",
      name: "Заморозки",
      level: frostDays > totalDays * 0.2 ? "high" : frostDays > totalDays * 0.06 ? "medium" : "low",
      hint: `Дней с температурой ниже 2 °C: ${frostDays}`
    });
  }
  risks.push({
    id: "drought",
    name: "Засуха",
    level: precipTotal < totalDays * 0.7 ? "high" : precipTotal < totalDays * 1.4 ? "medium" : "low",
    hint: `Сумма осадков: ${round(precipTotal)} мм за период`
  });
  if (heatDays > 0) {
    risks.push({
      id: "heat",
      name: "Тепловой стресс",
      level: heatDays > totalDays * 0.25 ? "high" : heatDays > totalDays * 0.08 ? "medium" : "low",
      hint: `Дней с температурой выше 32 °C: ${heatDays}`
    });
  }
  risks.push({
    id: "moisture",
    name: "Влагообеспеченность",
    level: soilAvg < 30 ? "low" : soilAvg < 55 ? "medium" : "low",
    hint: `Средняя влажность почвы: ${soilAvg}%`
  });

  return {
    request: {
      lat: round(lat, 4),
      lon: round(lon, 4),
      varietyName: varietyName || "Без сорта",
      rangeMonths,
      targetDate: isoOf(endDate)
    },
    period: {
      start: isoOf(startDate),
      end: isoOf(endDate),
      days: totalDays
    },
    series,
    indicators: {
      avgTemp,
      maxTemp: round(tMaxAll),
      minTemp: round(tMinAll),
      totalPrecip: round(precipTotal),
      gdd: Math.round(gddSum),
      gtk,
      humidityAvg,
      soilAvg
    },
    risks
  };
}
