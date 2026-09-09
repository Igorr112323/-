import * as L from "../vendor/leaflet/leaflet-src.esm.js";
import { assetUrl } from "./util.js";

const RUSSIAN_CITIES = [
  ["Москва", 55.7558, 37.6173],
  ["Санкт-Петербург", 59.9311, 30.3609],
  ["Новосибирск", 55.0084, 82.9357],
  ["Екатеринбург", 56.8389, 60.6057],
  ["Казань", 55.7963, 49.1088],
  ["Нижний Новгород", 56.3269, 44.0059],
  ["Челябинск", 55.1644, 61.4368],
  ["Красноярск", 56.0153, 92.8932],
  ["Самара", 53.2001, 50.15],
  ["Уфа", 54.7388, 55.9721],
  ["Ростов-на-Дону", 47.2313, 39.7233],
  ["Омск", 54.9885, 73.3242],
  ["Краснодар", 45.0393, 38.9872],
  ["Воронеж", 51.672, 39.1843],
  ["Пермь", 58.0105, 56.2502],
  ["Волгоград", 48.708, 44.5133]
];

const FIELD_MARKER_HTML = `
<div class="field-marker-inner">
  <span class="field-marker-pulse"></span>
  <span class="field-marker-pin"></span>
  <span class="field-marker-core">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>
  </span>
</div>`;

const VECTOR_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const VECTOR_ATTR = "© OpenStreetMap contributors · © CARTO";
const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ATTR = "© Esri · Maxar · Earthstar Geographics";

function countryStyle() {
  return { color: "#8fbf9a", weight: 0.7, fillColor: "#163522", fillOpacity: 0.42 };
}

function regionStyle() {
  return { color: "#6e8d75", weight: 0.6, fillColor: "#1d3a28", fillOpacity: 0.3, className: "region-path" };
}

function glowStyle() {
  return { color: "#ffc53d", weight: 1.6, fillColor: "#ffc53d", fillOpacity: 0.32 };
}

function bindHover(layer, baseStyleFn) {
  layer.on({
    mouseover: (event) => {
      event.target.setStyle(glowStyle());
      const node = event.target.getElement();
      if (node) {
        node.classList.add("map-glow");
      }
    },
    mouseout: (event) => {
      event.target.setStyle(baseStyleFn());
      const node = event.target.getElement();
      if (node) {
        node.classList.remove("map-glow");
      }
    }
  });
}

export function initMap(container, { onSelect }) {
  const map = L.map(container, {
    center: [55, 40],
    zoom: 3,
    minZoom: 2,
    maxZoom: 18,
    zoomControl: false,
    attributionControl: false,
    worldCopyJump: true,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 90,
    inertia: true,
    zoomAnimation: true,
    fadeAnimation: true
  });

  L.control.zoom({ position: "topleft" }).addTo(map);
  const attribution = L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

  const vectorLayer = L.tileLayer(VECTOR_TILES, { subdomains: "abcd", maxZoom: 20, attribution: VECTOR_ATTR });
  const satelliteLayer = L.tileLayer(SATELLITE_TILES, { maxZoom: 19, attribution: SATELLITE_ATTR });

  const control = document.createElement("div");
  control.className = "basemap-control";
  const btnMap = document.createElement("button");
  btnMap.type = "button";
  btnMap.className = "basemap-btn is-active";
  btnMap.textContent = "Карта";
  const btnSat = document.createElement("button");
  btnSat.type = "button";
  btnSat.className = "basemap-btn";
  btnSat.textContent = "Спутник";
  control.append(btnMap, btnSat);
  container.parentElement.append(control);

  const badge = document.createElement("div");
  badge.className = "dive-badge hidden";
  const badgeName = document.createElement("span");
  badgeName.className = "dive-badge-name";
  const badgeKey = document.createElement("span");
  badgeKey.className = "dive-badge-key";
  badgeKey.textContent = "Esc";
  const badgeHint = document.createElement("span");
  badgeHint.className = "dive-badge-hint";
  badgeHint.textContent = "— назад";
  badge.append(badgeName, badgeKey, badgeHint);
  badge.addEventListener("click", () => escapeDive());
  container.parentElement.append(badge);

  let mode = "vector";

  function setMode(next) {
    if (mode === next) {
      return;
    }
    mode = next;
    if (mode === "satellite") {
      map.removeLayer(vectorLayer);
      satelliteLayer.addTo(map);
      container.classList.add("is-satellite");
      btnMap.classList.remove("is-active");
      btnSat.classList.add("is-active");
    } else {
      map.removeLayer(satelliteLayer);
      vectorLayer.addTo(map);
      container.classList.remove("is-satellite");
      btnMap.classList.add("is-active");
      btnSat.classList.remove("is-active");
    }
    
    container.classList.remove("is-glitching");
    void container.offsetWidth;
    container.classList.add("is-glitching");
    
    attribution.removeAttribution(VECTOR_ATTR);
    attribution.removeAttribution(SATELLITE_ATTR);
    attribution.addAttribution(mode === "satellite" ? SATELLITE_ATTR : VECTOR_ATTR);
  }

  btnMap.addEventListener("click", () => setMode("vector"));
  btnSat.addEventListener("click", () => setMode("satellite"));

  vectorLayer.addTo(map);
  attribution.addAttribution(VECTOR_ATTR);

  const cityLayer = L.layerGroup();
  for (const [name, lat, lon] of RUSSIAN_CITIES) {
    const icon = L.divIcon({
      className: "city-dot",
      html: `<span class="city-dot-inner"></span>`,
      iconSize: [11, 11],
      iconAnchor: [5.5, 5.5]
    });
    const marker = L.marker([lat, lon], { icon, interactive: true, keyboard: false }).bindTooltip(name, {
      direction: "top",
      offset: [0, -6],
      opacity: 1,
      className: "country-tip"
    }).addTo(cityLayer);

    marker.on("click", (event) => {
      L.DomEvent.stopPropagation(event);
      placeFieldMarker(event.latlng);
      onSelect({ lat: event.latlng.lat, lon: event.latlng.lng });
      spawnRipple(event.latlng);
    });
  }
  cityLayer.addTo(map);

  const diveStack = [];
  let divedId = null;
  let fieldMarker = null;

  function placeFieldMarker(latlng) {
    if (fieldMarker) {
      fieldMarker.remove();
    }
    const html = `
    <div class="tactical-marker tactical-marker-drop">
      <div class="tm-ring tm-r1"></div>
      <div class="tm-ring tm-r2"></div>
      <div class="tm-cross"></div>
      <div class="tm-label">ЦЕЛЬ ЗАХВАЧЕНА<br/>${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}</div>
    </div>`;
    const icon = L.divIcon({
      className: "tactical-icon-wrap",
      html,
      iconSize: [60, 60],
      iconAnchor: [30, 30]
    });
    fieldMarker = L.marker(latlng, { icon, keyboard: false, zIndexOffset: 500 }).addTo(map);
    
    const telStatus = document.getElementById("tel-status");
    if (telStatus) {
      telStatus.textContent = "ЦЕЛЬ ЗАХВАЧЕНА";
      telStatus.style.color = "var(--gold)";
    }
  }

  function spawnRipple(latlng) {
    const icon = L.divIcon({
      className: "click-ripple",
      html: "<i></i><i></i>",
      iconSize: [0, 0]
    });
    const marker = L.marker(latlng, { icon, interactive: false, keyboard: false, zIndexOffset: 600 }).addTo(map);
    setTimeout(() => marker.remove(), 950);
  }

  function showBadge(name, satellite) {
    badgeName.textContent = name;
    badgeHint.textContent = satellite ? "спутник · — назад" : "— назад";
    badge.classList.remove("hidden");
  }

  function hideBadge() {
    badge.classList.add("hidden");
  }

  function dive(feature, layer, intoSatellite) {
    if (divedId === feature.id) {
      return;
    }
    diveStack.push({ center: map.getCenter(), zoom: map.getZoom(), mode });
    divedId = feature.id;
    if (intoSatellite) {
      setMode("satellite");
    }
    map.flyToBounds(layer.getBounds(), { padding: [46, 46], maxZoom: intoSatellite ? 11 : 7, duration: 1.4 });
    showBadge(feature.name, intoSatellite);
  }

  function escapeDive() {
    if (diveStack.length === 0) {
      return;
    }
    const prev = diveStack.pop();
    divedId = null;
    hideBadge();
    setMode(prev.mode);
    map.flyTo(prev.center, prev.zoom, { duration: 1.1 });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      escapeDive();
    }
  });

  let countriesLayer = null;
  fetch(assetUrl("assets/world-50m.geojson"))
    .then((response) => {
      if (!response.ok) {
        throw new Error("Не удалось загрузить карту");
      }
      return response.json();
    })
    .then((collection) => {
      countriesLayer = L.geoJSON(collection, {
        style: countryStyle,
        onEachFeature: (feature, layer) => {
          bindHover(layer, countryStyle);
          layer.on("click", (event) => {
            L.DomEvent.stopPropagation(event);
            dive(feature, layer, false);
          });
        }
      }).addTo(map);
    })
    .catch(() => {
      window.dispatchEvent(new CustomEvent("map:error"));
    });

  let regionsLayer = null;
  let regionsReady = false;
  let regionsVisible = false;
  fetch(assetUrl("assets/russia-regions.geojson"))
    .then((response) => {
      if (!response.ok) {
        throw new Error("Не удалось загрузить регионы");
      }
      return response.json();
    })
    .then((collection) => {
      regionsLayer = L.geoJSON(collection, {
        style: regionStyle,
        onEachFeature: (feature, layer) => {
          const name = feature.properties && feature.properties.name;
          if (name) {
            layer.bindTooltip(String(name), { sticky: true, className: "region-tip", direction: "top", opacity: 1 });
          }
          bindHover(layer, regionStyle);
          layer.on("click", (event) => {
            L.DomEvent.stopPropagation(event);
            placeFieldMarker(event.latlng);
            onSelect({ lat: event.latlng.lat, lon: event.latlng.lng });
            spawnRipple(event.latlng);
            dive(feature, layer, true);
          });
        }
      });
      regionsReady = true;
      updateRegionVisibility();
    })
    .catch(() => {
      regionsReady = false;
    });

  function updateRegionVisibility() {
    if (!regionsReady || !regionsLayer) {
      return;
    }
    const show = map.getZoom() >= 5;
    if (show && !regionsVisible) {
      regionsLayer.addTo(map);
      regionsVisible = true;
    } else if (!show && regionsVisible) {
      map.removeLayer(regionsLayer);
      regionsVisible = false;
    }
  }

  map.on("zoomend", updateRegionVisibility);

  const telLat = document.getElementById("tel-lat");
  const telLon = document.getElementById("tel-lon");

  map.on("mousemove", (event) => {
    if (telLat && telLon) {
      telLat.textContent = event.latlng.lat.toFixed(4);
      telLon.textContent = event.latlng.lng.toFixed(4);
    }
  });

  map.on("click", (event) => {
    const el = document.createElement("div");
    el.className = "out-of-bounds";
    el.textContent = "ВНЕ ЗОНЫ ДОСТУПА";
    const pt = map.latLngToContainerPoint(event.latlng);
    el.style.left = pt.x + "px";
    el.style.top = pt.y + "px";
    container.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  });

  const updateCityVisibility = () => {
    if (map.getZoom() >= 4) {
      if (!map.hasLayer(cityLayer)) {
        cityLayer.addTo(map);
      }
    } else if (map.hasLayer(cityLayer)) {
      cityLayer.remove();
    }
  };
  map.on("zoomend", updateCityVisibility);
  updateCityVisibility();

  map.setView([18, 18], 2, { animate: false });
  setTimeout(() => map.flyTo([55, 40], 3.4, { duration: 2 }), 140);

  return {
    map,
    setPoint(latlng) {
      placeFieldMarker(latlng);
    },
    clearPoint() {
      if (fieldMarker) {
        fieldMarker.remove();
        fieldMarker = null;
      }
    },
    invalidate() {
      map.invalidateSize();
    }
  };
}
