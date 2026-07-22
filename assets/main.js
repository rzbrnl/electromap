/* ElectroMap - Main Application */

(function() {
  'use strict';

  let allChargers = [];
  let filteredChargers = [];
  let currentTheme = 'dark';
  let currentUnit = localStorage.getItem('em-unit') || 'km';
  let filtersVisible = false;
  let legendVisible = false;
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
      console.log('Location found:', pos.lat, pos.lng);
    } catch (error) {
      console.log('Location not available:', error.message);
    }

    try {
      const center = ChargerMap.getCenter();
      const radius = ChargerMap.getRadius();
      console.log('Fetching chargers for:', center.lat, center.lng, 'radius:', radius);
      allChargers = await ChargerData.fetchChargers(center.lat, center.lng, radius, 100);
      console.log('Chargers loaded:', allChargers.length);
      applyFilters();
      updateStatus('En vivo');
    } catch (error) {
      console.error('Error loading chargers:', error);
      updateStatus('Error de conexión', true);
    }

    showLoading(false);
    console.log('Loading hidden');
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
      console.error('Error in loadChargers:', error);
      updateStatus('Error', true);
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

    if (charger.drivingDistance) {
      document.getElementById('charger-distance').textContent = `${charger.drivingDistance.toFixed(1)} km`;
      document.getElementById('charger-duration').textContent = charger.drivingDuration || '';
      document.getElementById('charger-duration').style.display = charger.drivingDuration ? 'block' : 'none';
    } else if (charger.distance) {
      document.getElementById('charger-distance').textContent = `${charger.distance.toFixed(1)} km`;
      document.getElementById('charger-duration').style.display = 'none';
    } else {
      document.getElementById('charger-distance').textContent = 'N/A';
      document.getElementById('charger-duration').style.display = 'none';
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

    navigateBtn.onclick = (e) => {
      e.preventDefault();
      showRouteOnMap(charger);
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

  let routeLayer = null;
  let currentCharger = null;

  function showRouteOnMap(charger) {
    if (routeLayer) {
      ChargerMap.removeRouteLayer(routeLayer);
      routeLayer = null;
    }

    currentCharger = charger;
    hideSidebar();

    if (userLat && userLng) {
      ChargerMap.showRoute(userLat, userLng, charger.lat, charger.lng, charger.name);
    } else {
      showToast('No se pudo obtener tu ubicación');
    }
  }

  window.showToast = function(message, showNavButton = false) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span>${message}</span>
      ${showNavButton ? '<button class="toast-nav-btn" onclick="ChargerMap.openNavigation()">Iniciar ruta</button>' : ''}
    `;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 5000);
  };

  function showToast(message, showNavButton = false) {
    window.showToast(message, showNavButton);
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

  function toggleLegend() {
    legendVisible = !legendVisible;
    const legend = document.getElementById('color-legend');
    const btn = document.getElementById('btn-legend');

    if (legendVisible) {
      legend.classList.remove('hidden');
      btn.classList.add('active');
    } else {
      legend.classList.add('hidden');
      btn.classList.remove('active');
    }
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
    document.getElementById('btn-legend').addEventListener('click', toggleLegend);
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