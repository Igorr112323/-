const { app, BrowserWindow, protocol, ipcMain, net } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const APP_ROOT = path.join(__dirname, "..");
const SCHEME = "app";
const HOST = "bundle";
const MAX_DB_BYTES = 64 * 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".geojson": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

function resolveAppFile(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const normalized = decoded.replace(/^\/+/, "");
  const target = path.resolve(APP_ROOT, normalized);
  if (target !== APP_ROOT && !target.startsWith(APP_ROOT + path.sep)) {
    return null;
  }
  return target;
}

function isTrustedSender(event) {
  const frameUrl = event.senderFrame ? event.senderFrame.url : "";
  return frameUrl.startsWith(`${SCHEME}://${HOST}`);
}

function databasePath() {
  return path.join(app.getPath("userData"), "agroprognoz.sqlite");
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: "#08100c",
    title: "АгроПрогноз — Кукуруза",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}`)) {
      event.preventDefault();
    }
  });

  mainWindow.loadURL(`${SCHEME}://${HOST}/src/index.html`);
}

async function registerProtocol() {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== HOST) {
        return new Response("Forbidden", { status: 403 });
      }
      let pathname = url.pathname;
      if (pathname === "/" || pathname === "") {
        pathname = "/src/index.html";
      }
      const filePath = resolveAppFile(pathname);
      if (!filePath) {
        return new Response("Forbidden", { status: 403 });
      }
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) {
        return new Response("Not found", { status: 404 });
      }
      const extension = path.extname(filePath).toLowerCase();
      const mimeType = MIME_TYPES[extension] || "application/octet-stream";
      const fileResponse = await net.fetch(pathToFileURL(filePath).toString());
      return new Response(fileResponse.body, {
        status: fileResponse.status,
        headers: { "Content-Type": mimeType }
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function registerIpc() {
  ipcMain.handle("db:load", async (event) => {
    if (!isTrustedSender(event)) {
      return null;
    }
    try {
      const data = await fs.promises.readFile(databasePath());
      return new Uint8Array(data);
    } catch {
      return null;
    }
  });

  ipcMain.handle("db:save", async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error("Forbidden");
    }
    const bytes = payload instanceof Uint8Array ? payload : ArrayBuffer.isView(payload) ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength) : null;
    if (!bytes) {
      throw new Error("Invalid payload");
    }
    if (bytes.byteLength > MAX_DB_BYTES) {
      throw new Error("Payload too large");
    }
    const target = databasePath();
    const temp = `${target}.tmp`;
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(temp, bytes);
    await fs.promises.rename(temp, target);
    return true;
  });
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("com.agroprognoz.corn");
    await registerProtocol();
    registerIpc();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
