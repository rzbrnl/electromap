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

      marker.bindPopup(createPopupContent(charger), {
        maxWidth: 250,
        className: 'charger-popup'
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
    onMapEvent
  };
})();