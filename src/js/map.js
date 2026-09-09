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

const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ATTR = "© Esri · Maxar · Earthstar Geographics";

function regionStyle() {
  return { color: "rgba(255, 255, 255, 0.4)", weight: 1.2, fillColor: "rgba(255, 255, 255, 0)", fillOpacity: 0 };
}

function hoverStyle() {
  return { color: "#ffc53d", weight: 2, fillColor: "rgba(255, 197, 61, 0.15)", fillOpacity: 1 };
}

function bindHover(layer, baseStyleFn) {
  layer.on({
    mouseover: (event) => {
      event.target.setStyle(hoverStyle());
    },
    mouseout: (event) => {
      event.target.setStyle(baseStyleFn());
    }
  });
}

export function initMap(container, { onSelect }) {
  const map = L.map(container, {
    center: [60, 90],
    zoom: 3.5,
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
  attribution.addAttribution(SATELLITE_ATTR);

  const satelliteLayer = L.tileLayer(SATELLITE_TILES, { maxZoom: 19, attribution: SATELLITE_ATTR }).addTo(map);

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

  let fieldMarker = null;

  function placeFieldMarker(latlng) {
    if (fieldMarker) {
      fieldMarker.remove();
    }
    const html = `
    <div class="beacon-marker">
      <div class="beacon-ring"></div>
      <div class="beacon-core"></div>
    </div>`;
    const icon = L.divIcon({
      className: "beacon-wrap",
      html,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
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

  let regionsLayer = null;
  let regionsReady = false;
  
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
          });
        }
      }).addTo(map);
      regionsReady = true;
    })
    .catch(() => {
      regionsReady = false;
    });

  map.on("click", (event) => {
    const el = document.createElement("div");
    el.className = "sat-out-of-bounds";
    el.innerHTML = "<span>Доступно только в РФ</span>";
    const pt = map.latLngToContainerPoint(event.latlng);
    el.style.left = pt.x + "px";
    el.style.top = pt.y + "px";
    container.appendChild(el);
    setTimeout(() => el.remove(), 1200);
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

  // Cinematic initial fly-in
  map.setView([0, 90], 2, { animate: false });
  setTimeout(() => map.flyTo([60, 90], 3.5, { duration: 2.5 }), 140);

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
