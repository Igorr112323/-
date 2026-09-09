import * as L from "../vendor/leaflet/leaflet-src.esm.js";

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

function buildGraticule() {
  const lines = [];
  for (let lat = -80; lat <= 80; lat += 10) {
    lines.push(L.polyline([[lat, -180], [lat, 180]], { color: "rgba(255,255,255,0.05)", weight: 0.6, interactive: false }));
  }
  for (let lon = -180; lon <= 180; lon += 10) {
    lines.push(L.polyline([[-85, lon], [85, lon]], { color: "rgba(255,255,255,0.05)", weight: 0.6, interactive: false }));
  }
  return L.layerGroup(lines);
}

function countryStyle(feature) {
  const base = { color: "#2c4a37", weight: 0.7, fillColor: "#1b3325", fillOpacity: 0.92 };
  if (feature && feature.properties && feature.properties.name === "Antarctica") {
    base.fillColor = "#14201a";
  }
  return base;
}

function highlightStyle() {
  return { color: "#4c8a5c", weight: 1, fillColor: "#274a33", fillOpacity: 0.95 };
}

export function initMap(container, { onSelect }) {
  const map = L.map(container, {
    center: [50, 30],
    zoom: 4,
    minZoom: 2,
    maxZoom: 8,
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
  buildGraticule().addTo(map);

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

  let geoLayer = null;
  const worldGeoUrl = new URL("../assets/world-50m.geojson", import.meta.url).href;
  fetch(worldGeoUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Не удалось загрузить карту");
      }
      return response.json();
    })
    .then((collection) => {
      geoLayer = L.geoJSON(collection, {
        style: countryStyle,
        onEachFeature: (feature, layer) => {
          const name = feature.properties && feature.properties.name;
          if (name) {
            layer.bindTooltip(String(name), { sticky: true, className: "country-tip" });
          }
          layer.on({
            mouseover: (event) => event.target.setStyle(highlightStyle()),
            mouseout: (event) => geoLayer && geoLayer.resetStyle(event.target)
          });
        }
      }).addTo(map);
    })
    .catch(() => {
      window.dispatchEvent(new CustomEvent("map:error"));
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

  let fieldMarker = null;
  map.on("click", (event) => {
    const latlng = event.latlng;
    placeFieldMarker(latlng);
    onSelect({ lat: latlng.lat, lon: latlng.lng });
  });

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
