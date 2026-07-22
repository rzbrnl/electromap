/* ElectroMap - Map Layer */
/* Leaflet.js map management */

const ChargerMap = (() => {
  let map = null;
  let markers = null;
  let userMarker = null;
  let userCircle = null;
  let onChargerSelect = null;

  function init(callback) {
    onChargerSelect = callback;

    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
      console.error('Map container not found');
      return;
    }

    map = L.map('map', {
      center: [19.4326, -99.1332],
      zoom: 12,
      zoomControl: false,
      maxZoom: 18,
      minZoom: 3
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    markers = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: function(cluster) {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="charger-marker" style="width:${count > 50 ? 44 : 36}px;height:${count > 50 ? 44 : 36}px;font-size:${count > 50 ? 14 : 12}px;">${count}</div>`,
          className: 'charger-cluster',
          iconSize: L.point(count > 50 ? 44 : 36, count > 50 ? 44 : 36)
        });
      }
    });
    map.addLayer(markers);

    updateTileLayer(false);

    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }

  function updateTileLayer(isDark) {
    map.eachLayer(layer => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    if (isDark) {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '',
        subdomains: 'abcd',
        maxZoom: 20,
        crossOrigin: true
      }).addTo(map);
    } else {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '',
        subdomains: 'abcd',
        maxZoom: 19,
        crossOrigin: true
      }).addTo(map);
    }

    map.invalidateSize();
  }

  function clearMarkers() {
    markers.clearLayers();
  }

  function addChargerMarkers(chargers) {
    markers.clearLayers();

    chargers.forEach(charger => {
      if (!charger.lat || !charger.lng) return;

      const colorClass = ChargerData.getMarkerColor(charger);
      const icon = L.divIcon({
        html: `<div class="charger-marker ${colorClass}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
          </svg>
        </div>`,
        className: 'charger-marker-wrapper',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([charger.lat, charger.lng], { icon });

      marker.on('click', () => {
        if (onChargerSelect) {
          onChargerSelect(charger);
        }
      });

      const power = charger.connections
        .filter(c => c.powerKW)
        .map(c => c.powerKW + ' kW')
        .join(', ') || 'N/A';

      marker.bindTooltip(`<b>${charger.name}</b><br>${charger.operator} · ${power}`, {
        direction: 'top',
        offset: [0, -20],
        opacity: 0.95,
        className: 'charger-tooltip'
      });

      markers.addLayer(marker);
    });
  }

  function createPopupContent(charger) {
    const tags = charger.connections.map(conn => {
      const isFast = conn.levelId === 3;
      return `<span class="popup-tag ${isFast ? 'fast' : ''}">${conn.type} ${conn.powerKW ? conn.powerKW + 'kW' : ''}</span>`;
    }).join('');

    return `
      <div class="popup-title">${charger.name}</div>
      <div class="popup-operator">${charger.operator}</div>
      <div class="popup-connections">${tags}</div>
    `;
  }

  function setUserLocation(lat, lng) {
    if (userMarker) {
      map.removeLayer(userMarker);
    }
    if (userCircle) {
      map.removeLayer(userCircle);
    }

    const icon = L.divIcon({
      html: `<div style="
        width: 16px;
        height: 16px;
        background: #3b82f6;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3), 0 2px 8px rgba(0,0,0,0.3);
      "></div>`,
      className: 'user-marker',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);

    userCircle = L.circle([lat, lng], {
      radius: 500,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
      weight: 1
    }).addTo(map);

    map.setView([lat, lng], 13);
  }

  function getUserLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  }

  function centerOnLocation(lat, lng, zoom = 13) {
    map.setView([lat, lng], zoom);
  }

  function getBounds() {
    return map.getBounds();
  }

  function getCenter() {
    const center = map.getCenter();
    return { lat: center.lat, lng: center.lng };
  }

  function getZoom() {
    return map.getZoom();
  }

  function getRadius() {
    const bounds = map.getBounds();
    const center = bounds.getCenter();
    const northEast = bounds.getNorthEast();
    const distance = center.distanceTo(northEast) / 1000;
    return Math.min(Math.ceil(distance), 100);
  }

  function onMapEvent(event, callback) {
    if (map) {
      map.on(event, callback);
    }
  }

  let currentRoute = null;
  let routeMarkers = [];
  let routeDestination = null;

  function showRoute(originLat, originLng, destLat, destLng, destName) {
    if (currentRoute) {
      map.removeLayer(currentRoute);
      currentRoute = null;
    }
    routeMarkers.forEach(m => map.removeLayer(m));
    routeMarkers = [];

    routeDestination = { lat: destLat, lng: destLng, name: destName };

    const destIcon = L.divIcon({
      html: `<div style="width:32px;height:32px;background:#22c55e;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      </div>`,
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const destMarker = L.marker([destLat, destLng], { icon: destIcon }).addTo(map)
      .bindPopup(destName);
    routeMarkers.push(destMarker);

    const bounds = L.latLngBounds([[originLat, originLng], [destLat, destLng]]);
    map.fitBounds(bounds, { padding: [80, 80] });

    fetch(`https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`)
      .then(r => r.json())
      .then(data => {
        if (data.code === 'Ok') {
          const route = data.routes[0];
          const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
          currentRoute = L.polyline(coords, {
            color: '#3b82f6',
            weight: 5,
            opacity: 0.8
          }).addTo(map);

          const distance = (route.distance / 1000).toFixed(1);
          const duration = Math.round(route.duration / 60);

          showNavigationPanel(route, distance, duration);
        }
      })
      .catch(err => console.error('Route error:', err));
  }

  function showNavigationPanel(route, distance, duration) {
    let panel = document.getElementById('navigation-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'navigation-panel';
      panel.className = 'navigation-panel';
      document.getElementById('map').appendChild(panel);
    }

    let stepsHtml = '';
    if (route.legs && route.legs[0] && route.legs[0].steps) {
      route.legs[0].steps.forEach((step, i) => {
        if (step.maneuver) {
          let icon = '→';
          let instruction = '';

          if (step.maneuver.type === 'arrive') {
            icon = '📍';
            instruction = 'Llegaste a tu destino';
          } else if (step.maneuver.type === 'depart') {
            icon = '🚗';
            instruction = step.name ? `Sal por ${step.name}` : 'Comienza a conducir';
          } else if (step.maneuver.type === 'turn') {
            icon = step.maneuver.modifier === 'right' ? '➡️' : '⬅️';
            instruction = step.maneuver.modifier === 'right' ? 'Gira a la derecha' : 'Gira a la izquierda';
            if (step.name) instruction += ` en ${step.name}`;
          } else if (step.maneuver.type === 'new name' || step.maneuver.type === 'continue') {
            icon = '↑';
            instruction = step.name ? `Sigue por ${step.name}` : 'Continúa recto';
          } else if (step.maneuver.type === 'roundabout') {
            icon = '🔄';
            instruction = `En la rotonda, toma la salida ${step.maneuver.exit || ''}`;
          } else {
            instruction = step.name || 'Continúa';
          }

          const stepDist = (step.distance / 1000).toFixed(1);
          stepsHtml += `
            <div class="nav-step ${i === 0 ? 'active' : ''}">
              <div class="nav-step-icon">${icon}</div>
              <div class="nav-step-info">
                <div class="nav-step-text">${instruction}</div>
                <div class="nav-step-dist">${stepDist} km</div>
              </div>
            </div>`;
        }
      });
    }

    panel.innerHTML = `
      <div class="nav-header">
        <div class="nav-summary">
          <span class="nav-distance">${distance} km</span>
          <span class="nav-time">· ${duration} min</span>
        </div>
        <button class="nav-close" onclick="ChargerMap.closeNavigation()">✕</button>
      </div>
      <div class="nav-steps">${stepsHtml}</div>
      <button class="nav-google-btn" onclick="ChargerMap.openNavigation()">
        Abrir en Google Maps
      </button>
    `;
  }

  function closeNavigation() {
    const panel = document.getElementById('navigation-panel');
    if (panel) panel.remove();
    if (currentRoute) {
      map.removeLayer(currentRoute);
      currentRoute = null;
    }
    routeMarkers.forEach(m => map.removeLayer(m));
    routeMarkers = [];
    routeDestination = null;
  }

  function removeRouteLayer(layer) {
    if (layer) map.removeLayer(layer);
  }

  return {
    init,
    updateTileLayer,
    clearMarkers,
    addChargerMarkers,
    setUserLocation,
    getUserLocation,
    centerOnLocation,
    getBounds,
    getCenter,
    getZoom,
    getRadius,
    onMapEvent,
    showRoute,
    openNavigation,
    closeNavigation,
    removeRouteLayer
  };
})();