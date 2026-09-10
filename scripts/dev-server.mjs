import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { resolve, join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 4173);
const host = "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
};

function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const normalized = normalize(decoded).replace(/^([/\\])+/, "");
  const target = resolve(root, normalized);
  if (target !== root && !target.startsWith(root + "/")) {
    return null;
  }
  return target;
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end();
    return;
  }

  const requested = new URL(request.url, `http://${request.headers.host || "localhost"}`).pathname;
  const urlPath = requested === "/" ? "/src/index.html" : requested;
  const filePath = resolvePath(urlPath);

  if (!filePath) {
    response.writeHead(403);
    response.end();
    return;
  }

  try {
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      response.writeHead(404);
      response.end();
      return;
    }
    const extension = extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME[extension] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff"
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end();
  }
});

server.listen(port, host, () => {
  console.log(`Preview: http://localhost:${port}`);
});
