/* ElectroMap - Main Application */

(function() {
  'use strict';

  let allChargers = [];
  let filteredChargers = [];
  let currentTheme = 'dark';
  let currentUnit = localStorage.getItem('em-unit') || 'km';
  let filtersVisible = false;
  let userLat = null;
  let userLng = null;

  function init() {
    ChargerMap.init(onChargerSelect);

    loadSavedTheme();
    loadSavedUnit();
    setupEventListeners();
    detectLocation();
  }

  function loadSavedTheme() {
    const savedTheme = localStorage.getItem('em-theme');
    if (savedTheme) currentTheme = savedTheme;
    applyTheme(currentTheme);
  }

  function loadSavedUnit() {
    document.getElementById('btn-unit-km').classList.toggle('active', currentUnit === 'km');
    document.getElementById('btn-unit-mi').classList.toggle('active', currentUnit === 'mi');
  }

  function setUnit(unit) {
    currentUnit = unit;
    localStorage.setItem('em-unit', currentUnit);
    document.getElementById('btn-unit-km').classList.toggle('active', unit === 'km');
    document.getElementById('btn-unit-mi').classList.toggle('active', unit === 'mi');
    updateStats();
  }

  function formatCost(cost) {
    if (!cost || cost.trim() === '') return 'Gratis';
    const lower = cost.toLowerCase();
    if (lower === 'free' || lower === 'gratis' || lower === 'free charging') return 'Gratis';
    return cost;
  }

  function formatDistance(distance, distanceUnit) {
    if (!distance) return 'N/A';
    let value = distanceUnit === 2 ? distance : distance * 1.60934;
    if (currentUnit === 'mi') {
      value = distanceUnit === 2 ? distance * 0.621371 : distance;
    }
    return `${value.toFixed(1)} ${currentUnit}`;
  }

  async function detectLocation() {
    showLoading(true);
    try {
      const pos = await ChargerMap.getUserLocation();
      ChargerMap.setUserLocation(pos.lat, pos.lng);
      ChargerData.setUserLocation(pos.lat, pos.lng);
      userLat = pos.lat;
      userLng = pos.lng;
    } catch (error) {
      console.log('Location not available, using default');
    }
    try {
      await loadChargers();
    } catch (error) {
      console.error('Error loading chargers:', error);
    }
    showLoading(false);
  }

  async function loadChargers() {
    const center = ChargerMap.getCenter();
    const radius = ChargerMap.getRadius();

    try {
      updateStatus('Cargando...');
      allChargers = await ChargerData.fetchChargers(center.lat, center.lng, radius, 100);
      applyFilters();
      updateStatus('En vivo');
    } catch (error) {
      console.error('Failed to load chargers:', error);
      updateStatus('Error de conexión', true);
    }
  }

  function applyFilters() {
    const filters = getActiveFilters();
    filteredChargers = ChargerData.filterChargers(allChargers, filters);
    ChargerMap.addChargerMarkers(filteredChargers);
    updateStats();
  }

  function getActiveFilters() {
    const connectorTypes = [];
    document.querySelectorAll('#filter-connectors input:checked').forEach(cb => {
      connectorTypes.push(cb.value);
    });

    const levels = [];
    document.querySelectorAll('#filter-levels input:checked').forEach(cb => {
      levels.push(cb.value);
    });

    const status = [];
    document.querySelectorAll('#filter-status input:checked').forEach(cb => {
      status.push(cb.value);
    });

    return { connectorTypes, levels, status };
  }

  function onChargerSelect(charger) {
    showSidebar(charger);
  }

  function showSidebar(charger) {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.remove('hidden');

    document.getElementById('charger-name').textContent = charger.name;
    document.getElementById('charger-operator').textContent = charger.operator;
    document.getElementById('charger-address').textContent = charger.address;

    const statusBadge = document.getElementById('charger-status');
    const statusText = document.getElementById('status-text');

    statusBadge.className = 'status-badge';
    if (charger.statusId === 50 || charger.statusId === 10 || charger.statusId === 30) {
      statusBadge.classList.add('operational');
      statusText.textContent = 'Operativo';
    } else if (charger.statusId === 20 || charger.statusId === 150) {
      statusBadge.classList.add('non-operational');
      statusText.textContent = 'No operativo';
    } else {
      statusBadge.classList.add('unknown');
      statusText.textContent = 'Desconocido';
    }

    const connectorTypes = charger.connections.map(c => c.type).join(', ');
    document.getElementById('charger-connectors').textContent = connectorTypes || 'N/A';

    const powers = charger.connections
      .filter(c => c.powerKW)
      .map(c => c.powerKW + ' kW')
      .join(', ');
    document.getElementById('charger-power').textContent = powers || 'N/A';

    const levels = [...new Set(charger.connections.map(c => c.level))].join(', ');
    document.getElementById('charger-level').textContent = levels || 'N/A';

    if (charger.distance) {
      document.getElementById('charger-distance').textContent = `${charger.distance.toFixed(1)} km`;
    } else {
      document.getElementById('charger-distance').textContent = 'N/A';
    }

    document.getElementById('charger-points').textContent = charger.numberOfPoints || 'N/A';
    document.getElementById('charger-cost').textContent = formatCost(charger.cost);

    document.getElementById('charger-usage').textContent = charger.usage;
    document.getElementById('charger-network').textContent = charger.network || charger.operator;

    const connectionsList = document.getElementById('charger-connections-list');
    connectionsList.innerHTML = charger.connections.map(conn => `
      <div class="connection-item">
        <div class="connection-type">${conn.type}</div>
        <div class="connection-power">${conn.powerKW ? conn.powerKW + ' kW' : 'N/A'}</div>
        <div class="connection-level">${conn.level}</div>
      </div>
    `).join('');

    const photosSection = document.getElementById('charger-photos');
    const photosGrid = document.getElementById('photos-grid');
    if (charger.photos && charger.photos.length > 0) {
      photosSection.style.display = 'block';
      photosGrid.innerHTML = charger.photos.map(url =>
        `<img src="${url}" alt="Foto del cargador" loading="lazy" onerror="this.style.display='none'">`
      ).join('');
    } else {
      photosSection.style.display = 'none';
    }

    const navigateBtn = document.getElementById('btn-navigate');
    const directionsModal = document.getElementById('directions-modal');
    const closeDirectionsBtn = document.getElementById('close-directions');

    navigateBtn.onclick = () => {
      showDirections(charger);
    };

    closeDirectionsBtn.onclick = () => {
      directionsModal.classList.add('hidden');
    };

    const shareBtn = document.getElementById('btn-share');
    shareBtn.onclick = () => shareLocation(charger);
  }

  function shareLocation(charger) {
    const url = `https://www.google.com/maps?q=${charger.lat},${charger.lng}`;
    const text = `${charger.name} - ${charger.address}`;

    if (navigator.share) {
      navigator.share({ title: charger.name, text, url });
    } else {
      navigator.clipboard.writeText(url).then(() => {
        showToast('Link copiado al portapapeles');
      });
    }
  }

  let directionsMap = null;
  let routeControl = null;

  function showDirections(charger) {
    const modal = document.getElementById('directions-modal');
    const mapContainer = document.getElementById('directions-map');
    const infoContainer = document.getElementById('directions-info');

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    if (directionsMap) {
      directionsMap.remove();
      directionsMap = null;
    }

    setTimeout(() => {
      directionsMap = L.map(mapContainer).setView([charger.lat, charger.lng], 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: ''
      }).addTo(directionsMap);

      L.marker([charger.lat, charger.lng]).addTo(directionsMap)
        .bindPopup(charger.name).openPopup();

      if (userLat && userLng) {
        L.marker([userLat, userLng]).addTo(directionsMap)
          .bindPopup('Tu ubicación');

        const bounds = L.latLngBounds([
          [userLat, userLng],
          [charger.lat, charger.lng]
        ]);
        directionsMap.fitBounds(bounds, { padding: [50, 50] });

        fetchRoute(userLat, userLng, charger.lat, charger.lng, directionsMap, infoContainer);
      } else {
        directionsMap.setView([charger.lat, charger.lng], 15);
        infoContainer.innerHTML = '<p>No se pudo obtener tu ubicación.</p>';
      }
    }, 100);
  }

  async function fetchRoute(originLat, originLng, destLat, destLng, map, infoContainer) {
    infoContainer.innerHTML = '<p>Calculando ruta...</p>';

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.code !== 'Ok') {
        throw new Error('Route not found');
      }

      const route = data.routes[0];
      const coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]);

      L.polyline(coordinates, {
        color: '#3b82f6',
        weight: 5,
        opacity: 0.8
      }).addTo(map);

      const distance = (route.distance / 1000).toFixed(1);
      const duration = Math.round(route.duration / 60);

      let stepsHtml = '';
      if (route.legs && route.legs[0] && route.legs[0].steps) {
        route.legs[0].steps.forEach((step, i) => {
          if (step.maneuver && step.maneuver.type !== 'arrive') {
            const instruction = step.maneuver.type === 'turn' ?
              (step.maneuver.modifier === 'right' ? 'Gira a la derecha' :
               step.maneuver.modifier === 'left' ? 'Gira a la izquierda' :
               'Continúa recto') :
              step.name ? `Sigue por ${step.name}` : 'Continúa';
            stepsHtml += `
              <div class="route-step">
                <div class="step-icon">${i + 1}</div>
                <div>
                  <div class="step-text">${instruction}</div>
                  <div class="step-distance">${(step.distance / 1000).toFixed(1)} km</div>
                </div>
              </div>`;
          }
        });
      }

      infoContainer.innerHTML = `
        <div style="margin-bottom: 12px; font-weight: 600; color: var(--text);">
          ${distance} km · ${duration} min
        </div>
        ${stepsHtml}
      `;
    } catch (error) {
      console.error('Route error:', error);
      infoContainer.innerHTML = '<p>No se pudo calcular la ruta. Intenta de nuevo.</p>';
    }
  }

  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }

  function hideSidebar() {
    document.getElementById('sidebar').classList.add('hidden');
  }

  function toggleFilters() {
    filtersVisible = !filtersVisible;
    const panel = document.getElementById('filters-panel');
    const btn = document.getElementById('btn-filters');

    if (filtersVisible) {
      panel.classList.remove('hidden');
      btn.classList.add('active');
    } else {
      panel.classList.add('hidden');
      btn.classList.remove('active');
    }
  }

  function hideFilters() {
    filtersVisible = false;
    document.getElementById('filters-panel').classList.add('hidden');
    document.getElementById('btn-filters').classList.remove('active');
  }

  function updateStats() {
    const stats = ChargerData.getStats(filteredChargers);
    document.getElementById('charger-count').textContent = stats.total;
    document.getElementById('active-count').textContent = stats.active;
  }

  function updateStatus(text, isError = false) {
    const statusEl = document.getElementById('data-source');
    const statusContainer = document.getElementById('status-indicator');
    statusEl.textContent = text;

    if (isError) {
      statusContainer.classList.remove('live');
      statusContainer.classList.add('error');
    } else {
      statusContainer.classList.remove('error');
      statusContainer.classList.add('live');
    }
  }

  function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  }

  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('em-theme', theme);

    const sunIcon = document.querySelector('.icon-sun');
    const moonIcon = document.querySelector('.icon-moon');

    if (theme === 'dark') {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    } else {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    }

    ChargerMap.updateTileLayer(theme === 'dark');
  }

  function toggleTheme() {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
  }

  async function goToMyLocation() {
    try {
      const pos = await ChargerMap.getUserLocation();
      ChargerMap.centerOnLocation(pos.lat, pos.lng, 14);
      ChargerMap.setUserLocation(pos.lat, pos.lng);
      ChargerData.setUserLocation(pos.lat, pos.lng);
      userLat = pos.lat;
      userLng = pos.lng;
      await loadChargers();
    } catch (error) {
      showToast('No se pudo obtener tu ubicación');
    }
  }

  function setupEventListeners() {
    document.getElementById('btn-theme').addEventListener('click', toggleTheme);
    document.getElementById('btn-unit-km').addEventListener('click', () => setUnit('km'));
    document.getElementById('btn-unit-mi').addEventListener('click', () => setUnit('mi'));
    document.getElementById('btn-location').addEventListener('click', goToMyLocation);
    document.getElementById('btn-filters').addEventListener('click', toggleFilters);
    document.getElementById('close-sidebar').addEventListener('click', hideSidebar);
    document.getElementById('close-filters').addEventListener('click', hideFilters);

    document.getElementById('btn-apply-filters').addEventListener('click', () => {
      applyFilters();
      hideFilters();
    });

    document.getElementById('btn-more-info').addEventListener('click', () => {
      const extra = document.getElementById('charger-extra');
      const btn = document.getElementById('btn-more-info');
      if (extra.style.display === 'none') {
        extra.style.display = 'block';
        btn.innerHTML = '<svg class="icon" width="14" height="14"><use href="#icon-close"></use></svg> Menos información';
      } else {
        extra.style.display = 'none';
        btn.innerHTML = '<svg class="icon" width="14" height="14"><use href="#icon-info"></use></svg> Más información';
      }
    });

    let searchTimeout;
    document.getElementById('search').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = e.target.value;
        if (query.length >= 2) {
          filteredChargers = ChargerData.searchChargers(allChargers, query);
          ChargerMap.addChargerMarkers(filteredChargers);
          updateStats();
        } else if (query.length === 0) {
          applyFilters();
        }
      }, 300);
    });

    let moveTimeout;
    ChargerMap.onMapEvent('moveend', () => {
      clearTimeout(moveTimeout);
      moveTimeout = setTimeout(() => {
        loadChargers();
      }, 500);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideSidebar();
        hideFilters();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();