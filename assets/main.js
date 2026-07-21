/* ElectroMap - Main Application */

(function() {
  'use strict';

  let allChargers = [];
  let filteredChargers = [];
  let currentTheme = 'dark';
  let filtersVisible = false;

  function init() {
    ChargerData.setApiKey('3d44a410-854e-4da9-b309-2c8e2b29b0f9');

    ChargerMap.init(onChargerSelect);

    loadSavedTheme();
    setupEventListeners();
    detectLocation();
  }

  function loadSavedTheme() {
    const savedTheme = localStorage.getItem('em-theme');
    if (savedTheme) {
      currentTheme = savedTheme;
    }
    applyTheme(currentTheme);
  }

  async function detectLocation() {
    try {
      const pos = await ChargerMap.getUserLocation();
      ChargerMap.setUserLocation(pos.lat, pos.lng);
      await loadChargers();
    } catch (error) {
      console.log('Location not available, using default location');
      await loadChargers();
    }
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
    if (charger.statusId === 50 || charger.statusId === 10) {
      statusBadge.classList.add('operational');
      statusText.textContent = 'Operativo';
    } else if (charger.statusId === 20 || charger.statusId === 30) {
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

    const distance = charger.distance
      ? `${charger.distance.toFixed(1)} ${charger.distanceUnit === 2 ? 'km' : 'mi'}`
      : 'N/A';
    document.getElementById('charger-distance').textContent = distance;

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

    const navigateBtn = document.getElementById('btn-navigate');
    navigateBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${charger.lat},${charger.lng}`;
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
      ChargerMap.setUserLocation(pos.lat, pos.lng);
      await loadChargers();
    } catch (error) {
      console.error('Location error:', error);
      alert('No se pudo obtener tu ubicación. Verifica los permisos del navegador.');
    }
  }

  function setupEventListeners() {
    document.getElementById('btn-theme').addEventListener('click', toggleTheme);
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