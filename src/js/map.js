import * as L from "../vendor/leaflet/leaflet-src.esm.js";
import { assetUrl } from "./util.js";

const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ATTR = "© Esri · Maxar · Earthstar Geographics";

function regionStyle() {
  return { color: "transparent", weight: 0, fillColor: "transparent" };
}

function hoverStyle() {
  return { color: "#10b981", weight: 1.5, fillColor: "rgba(16, 185, 129, 0.15)", fillOpacity: 1 };
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

  L.tileLayer(SATELLITE_TILES, { maxZoom: 19, attribution: SATELLITE_ATTR }).addTo(map);

  const btnOverview = document.createElement("button");
  btnOverview.className = "btn-secondary btn-overview";
  btnOverview.textContent = "Обзор России";
  btnOverview.type = "button";
  btnOverview.onclick = () => map.flyTo([60, 90], 3.5, { duration: 1.5 });
  container.appendChild(btnOverview);

  const staticInfo = document.createElement("div");
  staticInfo.className = "map-static-info";
  staticInfo.textContent = "Выбор участка доступен только на территории России";
  container.appendChild(staticInfo);

  let fieldMarker = null;

  function placeFieldMarker(latlng) {
    if (fieldMarker) {
      fieldMarker.remove();
    }
    const html = `
    <div class="beacon-marker-v2">
      <div class="bm-ring"></div>
      <div class="bm-core"></div>
    </div>`;
    const icon = L.divIcon({
      className: "beacon-wrap",
      html,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    fieldMarker = L.marker(latlng, { icon, keyboard: false, zIndexOffset: 500 }).addTo(map);
  }

  function spawnEffects(latlng) {
    const html = `
      <div class="ripple-v2"></div>
      <div class="success-float-lbl">Участок выбран</div>
    `;
    const icon = L.divIcon({ className: "ripple-icon", html, iconSize: [0, 0] });
    const marker = L.marker(latlng, { icon, interactive: false, keyboard: false, zIndexOffset: 600 }).addTo(map);
    setTimeout(() => marker.remove(), 1500);
  }

  let hoverTimeout = null;
  let currentFeatureName = "";
  let currentLatLng = null;
  let isDragging = false;

  map.on("dragstart", () => { isDragging = true; container.classList.remove("is-hovering-russia"); hc.classList.remove("is-visible"); });
  map.on("dragend", () => { isDragging = false; });

  const hc = document.createElement('div');
  hc.className = 'hover-card';
  container.appendChild(hc);

  let animFrame = null;
  
  function updateHcContent() {
    if (!currentLatLng) return;
    const lat = currentLatLng.lat.toFixed(2);
    const lon = currentLatLng.lng.toFixed(2);
    hc.innerHTML = `
      <div class="hc-title">${currentFeatureName}</div>
      <div class="hc-sub">Регион России</div>
      <div class="hc-coords">${lat}° с. ш. · ${lon}° в. д.</div>
      <div class="hc-action">Нажмите, чтобы выбрать участок</div>
    `;
  }

  function handleMouseMove(e) {
    if (isDragging) return;
    currentLatLng = e.latlng;
    if (hc.classList.contains('is-visible')) {
      if (animFrame) cancelAnimationFrame(animFrame);
      animFrame = requestAnimationFrame(() => {
        updateHcContent();
        const pt = map.latLngToContainerPoint(currentLatLng);
        hc.style.transform = `translate(${pt.x + 15}px, ${pt.y + 15}px)`;
      });
    }
  }

  fetch(assetUrl("assets/russia-regions.geojson"))
    .then((response) => {
      if (!response.ok) throw new Error("Не удалось загрузить регионы");
      return response.json();
    })
    .then((collection) => {
      let holes = [];
      collection.features.forEach(f => {
        if (f.geometry.type === "Polygon") {
          holes.push(f.geometry.coordinates[0]);
        } else if (f.geometry.type === "MultiPolygon") {
          f.geometry.coordinates.forEach(poly => holes.push(poly[0]));
        }
      });
      const inverted = {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [[-360, -90], [360, -90], [360, 90], [-360, 90], [-360, -90]],
            ...holes
          ]
        }
      };
      L.geoJSON(inverted, {
        style: { fillColor: '#000', fillOpacity: 0.35, weight: 1, color: '#10b981', className: 'world-mask', interactive: false }
      }).addTo(map);

      L.geoJSON(collection, {
        style: regionStyle,
        onEachFeature: (feature, layer) => {
          layer.on({
            mouseover: (event) => {
              if (isDragging) return;
              event.target.setStyle(hoverStyle());
              container.classList.add('is-hovering-russia');
              currentFeatureName = feature.properties?.name || "Регион России";
              clearTimeout(hoverTimeout);
              hoverTimeout = setTimeout(() => {
                if (isDragging) return;
                hc.classList.add('is-visible');
                updateHcContent();
              }, 250);
            },
            mousemove: handleMouseMove,
            mouseout: (event) => {
              event.target.setStyle(regionStyle());
              container.classList.remove('is-hovering-russia');
              clearTimeout(hoverTimeout);
              hoverTimeout = null;
              hc.classList.remove('is-visible');
            },
            click: (event) => {
              L.DomEvent.stopPropagation(event);
              if (isDragging) return;
              placeFieldMarker(event.latlng);
              onSelect({ lat: event.latlng.lat, lon: event.latlng.lng });
              spawnEffects(event.latlng);
            }
          });
        }
      }).addTo(map);
    })
    .catch(() => {});

  map.on("click", (event) => {
    if (isDragging) return;
    const icon = L.divIcon({ className: "error-icon", html: "<div class='error-float-lbl'>Выберите точку на территории России</div>", iconSize: [0, 0] });
    const marker = L.marker(event.latlng, { icon, interactive: false, keyboard: false, zIndexOffset: 600 }).addTo(map);
    setTimeout(() => marker.remove(), 1500);
  });

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
