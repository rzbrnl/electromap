/* ElectroMap - Main Application */
(function() {
  'use strict';
  var allChargers = [];
  var filteredChargers = [];
  var currentTheme = 'dark';
  var currentUnit = localStorage.getItem('em-unit') || 'km';
  var filtersVisible = false;
  var legendVisible = false;
  var userLat = null;
  var userLng = null;

  function init() {
    ChargerMap.init(onChargerSelect);
    loadSavedTheme();
    loadSavedUnit();
    setupEventListeners();
    detectLocation();
  }

  function loadSavedTheme() {
    var saved = localStorage.getItem('em-theme');
    if (saved) currentTheme = saved;
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

  function formatDistance(distance) {
    if (!distance) return 'N/A';
    var val = currentUnit === 'mi' ? distance * 0.621371 : distance;
    return val.toFixed(1) + ' ' + currentUnit;
  }

  function detectLocation() {
    showLoading(true);
    ChargerMap.getUserLocation().then(function(pos) {
      ChargerMap.setUserLocation(pos.lat, pos.lng);
      ChargerData.setUserLocation(pos.lat, pos.lng);
      userLat = pos.lat;
      userLng = pos.lng;
    }).catch(function() {
      console.log('Location not available');
    }).finally(function() {
      loadChargers().then(function() {
        showLoading(false);
      });
    });
  }

  function loadChargers() {
    var center = ChargerMap.getCenter();
    var radius = ChargerMap.getRadius();
    updateStatus('Cargando...');
    return ChargerData.fetchChargers(center.lat, center.lng, radius, 100).then(function(chargers) {
      allChargers = chargers;
      applyFilters();
      updateStatus('En vivo');
    }).catch(function(err) {
      console.error('Error loading chargers:', err);
      updateStatus('Error', true);
    });
  }

  function applyFilters() {
    var filters = getActiveFilters();
    filteredChargers = ChargerData.filterChargers(allChargers, filters);
    ChargerMap.addChargerMarkers(filteredChargers);
    updateStats();
  }

  function getActiveFilters() {
    var ct = [];
    document.querySelectorAll('#filter-connectors input:checked').forEach(function(cb) { ct.push(cb.value); });
    var lv = [];
    document.querySelectorAll('#filter-levels input:checked').forEach(function(cb) { lv.push(cb.value); });
    var st = [];
    document.querySelectorAll('#filter-status input:checked').forEach(function(cb) { st.push(cb.value); });
    return { connectorTypes: ct, levels: lv, status: st };
  }

  function onChargerSelect(charger) { showSidebar(charger); }

  function showSidebar(charger) {
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('charger-name').textContent = charger.name;
    document.getElementById('charger-operator').textContent = charger.operator;
    document.getElementById('charger-address').textContent = charger.address;

    var sb = document.getElementById('charger-status');
    var st = document.getElementById('status-text');
    sb.className = 'status-badge';
    if (charger.statusId === 50 || charger.statusId === 10 || charger.statusId === 30) { sb.classList.add('operational'); st.textContent = 'Operativo'; }
    else if (charger.statusId === 20 || charger.statusId === 150) { sb.classList.add('non-operational'); st.textContent = 'No operativo'; }
    else { sb.classList.add('unknown'); st.textContent = 'Desconocido'; }

    document.getElementById('charger-connectors').textContent = charger.connections.map(function(c) { return c.type; }).join(', ') || 'N/A';
    document.getElementById('charger-power').textContent = charger.connections.filter(function(c) { return c.powerKW; }).map(function(c) { return c.powerKW + ' kW'; }).join(', ') || 'N/A';
    document.getElementById('charger-level').textContent = charger.connections.map(function(c) { return c.level; }).filter(function(v, i, a) { return a.indexOf(v) === i; }).join(', ') || 'N/A';
    document.getElementById('charger-points').textContent = charger.numberOfPoints || 'N/A';
    document.getElementById('charger-cost').textContent = formatCost(charger.cost);
    document.getElementById('charger-usage').textContent = charger.usage;
    document.getElementById('charger-network').textContent = charger.network || charger.operator;

    var cl = document.getElementById('charger-connections-list');
    cl.innerHTML = charger.connections.map(function(conn) {
      return '<div class="connection-item"><div class="connection-type">' + conn.type + '</div><div class="connection-power">' + (conn.powerKW ? conn.powerKW + ' kW' : 'N/A') + '</div><div class="connection-level">' + conn.level + '</div></div>';
    }).join('');

    var ps = document.getElementById('charger-photos');
    var pg = document.getElementById('photos-grid');
    if (charger.photos && charger.photos.length > 0) {
      ps.style.display = 'block';
      pg.innerHTML = charger.photos.map(function(url) { return '<img src="' + url + '" alt="Foto" loading="lazy" onerror="this.style.display=\'none\'">'; }).join('');
    } else {
      ps.style.display = 'none';
    }

    document.getElementById('charger-distance').textContent = 'Calculando...';
    document.getElementById('charger-duration').style.display = 'none';

    if (userLat && userLng && charger.lat && charger.lng) {
      var distEl = document.getElementById('charger-distance');
      var durEl = document.getElementById('charger-duration');
      var url = 'https://router.project-osrm.org/route/v1/driving/' + userLng + ',' + userLat + ';' + charger.lng + ',' + charger.lat + '?overview=false';
      fetch(url).then(function(r) { return r.json(); }).then(function(data) {
        if (data.code === 'Ok' && data.routes[0]) {
          var km = (data.routes[0].distance / 1000).toFixed(1);
          var min = Math.round(data.routes[0].duration / 60);
          distEl.textContent = km + ' km';
          durEl.textContent = min + ' min en auto';
          durEl.style.display = 'block';
          charger.drivingDistance = data.routes[0].distance / 1000;
          charger.drivingDuration = min + ' min';
        } else {
          distEl.textContent = 'N/A';
        }
      }).catch(function() {
        distEl.textContent = 'N/A';
      });
    } else {
      document.getElementById('charger-distance').textContent = 'N/A';
    }

    var nb = document.getElementById('btn-navigate');
    nb.onclick = function(e) { e.preventDefault(); showRouteOnMap(charger); };
    document.getElementById('btn-share').onclick = function() { shareLocation(charger); };
  }

  function showRouteOnMap(charger) {
    hideSidebar();
    if (userLat && userLng) {
      ChargerMap.showRoute(userLat, userLng, charger.lat, charger.lng, charger.name);
    } else {
      showToast('No se pudo obtener tu ubicación');
    }
  }

  function shareLocation(charger) {
    var url = 'https://www.google.com/maps?q=' + charger.lat + ',' + charger.lng;
    if (navigator.share) {
      navigator.share({ title: charger.name, text: charger.name + ' - ' + charger.address, url: url });
    } else {
      navigator.clipboard.writeText(url).then(function() { showToast('Link copiado'); });
    }
  }

  function formatCost(cost) {
    if (!cost || cost.trim() === '') return 'Gratis';
    var l = cost.toLowerCase();
    if (l === 'free' || l === 'gratis' || l === 'free charging') return 'Gratis';
    return cost;
  }

  function hideSidebar() { document.getElementById('sidebar').classList.add('hidden'); }

  function toggleFilters() {
    filtersVisible = !filtersVisible;
    document.getElementById('filters-panel').classList.toggle('hidden', !filtersVisible);
    document.getElementById('btn-filters').classList.toggle('active', filtersVisible);
  }

  function hideFilters() {
    filtersVisible = false;
    document.getElementById('filters-panel').classList.add('hidden');
    document.getElementById('btn-filters').classList.remove('active');
  }

  function toggleLegend() {
    legendVisible = !legendVisible;
    document.getElementById('color-legend').classList.toggle('hidden', !legendVisible);
    document.getElementById('btn-legend').classList.toggle('active', legendVisible);
  }

  function updateStats() {
    var stats = ChargerData.getStats(filteredChargers);
    document.getElementById('charger-count').textContent = stats.total;
    document.getElementById('active-count').textContent = stats.active;
  }

  function updateStatus(text, isError) {
    document.getElementById('data-source').textContent = text;
    var el = document.getElementById('status-indicator');
    el.classList.toggle('error', !!isError);
    el.classList.toggle('live', !isError);
  }

  function showLoading(show) {
    document.getElementById('loading-overlay').classList.toggle('hidden', !show);
  }

  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('em-theme', theme);
    document.querySelector('.icon-sun').style.display = theme === 'dark' ? 'none' : 'block';
    document.querySelector('.icon-moon').style.display = theme === 'dark' ? 'block' : 'none';
    ChargerMap.updateTileLayer(theme === 'dark');
  }

  function toggleTheme() { applyTheme(currentTheme === 'light' ? 'dark' : 'light'); }

  function goToMyLocation() {
    ChargerMap.getUserLocation().then(function(pos) {
      ChargerMap.centerOnLocation(pos.lat, pos.lng, 14);
      ChargerMap.setUserLocation(pos.lat, pos.lng);
      ChargerData.setUserLocation(pos.lat, pos.lng);
      userLat = pos.lat;
      userLng = pos.lng;
      loadChargers();
    }).catch(function() { showToast('No se pudo obtener tu ubicación'); });
  }

  function showToast(message) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 4000);
  }

  function setupEventListeners() {
    document.getElementById('btn-theme').addEventListener('click', toggleTheme);
    document.getElementById('btn-unit-km').addEventListener('click', function() { setUnit('km'); });
    document.getElementById('btn-unit-mi').addEventListener('click', function() { setUnit('mi'); });
    document.getElementById('btn-location').addEventListener('click', goToMyLocation);
    document.getElementById('btn-filters').addEventListener('click', toggleFilters);
    document.getElementById('btn-legend').addEventListener('click', toggleLegend);
    document.getElementById('btn-user').addEventListener('click', toggleAuthModal);
    document.getElementById('close-sidebar').addEventListener('click', hideSidebar);
    document.getElementById('close-filters').addEventListener('click', hideFilters);
    document.getElementById('close-auth').addEventListener('click', hideAuthModal);
    document.getElementById('btn-apply-filters').addEventListener('click', function() { applyFilters(); hideFilters(); });

    document.getElementById('auth-form').addEventListener('submit', handleAuth);
    document.getElementById('toggle-auth').addEventListener('click', function(e) {
      e.preventDefault();
      toggleAuthMode();
    });

    document.getElementById('btn-more-info').addEventListener('click', function() {
      var extra = document.getElementById('charger-extra');
      var btn = document.getElementById('btn-more-info');
      if (extra.style.display === 'none') { extra.style.display = 'block'; btn.innerHTML = '<svg class="icon" width="14" height="14"><use href="#icon-close"></use></svg> Menos información'; }
      else { extra.style.display = 'none'; btn.innerHTML = '<svg class="icon" width="14" height="14"><use href="#icon-info"></use></svg> Más información'; }
    });

    var moveTimeout;
    ChargerMap.onMapEvent('moveend', function() {
      clearTimeout(moveTimeout);
      moveTimeout = setTimeout(function() { loadChargers(); }, 500);
    });

    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') { hideSidebar(); hideFilters(); hideAuthModal(); } });
  }

  var isLoginMode = true;

  function toggleAuthModal() {
    var modal = document.getElementById('auth-modal');
    modal.classList.toggle('hidden');
  }

  function hideAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
    document.getElementById('auth-error').classList.add('hidden');
  }

  function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').textContent = isLoginMode ? 'Iniciar Sesión' : 'Crear Cuenta';
    document.getElementById('auth-submit').textContent = isLoginMode ? 'Iniciar Sesión' : 'Crear Cuenta';
    document.getElementById('toggle-auth').textContent = isLoginMode ? 'Regístrate' : 'Inicia sesión';
  }

  async function handleAuth(e) {
    e.preventDefault();
    var email = document.getElementById('auth-email').value;
    var password = document.getElementById('auth-password').value;
    var errorEl = document.getElementById('auth-error');
    var submitBtn = document.getElementById('auth-submit');

    errorEl.classList.add('hidden');
    submitBtn.textContent = 'Cargando...';
    submitBtn.disabled = true;

    try {
      if (isLoginMode) {
        var result = await SupabaseApp.signIn(email, password);
        if (result) {
          hideAuthModal();
          showToast('Sesión iniciada correctamente');
        } else {
          errorEl.textContent = 'Error al iniciar sesión. Verifica tus credenciales.';
          errorEl.classList.remove('hidden');
        }
      } else {
        var result = await SupabaseApp.signUp(email, password);
        if (result) {
          hideAuthModal();
          showToast('Cuenta creada. Revisa tu correo para confirmar.');
        } else {
          errorEl.textContent = 'Error al crear cuenta.';
          errorEl.classList.remove('hidden');
        }
      }
    } catch (err) {
      errorEl.textContent = err.message || 'Error desconocido';
      errorEl.classList.remove('hidden');
    }

    submitBtn.textContent = isLoginMode ? 'Iniciar Sesión' : 'Crear Cuenta';
    submitBtn.disabled = false;
  }

  document.addEventListener('DOMContentLoaded', init);
})();