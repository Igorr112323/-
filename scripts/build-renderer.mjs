import { build } from "esbuild";
import JavaScriptObfuscator from "javascript-obfuscator";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jsDir = join(root, "src", "js");
const entry = join(jsDir, "app.js");

const obfuscateOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: false,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: false,
  shuffleStringArray: true,
  splitStrings: true,
  splitStringsChunkLength: 6,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.9,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  numbersToExpressions: true,
  simplify: true,
  target: "browser",
  sourceMap: false
};

const bundleResult = await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  target: ["chrome120"],
  minify: true,
  legalComments: "none",
  write: false
});

const bundledCode = bundleResult.outputFiles[0].text;
const obfuscated = JavaScriptObfuscator.obfuscate(bundledCode, obfuscateOptions);
writeFileSync(entry, obfuscated.getObfuscatedCode());

const nodeOptions = {
  compact: true,
  controlFlowFlattening: false,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: false,
  shuffleStringArray: true,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.8,
  transformObjectKeys: false,
  numbersToExpressions: false,
  simplify: true,
  target: "node",
  sourceMap: false
};

for (const file of ["main.js", "preload.js"]) {
  const target = join(root, "electron", file);
  const sourceCode = readFileSync(target, "utf8");
  const output = JavaScriptObfuscator.obfuscate(sourceCode, nodeOptions);
  writeFileSync(target, output.getObfuscatedCode());
}

for (const file of readdirSync(jsDir)) {
  if (file !== "app.js" && file.endsWith(".js")) {
    rmSync(join(jsDir, file), { force: true });
  }
}

const calculationsDir = join(root, "calculations");
for (const file of readdirSync(calculationsDir)) {
  if (file.endsWith(".js")) {
    rmSync(join(calculationsDir, file), { force: true });
  }
}

const sizeKb = (obfuscated.getObfuscatedCode().length / 1024).toFixed(1);
console.log(`renderer protected: src/js/app.js (${sizeKb} KB)`);
