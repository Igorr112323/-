import * as L from "../vendor/leaflet/leaflet-src.esm.js";
import { assetUrl } from "./util.js";

const MAJOR_CITIES = [
  ["Москва", 55.7558, 37.6173],
  ["Санкт-Петербург", 59.9311, 30.3609],
  ["Киев", 50.4501, 30.5234],
  ["Минск", 53.9006, 27.559],
  ["Варшава", 52.2297, 21.0122],
  ["Берлин", 52.52, 13.405],
  ["Париж", 48.8566, 2.3522],
  ["Лондон", 51.5074, -0.1278],
  ["Мадрид", 40.4168, -3.7038],
  ["Рим", 41.9028, 12.4964],
  ["Амстердам", 52.3676, 4.9041],
  ["Вена", 48.2082, 16.3738],
  ["Прага", 50.0755, 14.4378],
  ["Будапешт", 47.4979, 19.0402],
  ["Бухарест", 44.4268, 26.1025],
  ["София", 42.6977, 23.3219],
  ["Стамбул", 41.0082, 28.9784],
  ["Анкара", 39.9334, 32.8597],
  ["Каир", 30.0444, 31.2357],
  ["Лагос", 6.5244, 3.3792],
  ["Найроби", -1.2921, 36.8219],
  ["Йоханнесбург", -26.2041, 28.0473],
  ["Кейптаун", -33.9249, 18.4241],
  ["Нью-Йорк", 40.7128, -74.006],
  ["Чикаго", 41.8781, -87.6298],
  ["Лос-Анджелес", 34.0522, -118.2437],
  ["Мехико", 19.4326, -99.1332],
  ["Сан-Паулу", -23.5505, -46.6333],
  ["Буэнос-Айрес", -34.6037, -58.3816],
  ["Лима", -12.0464, -77.0428],
  ["Богота", 4.711, -74.0721],
  ["Каракас", 10.4806, -66.9036],
  ["Торонто", 43.6532, -79.3832],
  ["Монреаль", 45.5017, -73.5673],
  ["Ванкувер", 49.2827, -123.1207],
  ["Рейкьявик", 64.1466, -21.9426],
  ["Стокгольм", 59.3293, 18.0686],
  ["Осло", 59.9139, 10.7522],
  ["Хельсинки", 60.1699, 24.9384],
  ["Копенгаген", 55.6761, 12.5683],
  ["Лиссабон", 38.7223, -9.1393],
  ["Афины", 37.9838, 23.7275],
  ["Тель-Авив", 32.0853, 34.7818],
  ["Дубай", 25.2048, 55.2708],
  ["Тегеран", 35.6892, 51.389],
  ["Карачи", 24.8607, 67.0011],
  ["Мумбаи", 19.076, 72.8777],
  ["Дели", 28.6139, 77.209],
  ["Дакка", 23.8103, 90.4125],
  ["Бангкок", 13.7563, 100.5018],
  ["Джакарта", -6.2088, 106.8456],
  ["Сингапур", 1.3521, 103.8198],
  ["Гонконг", 22.3193, 114.1694],
  ["Шанхай", 31.2304, 121.4737],
  ["Пекин", 39.9042, 116.4074],
  ["Сеул", 37.5665, 126.978],
  ["Токио", 35.6762, 139.6503],
  ["Осака", 34.6937, 135.5023],
  ["Сидней", -33.8688, 151.2093],
  ["Мельбурн", -37.8136, 144.9631],
  ["Окленд", -36.8509, 174.7645],
  ["Гонолулу", 21.3069, -157.8583]
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
  return { color: "#6e8d75", weight: 0.6, fillColor: "#1d3a28", fillOpacity: 0.3 };
}

function glowStyle() {
  return { color: "#ffc53d", weight: 1.6, fillColor: "#ffc53d", fillOpacity: 0.32 };
}

function bindHover(layer, layerRef) {
  layer.on({
    mouseover: (event) => {
      event.target.setStyle(glowStyle());
      const node = event.target.getElement();
      if (node) {
        node.classList.add("map-glow");
      }
    },
    mouseout: (event) => {
      layerRef.resetStyle(event.target);
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
    attribution.removeAttribution(VECTOR_ATTR);
    attribution.removeAttribution(SATELLITE_ATTR);
    attribution.addAttribution(mode === "satellite" ? SATELLITE_ATTR : VECTOR_ATTR);
  }

  btnMap.addEventListener("click", () => setMode("vector"));
  btnSat.addEventListener("click", () => setMode("satellite"));

  vectorLayer.addTo(map);
  attribution.addAttribution(VECTOR_ATTR);

  const cityLayer = L.layerGroup();
  for (const [name, lat, lon] of MAJOR_CITIES) {
    const icon = L.divIcon({
      className: "city-dot",
      html: `<span class="city-dot-inner"></span>`,
      iconSize: [7, 7],
      iconAnchor: [3.5, 3.5]
    });
    L.marker([lat, lon], { icon, interactive: true, keyboard: false }).bindTooltip(name, {
      direction: "top",
      offset: [0, -6],
      opacity: 1,
      className: "country-tip"
    }).addTo(cityLayer);
  }
  cityLayer.addTo(map);

  const diveStack = [];
  let divedId = null;
  let fieldMarker = null;

  function placeFieldMarker(latlng) {
    if (fieldMarker) {
      fieldMarker.remove();
    }
    const icon = L.divIcon({
      className: "field-marker",
      html: FIELD_MARKER_HTML,
      iconSize: [44, 48],
      iconAnchor: [22, 46]
    });
    fieldMarker = L.marker(latlng, { icon, keyboard: false, zIndexOffset: 500 }).addTo(map);
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
          bindHover(layer, countriesLayer);
          layer.on("click", (event) => {
            L.DomEvent.stopPropagation(event);
            placeFieldMarker(event.latlng);
            onSelect({ lat: event.latlng.lat, lon: event.latlng.lng });
            spawnRipple(event.latlng);
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
          bindHover(layer, regionsLayer);
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

  map.on("click", (event) => {
    placeFieldMarker(event.latlng);
    onSelect({ lat: event.latlng.lat, lon: event.latlng.lng });
    spawnRipple(event.latlng);
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
