import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = join(root, 'node_modules');

const copy = (from, to) => {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
};

const vendorLeaflet = () => {
  const src = join(nodeModules, 'leaflet', 'dist');
  const dst = join(root, 'src', 'vendor', 'leaflet');
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  copy(join(src, 'leaflet-src.esm.js'), join(dst, 'leaflet-src.esm.js'));
  copy(join(src, 'leaflet.css'), join(dst, 'leaflet.css'));
  copy(join(src, 'images'), join(dst, 'images'));
};

const vendorSql = () => {
  const src = join(nodeModules, 'sql.js', 'dist');
  const dst = join(root, 'src', 'vendor', 'sqljs');
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  copy(join(src, 'sql-wasm.js'), join(dst, 'sql-wasm.js'));
  copy(join(src, 'sql-wasm.wasm'), join(dst, 'sql-wasm.wasm'));
};

const vendorFonts = () => {
  const src = join(nodeModules, '@fontsource-variable', 'inter', 'files');
  const dst = join(root, 'src', 'vendor', 'fonts');
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  copy(join(src, 'inter-latin-wght-normal.woff2'), join(dst, 'inter-latin-wght-normal.woff2'));
  copy(join(src, 'inter-cyrillic-wght-normal.woff2'), join(dst, 'inter-cyrillic-wght-normal.woff2'));
};

const buildWorldGeoJson = () => {
  const topoPath = join(nodeModules, 'world-atlas', 'countries-50m.json');
  const topo = JSON.parse(readFileSync(topoPath, 'utf8'));
  const collection = feature(topo, topo.objects.countries);
  collection.features = collection.features.filter((f) => f.geometry && f.geometry.coordinates && f.geometry.coordinates.length);
  const outPath = join(root, 'src', 'assets', 'world-50m.geojson');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(collection));
};

const buildIcons = async () => {
  const sourcePath = join(root, 'build', 'icon-source.png');
  const image = sharp(sourcePath);
  const meta = await image.metadata();

  const png512 = await image.clone().resize(512, 512, { fit: 'cover' }).png().toBuffer();
  mkdirSync(join(root, 'build'), { recursive: true });
  mkdirSync(join(root, 'src', 'assets'), { recursive: true });
  writeFileSync(join(root, 'build', 'icon.png'), png512);
  writeFileSync(join(root, 'src', 'assets', 'icon.png'), png512);

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = await Promise.all(sizes.map((size) => image.clone().resize(size, size, { fit: 'cover' }).png().toBuffer()));
  const ico = await pngToIco(buffers);
  writeFileSync(join(root, 'build', 'icon.ico'), ico);
  return meta;
};

vendorLeaflet();
vendorSql();
vendorFonts();
buildWorldGeoJson();
const meta = await buildIcons();
console.log(JSON.stringify({ worldGeoJson: 'src/assets/world-50m.geojson', iconSource: meta, ico: 'build/icon.ico' }));
