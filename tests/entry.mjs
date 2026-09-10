// Test-only entry: boots the real app and exposes the modules the harness drives.
import "../src/js/app.js";
import { generateForecast } from "../calculations/forecast_engine.js";
import * as db from "../src/js/db.js";
import { renderResults } from "../src/js/results.js";
import { closeAllDialogs } from "../src/js/ui.js";
import { refreshData } from "../src/js/data.js";
import { refreshReports } from "../src/js/reports.js";
import * as util from "../src/js/util.js";

window.__hooks = {
  generateForecast, db, renderResults, refreshData, refreshReports, util,
  emit: util.emit, on: util.on, closeAllDialogs
};
