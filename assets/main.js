/* ElectroMap - Main Application */
(function() {
  'use strict';
  var allChargers = [];
  var filteredChargers = [];
  var currentTheme = 'dark';
  var currentUnit = 'km';
  var filtersVisible = false;
  var legendVisible = false;
  var userLat = null;
  var userLng = null;

  async function init() {
    ChargerMap.init(onChargerSelect);
    await SupabaseApp.init();
    checkResetToken();
    loadSavedTheme();
    setupEventListeners();
    detectLocation();
    checkAdminHeader();
  }

  function loadSavedTheme() {
    var saved = localStorage.getItem('em-theme');
    if (saved) currentTheme = saved;
    applyTheme(currentTheme);
  }

  function formatDistance(distance) {
    if (!distance) return 'N/A';
    return distance.toFixed(1) + ' km';
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
    return ChargerData.fetchChargers(center.lat, center.lng, radius, 100).then(async function(chargers) {
      try {
        var approved = await SupabaseApp.getApprovedStations();
        if (approved && approved.length > 0) {
          // Build name->CFE index for matching old entries
          var cfeByName = {};
          chargers.forEach(function(c) { cfeByName[c.name] = c; });

          var overrideMap = {};
          var communityChargers = [];
          approved.forEach(function(s) {
            if (s.charger_id) {
              // Explicit override by charger_id
              overrideMap[s.charger_id] = s;
            } else if (cfeByName[s.name]) {
              // Old entry without charger_id but matches a CFE station name — treat as override
              overrideMap[cfeByName[s.name].id] = s;
            } else {
              // Pure community station — parse connector arrays
              var connTypes = [];
              var lvlNames = [];
              var powerArr = [];
              try { connTypes = JSON.parse(s.connector); } catch(e) { connTypes = s.connector ? [s.connector] : []; }
              try { lvlNames = JSON.parse(s.level); } catch(e) { lvlNames = s.level ? [s.level] : []; }
              try { powerArr = JSON.parse(s.power_kw); } catch(e) { powerArr = s.power_kw != null ? [s.power_kw] : []; }
              if (!Array.isArray(connTypes)) connTypes = [connTypes];
              if (!Array.isArray(lvlNames)) lvlNames = [lvlNames];
              if (!Array.isArray(powerArr)) powerArr = [powerArr];
              var connections = connTypes.map(function(ct, i) {
                var lvl = lvlNames[i] || lvlNames[0] || 'N/A';
                var levelId = lvl === 'DC Rápida' ? 3 : lvl === 'Nivel 2' ? 2 : 1;
                var pw = powerArr[i] != null ? powerArr[i] : (powerArr[0] != null ? powerArr[0] : 0);
                return { type: ct || 'N/A', typeId: 0, powerKW: pw, level: lvl, levelId: levelId };
              });
              if (connections.length === 0) connections = [{ type: 'N/A', typeId: 0, powerKW: 0, level: 'N/A', levelId: 1 }];
              communityChargers.push({
                id: 'approved-' + s.id, name: s.name, address: s.address || '',
                lat: s.lat, lng: s.lng, country: 'México',
                operator: s.operator || 'Comunidad', network: s.operator || 'Comunidad',
                status: s.status || 'Operational', statusId: s.status_id || 50, usage: 'Público',
                cost: s.cost || 'Desconocido', numberOfPoints: s.points || 1,
                photos: [], connections: connections,
                numConnections: s.points || 1, _approvedId: s.id
              });
            }
          });

          // Apply overrides to CFE chargers
          chargers.forEach(function(c) {
            var o = overrideMap[c.id];
            if (!o) return;
            c.name = o.name || c.name;
            c.address = o.address || c.address;
            c.lat = o.lat || c.lat;
            c.lng = o.lng || c.lng;
            if (o.operator) { c.operator = o.operator; c.network = o.operator; }
            if (o.cost) c.cost = o.cost;
            if (o.points) c.numberOfPoints = o.points;
            if (o.status_id != null) c.statusId = o.status_id;
            c._approvedId = o.id;
            // Parse connector/level/power arrays for overrides
            var oConnTypes = [];
            var oLvlNames = [];
            var oPowerArr = [];
            try { oConnTypes = JSON.parse(o.connector); } catch(e) { oConnTypes = o.connector ? [o.connector] : []; }
            try { oLvlNames = JSON.parse(o.level); } catch(e) { oLvlNames = o.level ? [o.level] : []; }
            try { oPowerArr = JSON.parse(o.power_kw); } catch(e) { oPowerArr = o.power_kw != null ? [o.power_kw] : []; }
            if (!Array.isArray(oConnTypes)) oConnTypes = [oConnTypes];
            if (!Array.isArray(oLvlNames)) oLvlNames = [oLvlNames];
            if (!Array.isArray(oPowerArr)) oPowerArr = [oPowerArr];
            c.connections = oConnTypes.map(function(ct, i) {
              var lvl = oLvlNames[i] || oLvlNames[0] || 'N/A';
              var pw = oPowerArr[i] != null ? oPowerArr[i] : (oPowerArr[0] != null ? oPowerArr[0] : 0);
              var levelId = lvl === 'DC Rápida' ? 3 : lvl === 'Nivel 2' ? 2 : 1;
              return { type: ct || 'N/A', typeId: 0, powerKW: pw, level: lvl, levelId: levelId };
            });
            if (c.connections.length === 0) c.connections = [{ type: 'N/A', typeId: 0, powerKW: 0, level: 'N/A', levelId: 1 }];
          });
          chargers = chargers.concat(communityChargers);
          console.log('[ElectroMap] Approved:', approved.length, 'Community:', communityChargers.length, 'Overrides:', Object.keys(overrideMap).length);
        }
      } catch (e) { console.warn('Error loading approved stations:', e); }
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
    console.log('[ElectroMap] allChargers:', allChargers.length, 'filteredChargers:', filteredChargers.length);
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

  var currentCharger = null;
  var userFavorites = [];
  var selectedRating = 0;

  function showSidebar(charger) {
    currentCharger = charger;
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

    document.getElementById('charger-points').textContent = charger.numberOfPoints || 'N/A';
    document.getElementById('charger-cost').textContent = formatCost(charger.cost);
    document.getElementById('charger-usage').textContent = charger.usage || 'Público';

    // Render connector cards in 2 columns
    var cl = document.getElementById('charger-connections-list');
    cl.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
      charger.connections.map(function(conn) {
        return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;">' +
          '<div style="font-weight:600;font-size:14px;color:var(--text);margin-bottom:4px;">' + (conn.type || 'N/A') + '</div>' +
          '<div style="font-size:13px;color:var(--accent);font-weight:600;">' + (conn.powerKW ? conn.powerKW + ' kW' : 'N/A') + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);">' + (conn.level || 'N/A') + '</div>' +
        '</div>';
      }).join('') + '</div>';

    // Distance
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
        } else { distEl.textContent = 'N/A'; }
      }).catch(function() { distEl.textContent = 'N/A'; });
    } else {
      document.getElementById('charger-distance').textContent = 'N/A';
    }

    document.getElementById('btn-navigate').onclick = function(e) { e.preventDefault(); showRouteOnMap(charger); };
    document.getElementById('btn-share').onclick = function() { shareLocation(charger); };

    // Community features
    updateFavoriteButton(charger);
    loadComments(charger);
    loadCommunityPhotos(charger);

    // Admin: show edit button
    var editBtn = document.getElementById('btn-edit-station');
    getCurrentUser().then(function(user) {
      if (user) {
        SupabaseApp.isAdmin(user.id).then(function(isAdmin) {
          editBtn.classList.toggle('hidden', !isAdmin);
        });
      } else {
        editBtn.classList.add('hidden');
      }
    });
    editBtn.onclick = function() { openEditStationModal(charger); };
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

  function customConfirm(message) {
    return new Promise(function(resolve) {
      var modal = document.getElementById('confirm-modal');
      document.getElementById('confirm-message').textContent = message;
      modal.classList.remove('hidden');
      function close(result) {
        modal.classList.add('hidden');
        document.getElementById('confirm-ok').removeEventListener('click', onOk);
        document.getElementById('confirm-cancel').removeEventListener('click', onCancel);
        resolve(result);
      }
      function onOk() { close(true); }
      function onCancel() { close(false); }
      document.getElementById('confirm-ok').addEventListener('click', onOk);
      document.getElementById('confirm-cancel').addEventListener('click', onCancel);
    });
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
    document.getElementById('btn-location').addEventListener('click', goToMyLocation);
    document.getElementById('btn-filters').addEventListener('click', toggleFilters);
    document.getElementById('btn-legend').addEventListener('click', toggleLegend);
    document.getElementById('btn-user').addEventListener('click', toggleAuthModal);
    document.getElementById('btn-admin-header').addEventListener('click', function() {
      var modal = document.getElementById('auth-modal');
      modal.classList.add('hidden');
      showAdminDashboard();
    });
    document.getElementById('close-sidebar').addEventListener('click', hideSidebar);
    document.getElementById('close-filters').addEventListener('click', hideFilters);
    document.getElementById('close-auth').addEventListener('click', hideAuthModal);
    document.getElementById('btn-apply-filters').addEventListener('click', function() { applyFilters(); hideFilters(); });

    // Auth form switching
    document.getElementById('auth-form').addEventListener('submit', handleLogin);
    document.getElementById('signup-form').addEventListener('submit', handleSignup);
    document.getElementById('forgot-form').addEventListener('submit', handleForgotPassword);
    document.getElementById('reset-form').addEventListener('submit', handleResetPassword);
    document.getElementById('toggle-auth').addEventListener('click', function(e) { e.preventDefault(); showAuthView('signup'); });
    document.getElementById('toggle-to-login').addEventListener('click', function(e) { e.preventDefault(); showAuthView('login'); });
    document.getElementById('forgot-password').addEventListener('click', function(e) { e.preventDefault(); showAuthView('forgot'); });
    document.getElementById('back-to-login').addEventListener('click', function(e) { e.preventDefault(); showAuthView('login'); });
    document.getElementById('signup-password').addEventListener('input', function() { updatePasswordStrength(this.value); });
    document.getElementById('signup-confirm').addEventListener('input', function() {
      var pw = document.getElementById('signup-password').value;
      var el = document.getElementById('password-match');
      if (!this.value) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      if (this.value === pw) { el.textContent = 'Las contraseñas coinciden'; el.className = 'password-match valid'; }
      else { el.textContent = 'Las contraseñas no coinciden'; el.className = 'password-match invalid'; }
    });

    // Reset password strength + match
    document.getElementById('reset-password').addEventListener('input', function() {
      var pw = this.value;
      var bar = document.getElementById('reset-strength-fill');
      var text = document.getElementById('reset-strength-text');
      var container = document.getElementById('reset-strength');
      if (!pw) { container.classList.add('hidden'); return; }
      container.classList.remove('hidden');
      var score = 0;
      if (pw.length >= 6) score++;
      if (pw.length >= 10) score++;
      if (/[A-Z]/.test(pw)) score++;
      if (/[0-9]/.test(pw)) score++;
      if (/[^A-Za-z0-9]/.test(pw)) score++;
      var levels = [
        { width: '20%', color: '#ef4444', label: 'Muy débil' },
        { width: '40%', color: '#f97316', label: 'Débil' },
        { width: '60%', color: '#f59e0b', label: 'Regular' },
        { width: '80%', color: '#22c55e', label: 'Buena' },
        { width: '100%', color: '#16a34a', label: 'Muy fuerte' }
      ];
      var level = levels[Math.min(score, 4)];
      bar.style.width = level.width;
      bar.style.background = level.color;
      text.textContent = level.label;
      text.style.color = level.color;
    });
    document.getElementById('reset-confirm').addEventListener('input', function() {
      var pw = document.getElementById('reset-password').value;
      var el = document.getElementById('reset-match');
      if (!this.value) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      if (this.value === pw) { el.textContent = 'Las contraseñas coinciden'; el.className = 'password-match valid'; }
      else { el.textContent = 'Las contraseñas no coinciden'; el.className = 'password-match invalid'; }
    });

    document.getElementById('btn-more-info').addEventListener('click', function() {
      var extra = document.getElementById('charger-extra');
      var btn = document.getElementById('btn-more-info');
      if (extra.style.display === 'none') { extra.style.display = 'block'; btn.innerHTML = '<svg class="icon" width="14" height="14"><use href="#icon-close"></use></svg> Menos información'; }
      else { extra.style.display = 'none'; btn.innerHTML = '<svg class="icon" width="14" height="14"><use href="#icon-info"></use></svg> Más información'; }
    });

    // Community features
    document.getElementById('btn-favorite').addEventListener('click', toggleFavorite);
    document.getElementById('btn-submit-comment').addEventListener('click', submitComment);
    document.getElementById('btn-add-photo').addEventListener('click', function() { document.getElementById('photo-upload').click(); });
    document.getElementById('photo-upload').addEventListener('change', handlePhotoUpload);
    document.getElementById('btn-report').addEventListener('click', showReportModal);
    document.getElementById('close-report').addEventListener('click', function() { document.getElementById('report-modal').classList.add('hidden'); });
    document.getElementById('report-form').addEventListener('submit', submitReport);
    document.getElementById('btn-add-station').addEventListener('click', showNewStationModal);
    document.getElementById('close-new-station').addEventListener('click', function() { document.getElementById('new-station-modal').classList.add('hidden'); if (stationPickerMap) { stationPickerMap.remove(); stationPickerMap = null; } });
    document.getElementById('new-station-form').addEventListener('submit', submitNewStation);
    document.getElementById('close-edit-station').addEventListener('click', function() { document.getElementById('edit-station-modal').classList.add('hidden'); if (editStationMap) { editStationMap.remove(); editStationMap = null; } });
    document.getElementById('btn-save-charger-edit').addEventListener('click', saveChargerEdit);

    // Star rating
    document.querySelectorAll('#star-rating .star').forEach(function(star) {
      star.addEventListener('click', function() { updateStarRating(parseInt(this.dataset.value)); });
    });

    // Load favorites on init
    loadUserFavorites();

    var moveTimeout;
    ChargerMap.onMapEvent('moveend', function() {
      clearTimeout(moveTimeout);
      moveTimeout = setTimeout(function() { loadChargers(); }, 500);
    });

    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') { hideSidebar(); hideFilters(); hideAuthModal(); document.getElementById('report-modal').classList.add('hidden'); document.getElementById('new-station-modal').classList.add('hidden'); document.getElementById('edit-station-modal').classList.add('hidden'); } });
  }

  // === AUTH VIEWS ===
  function buildLoginForm() {
    return '<form id="auth-form">' +
      '<div class="form-group"><label for="auth-email">Correo electrónico</label><input type="email" id="auth-email" placeholder="tu@email.com" required /></div>' +
      '<div class="form-group"><label for="auth-password">Contraseña</label><input type="password" id="auth-password" placeholder="••••••••" required autocomplete="current-password" /></div>' +
      '<button type="submit" class="btn-primary" id="auth-submit">Iniciar sesión</button>' +
      '<p class="auth-toggle"><a href="#" id="forgot-password">¿Olvidaste tu contraseña?</a></p>' +
      '<p class="auth-toggle">¿No tienes cuenta? <a href="#" id="toggle-auth">Regístrate</a></p>' +
      '<div id="auth-error" class="error-msg hidden"></div></form>';
  }

  function buildSignupForm() {
    return '<form id="signup-form" class="hidden">' +
      '<div class="form-group"><label for="signup-name">Nombre</label><input type="text" id="signup-name" placeholder="Tu nombre" required /></div>' +
      '<div class="form-group"><label for="signup-email">Correo electrónico</label><input type="email" id="signup-email" placeholder="tu@email.com" required /></div>' +
      '<div class="form-group"><label for="signup-password">Contraseña</label><input type="password" id="signup-password" placeholder="Mínimo 6 caracteres" required minlength="6" />' +
      '<div id="password-strength" class="password-strength hidden"><div class="strength-bar"><div class="strength-fill" id="strength-fill"></div></div><span class="strength-text" id="strength-text"></span></div></div>' +
      '<div class="form-group"><label for="signup-confirm">Confirmar contraseña</label><input type="password" id="signup-confirm" placeholder="Repite tu contraseña" required minlength="6" />' +
      '<div id="password-match" class="password-match hidden"></div></div>' +
      '<button type="submit" class="btn-primary" id="signup-submit">Crear cuenta</button>' +
      '<p class="auth-toggle">¿Ya tienes cuenta? <a href="#" id="toggle-to-login">Inicia sesión</a></p>' +
      '<div id="signup-error" class="error-msg hidden"></div></form>';
  }

  function buildForgotForm() {
    return '<form id="forgot-form" class="hidden">' +
      '<div class="form-group"><label for="forgot-email">Correo electrónico</label><input type="email" id="forgot-email" placeholder="tu@email.com" required /></div>' +
      '<button type="submit" class="btn-primary" id="forgot-submit">Enviar enlace</button>' +
      '<p class="auth-toggle"><a href="#" id="back-to-login">← Volver a iniciar sesión</a></p>' +
      '<div id="forgot-error" class="error-msg hidden"></div></form>';
  }

  function buildResetForm() {
    return '<form id="reset-form" class="hidden">' +
      '<div class="form-group"><label for="reset-password">Nueva contraseña</label><input type="password" id="reset-password" placeholder="Mínimo 6 caracteres" required minlength="6" />' +
      '<div id="reset-strength" class="password-strength hidden"><div class="strength-bar"><div class="strength-fill" id="reset-strength-fill"></div></div><span class="strength-text" id="reset-strength-text"></span></div></div>' +
      '<div class="form-group"><label for="reset-confirm">Confirmar contraseña</label><input type="password" id="reset-confirm" placeholder="Repite tu contraseña" required minlength="6" />' +
      '<div id="reset-match" class="password-match hidden"></div></div>' +
      '<button type="submit" class="btn-primary" id="reset-submit">Guardar contraseña</button>' +
      '<div id="reset-error" class="error-msg hidden"></div></form>';
  }

  function rebindAuthEvents() {
    var af = document.getElementById('auth-form');
    if (af) af.addEventListener('submit', handleLogin);
    var sf = document.getElementById('signup-form');
    if (sf) sf.addEventListener('submit', handleSignup);
    var ff = document.getElementById('forgot-form');
    if (ff) ff.addEventListener('submit', handleForgotPassword);
    var rf = document.getElementById('reset-form');
    if (rf) rf.addEventListener('submit', handleResetPassword);
    var ta = document.getElementById('toggle-auth');
    if (ta) ta.addEventListener('click', function(e) { e.preventDefault(); showAuthView('signup'); });
    var tl = document.getElementById('toggle-to-login');
    if (tl) tl.addEventListener('click', function(e) { e.preventDefault(); showAuthView('login'); });
    var fp = document.getElementById('forgot-password');
    if (fp) fp.addEventListener('click', function(e) { e.preventDefault(); showAuthView('forgot'); });
    var bl = document.getElementById('back-to-login');
    if (bl) bl.addEventListener('click', function(e) { e.preventDefault(); showAuthView('login'); });
    var sp = document.getElementById('signup-password');
    if (sp) sp.addEventListener('input', function() { updatePasswordStrength(this.value); });
    var sc = document.getElementById('signup-confirm');
    if (sc) sc.addEventListener('input', function() {
      var pw = document.getElementById('signup-password').value;
      var el = document.getElementById('password-match');
      if (!this.value) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      if (this.value === pw) { el.textContent = 'Las contraseñas coinciden'; el.className = 'password-match valid'; }
      else { el.textContent = 'Las contraseñas no coinciden'; el.className = 'password-match invalid'; }
    });
    var rp = document.getElementById('reset-password');
    if (rp) rp.addEventListener('input', function() {
      var pw = this.value;
      var bar = document.getElementById('reset-strength-fill');
      var text = document.getElementById('reset-strength-text');
      var container = document.getElementById('reset-strength');
      if (!pw) { container.classList.add('hidden'); return; }
      container.classList.remove('hidden');
      var score = 0;
      if (pw.length >= 6) score++;
      if (pw.length >= 10) score++;
      if (/[A-Z]/.test(pw)) score++;
      if (/[0-9]/.test(pw)) score++;
      if (/[^A-Za-z0-9]/.test(pw)) score++;
      var levels = [{w:'20%',c:'#ef4444',l:'Muy débil'},{w:'40%',c:'#f97316',l:'Débil'},{w:'60%',c:'#f59e0b',l:'Regular'},{w:'80%',c:'#22c55e',l:'Buena'},{w:'100%',c:'#16a34a',l:'Muy fuerte'}];
      var lv = levels[Math.min(score, 4)];
      bar.style.width = lv.w; bar.style.background = lv.c;
      text.textContent = lv.l; text.style.color = lv.c;
    });
    var rc = document.getElementById('reset-confirm');
    if (rc) rc.addEventListener('input', function() {
      var pw = document.getElementById('reset-password').value;
      var el = document.getElementById('reset-match');
      if (!this.value) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      if (this.value === pw) { el.textContent = 'Las contraseñas coinciden'; el.className = 'password-match valid'; }
      else { el.textContent = 'Las contraseñas no coinciden'; el.className = 'password-match invalid'; }
    });
  }

  function showAuthView(view) {
    var el;
    el = document.getElementById('auth-form'); if (el) el.classList.add('hidden');
    el = document.getElementById('signup-form'); if (el) el.classList.add('hidden');
    el = document.getElementById('forgot-form'); if (el) el.classList.add('hidden');
    el = document.getElementById('reset-form'); if (el) el.classList.add('hidden');
    el = document.getElementById('auth-error'); if (el) el.classList.add('hidden');
    el = document.getElementById('signup-error'); if (el) el.classList.add('hidden');
    el = document.getElementById('forgot-error'); if (el) el.classList.add('hidden');
    el = document.getElementById('reset-error'); if (el) el.classList.add('hidden');

    // If form elements were destroyed (e.g. by admin dashboard), rebuild the auth forms
    var form = document.getElementById('auth-form');
    if (form && !document.getElementById('signup-form')) {
      form.innerHTML = buildLoginForm() + buildSignupForm() + buildForgotForm() + buildResetForm();
      rebindAuthEvents();
    }

    if (view === 'login') {
      el = document.getElementById('auth-form'); if (el) el.classList.remove('hidden');
      document.getElementById('auth-title').textContent = 'Iniciar sesión';
      document.getElementById('auth-subtitle').textContent = 'Bienvenido de nuevo a ElectroMap';
    } else if (view === 'signup') {
      el = document.getElementById('signup-form'); if (el) el.classList.remove('hidden');
      document.getElementById('auth-title').textContent = 'Crear cuenta';
      document.getElementById('auth-subtitle').textContent = 'Únete a la comunidad ElectroMap';
    } else if (view === 'forgot') {
      el = document.getElementById('forgot-form'); if (el) el.classList.remove('hidden');
      document.getElementById('auth-title').textContent = 'Recuperar contraseña';
      document.getElementById('auth-subtitle').textContent = 'Te enviaremos un enlace para restablecerla';
    } else if (view === 'reset') {
      document.getElementById('reset-form').classList.remove('hidden');
      document.getElementById('auth-title').textContent = 'Nueva contraseña';
      document.getElementById('auth-subtitle').textContent = 'Elige una contraseña segura';
    }
  }

  async function toggleAuthModal() {
    try {
      var result = await SupabaseApp.getUser();
      if (result && result.data && result.data.user && result.data.user.id) {
        showProfileModal(result.data.user);
      } else {
        showAuthView('login');
        document.getElementById('auth-modal').classList.remove('hidden');
      }
    } catch (e) {
      showAuthView('login');
      document.getElementById('auth-modal').classList.remove('hidden');
    }
  }

  function hideAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
    var err = document.getElementById('auth-error');
    if (err) err.classList.add('hidden');
    var signupErr = document.getElementById('signup-error');
    if (signupErr) signupErr.classList.add('hidden');
    var forgotErr = document.getElementById('forgot-error');
    if (forgotErr) forgotErr.classList.add('hidden');
    var resetErr = document.getElementById('reset-error');
    if (resetErr) resetErr.classList.add('hidden');
    showAuthView('login');
  }

  // === FAVORITES ===
  async function updateFavoriteButton(charger) {
    var btn = document.getElementById('btn-favorite');
    var text = document.getElementById('btn-favorite-text');
    var user = await getCurrentUser();
    if (!user) {
      btn.classList.remove('active');
      text.textContent = 'Guardar';
      return;
    }
    var isFav = userFavorites.some(function(id) { return id === charger.id; });
    btn.classList.toggle('active', isFav);
    text.textContent = isFav ? 'Guardado' : 'Guardar';
  }

  async function toggleFavorite() {
    var user = await getCurrentUser();
    if (!user) { showToast('Inicia sesión para guardar favoritos'); return; }
    if (!currentCharger) return;
    var isFav = await SupabaseApp.toggleFavorite(user.id, currentCharger.id);
    if (isFav) {
      userFavorites.push(currentCharger.id);
      showToast('Agregado a favoritos');
    } else {
      userFavorites = userFavorites.filter(function(id) { return id !== currentCharger.id; });
      showToast('Eliminado de favoritos');
    }
    updateFavoriteButton(currentCharger);
  }

  async function loadUserFavorites() {
    var user = await getCurrentUser();
    if (!user) { userFavorites = []; return; }
    userFavorites = await SupabaseApp.getFavorites(user.id);
  }

  // === COMMENTS ===
  async function loadComments(charger) {
    var comments = await SupabaseApp.getComments(charger.id);
    var list = document.getElementById('comments-list');
    var ratingEl = document.getElementById('charger-rating');
    var user = await getCurrentUser();

    if (comments.length === 0) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:8px 0;">No hay reseñas aún</div>';
      ratingEl.textContent = '0 ★';
      return;
    }

    var avg = await SupabaseApp.getAverageRating(charger.id);
    ratingEl.textContent = avg + ' ★';

    list.innerHTML = comments.map(function(c) {
      var stars = c.rating ? '★'.repeat(c.rating) + '☆'.repeat(5 - c.rating) : '';
      var date = c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX') : '';
      var isOwn = user && c.user_id === user.id;
      var actions = isOwn ? '<div class="comment-actions"><button class="comment-action-btn" data-action="edit" data-id="' + c.id + '" data-rating="' + (c.rating || 0) + '" data-text="' + (c.comment || '').replace(/"/g, '&quot;') + '">Editar</button><button class="comment-action-btn danger" data-action="delete" data-id="' + c.id + '">Eliminar</button></div>' : '';
      return '<div class="comment-item" data-id="' + c.id + '"><div class="comment-header"><span class="comment-author">' + (c.user_name || 'Anónimo') + '</span><span class="comment-stars">' + stars + '</span></div><div class="comment-text">' + (c.comment || '') + '</div><div class="comment-date">' + date + '</div>' + actions + '</div>';
    }).join('');

    list.querySelectorAll('.comment-action-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var action = this.dataset.action;
        var id = this.dataset.id;
        if (action === 'delete') deleteComment(id);
        else if (action === 'edit') startEditComment(id, parseInt(this.dataset.rating), this.dataset.text);
      });
    });
  }

  async function deleteComment(commentId) {
    if (!await customConfirm('¿Eliminar esta reseña?')) return;
    var ok = await SupabaseApp.deleteComment(commentId);
    if (ok) {
      showToast('Reseña eliminada');
      if (currentCharger) loadComments(currentCharger);
    } else {
      showToast('Error al eliminar');
    }
  }

  function startEditComment(commentId, currentRating, currentText) {
    var list = document.getElementById('comments-list');
    var existing = document.getElementById('edit-comment-form');
    if (existing) existing.remove();

    var form = document.createElement('div');
    form.id = 'edit-comment-form';
    form.className = 'comment-item';
    form.style.borderColor = 'var(--accent)';
    form.innerHTML =
      '<div class="star-rating" id="edit-star-rating">' +
        [1,2,3,4,5].map(function(v) { return '<span class="star' + (v <= currentRating ? ' active' : '') + '" data-value="' + v + '">★</span>'; }).join('') +
      '</div>' +
      '<textarea id="edit-comment-text" rows="2" style="width:100%;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:13px;font-family:inherit;margin-bottom:8px;">' + currentText + '</textarea>' +
      '<div style="display:flex;gap:8px;">' +
        '<button class="btn-primary btn-sm" id="btn-save-edit" data-id="' + commentId + '">Guardar</button>' +
        '<button class="btn-sm" id="btn-cancel-edit" style="background:var(--surface);color:var(--text);border:1px solid var(--border);">Cancelar</button>' +
      '</div>';

    list.insertBefore(form, list.firstChild);

    var editRating = currentRating;
    form.querySelectorAll('#edit-star-rating .star').forEach(function(s) {
      s.addEventListener('click', function() {
        editRating = parseInt(this.dataset.value);
        form.querySelectorAll('#edit-star-rating .star').forEach(function(st) {
          st.classList.toggle('active', parseInt(st.dataset.value) <= editRating);
        });
      });
    });

    document.getElementById('btn-save-edit').addEventListener('click', async function() {
      var text = document.getElementById('edit-comment-text').value.trim();
      var ok = await SupabaseApp.updateComment(this.dataset.id, editRating || null, text);
      if (ok) {
        showToast('Reseña actualizada');
        if (currentCharger) loadComments(currentCharger);
      } else {
        showToast('Error al actualizar');
      }
    });

    document.getElementById('btn-cancel-edit').addEventListener('click', function() {
      form.remove();
    });
  }

  async function submitComment() {
    var user = await getCurrentUser();
    if (!user) { showToast('Inicia sesión para comentar'); return; }
    if (!currentCharger) return;

    var text = document.getElementById('comment-text').value.trim();
    if (!text && !selectedRating) { showToast('Escribe un comentario o selecciona una calificación'); return; }

    var profile = await SupabaseApp.getProfile(user.id);
    var userName = (profile && profile.display_name) ? profile.display_name : (user.email ? user.email.split('@')[0] : 'Anónimo');
    var result = await SupabaseApp.addComment(currentCharger.id, userName, selectedRating || null, text, user.id);
    if (result) {
      document.getElementById('comment-text').value = '';
      selectedRating = 0;
      updateStarRating(0);
      loadComments(currentCharger);
      showToast('Comentario enviado');
      // Update profile comment count if modal is open
      var countEl = document.getElementById('profile-comment-count');
      if (countEl) countEl.textContent = parseInt(countEl.textContent || '0') + 1;
    } else {
      showToast('Error al enviar comentario');
    }
  }

  function updateStarRating(rating) {
    selectedRating = rating;
    document.querySelectorAll('#star-rating .star').forEach(function(s) {
      s.classList.toggle('active', parseInt(s.dataset.value) <= rating);
    });
  }

  // === COMMUNITY PHOTOS ===
  async function loadCommunityPhotos(charger) {
    var photos = await SupabaseApp.getPhotos(charger.id);
    var grid = document.getElementById('community-photos');
    if (photos.length === 0) {
      grid.innerHTML = '';
      return;
    }
    var user = await getCurrentUser();
    grid.innerHTML = photos.map(function(p) {
      var del = user && p.user_id === user.id ? '<button class="photo-delete-btn" data-id="' + p.id + '">×</button>' : '';
      return '<div class="photo-thumb-wrap"><img src="' + p.url + '" alt="' + (p.caption || 'Foto') + '" loading="lazy" onerror="this.parentElement.style.display=\'none\'" class="community-photo-thumb">' + del + '</div>';
    }).join('');
    grid.querySelectorAll('.community-photo-thumb').forEach(function(img) {
      img.addEventListener('click', function() { openLightbox(this.src); });
    });
    grid.querySelectorAll('.photo-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        if (!await customConfirm('¿Eliminar esta foto?')) return;
        var ok = await SupabaseApp.deletePhoto(this.dataset.id);
        if (ok) {
          showToast('Foto eliminada');
          loadCommunityPhotos(currentCharger);
        }
      });
    });
  }

  // === PROFILE PHOTOS ===
  async function loadProfilePhotos(userId) {
    var photos = await SupabaseApp.getUserPhotos(userId);
    var container = document.getElementById('profile-photos');
    var countEl = document.getElementById('profile-photo-count');
    var emptyEl = document.getElementById('profile-photos-empty');
    if (countEl) countEl.textContent = photos.length;
    if (!container) return;
    if (photos.length === 0) {
      container.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    container.innerHTML = photos.map(function(p) {
      return '<div class="photo-thumb-wrap"><img src="' + p.url + '" class="community-photo-thumb" loading="lazy"><button class="photo-delete-btn" data-id="' + p.id + '">×</button></div>';
    }).join('');
    container.querySelectorAll('.community-photo-thumb').forEach(function(img) {
      img.addEventListener('click', function() { openLightbox(this.src); });
    });
    container.querySelectorAll('.photo-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        if (!await customConfirm('¿Eliminar esta foto?')) return;
        var ok = await SupabaseApp.deletePhoto(this.dataset.id);
        if (ok) { showToast('Foto eliminada'); loadProfilePhotos(userId); }
      });
    });
  }

  async function handlePhotoUpload(e) {
    var user = await getCurrentUser();
    if (!user) { showToast('Inicia sesión para subir fotos'); return; }
    if (!currentCharger) return;

    var file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('La imagen no puede superar 5MB'); return; }

    showToast('Subiendo foto...');
    var reader = new FileReader();
    reader.onload = async function(ev) {
      var dataUrl = ev.target.result;
      var result = await SupabaseApp.addPhoto(currentCharger.id, dataUrl, '', user.id);
      if (result) {
        loadCommunityPhotos(currentCharger);
        showToast('Foto agregada');
      } else {
        showToast('Error al subir foto');
      }
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  }

  // === REPORTS ===
  function showReportModal() {
    var user = getCurrentUser();
    if (!user) { showToast('Inicia sesión para reportar'); return; }
    document.getElementById('report-modal').classList.remove('hidden');
  }

  async function submitReport(e) {
    e.preventDefault();
    var user = await getCurrentUser();
    if (!user) { showToast('Inicia sesión para reportar'); return; }

    var type = document.getElementById('report-type').value;
    var description = document.getElementById('report-description').value.trim();
    if (!description) { showToast('Describe el problema'); return; }

    var data = {
      chargerId: currentCharger ? currentCharger.id : null,
      type: type,
      description: description
    };

    var result = await SupabaseApp.addReport(data);
    if (result) {
      document.getElementById('report-modal').classList.add('hidden');
      document.getElementById('report-form').reset();
      showToast('Reporte enviado. Gracias.');
    } else {
      showToast('Error al enviar reporte');
    }
  }

  // === NEW STATION ===
  var stationPickerMap = null;
  var stationMarker = null;

  function showNewStationModal() {
    var user = getCurrentUser();
    if (!user) { showToast('Inicia sesión para reportar estaciones'); return; }
    document.getElementById('new-station-modal').classList.remove('hidden');
    initStationPickerMap();
  }

  function initStationPickerMap() {
    var centerLat = userLat || 27.4869;
    var centerLng = userLng || -109.9409;

    if (stationPickerMap) { stationPickerMap.remove(); stationPickerMap = null; }

    stationPickerMap = L.map('station-map-picker', { zoomControl: false }).setView([centerLat, centerLng], 14);

    var isDark = currentTheme === 'dark';
    L.tileLayer(isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: ''
    }).addTo(stationPickerMap);

    stationMarker = L.marker([centerLat, centerLng], { draggable: true, icon: createStationIcon() }).addTo(stationPickerMap);
    document.getElementById('station-lat').value = centerLat;
    document.getElementById('station-lng').value = centerLng;

    stationMarker.on('dragend', function() {
      var pos = stationMarker.getLatLng();
      document.getElementById('station-lat').value = pos.lat;
      document.getElementById('station-lng').value = pos.lng;
      reverseGeocode(pos.lat, pos.lng, 'station-address');
    });

    stationPickerMap.on('click', function(e) {
      stationMarker.setLatLng(e.latlng);
      document.getElementById('station-lat').value = e.latlng.lat;
      document.getElementById('station-lng').value = e.latlng.lng;
      reverseGeocode(e.latlng.lat, e.latlng.lng, 'station-address');
    });

    // Add Google search bar
    addMapSearchBar(stationPickerMap, stationMarker, 'station-address', 'station-lat', 'station-lng');

    // Generate connector rows
    generateConnectorRows(1);
    document.getElementById('station-points').addEventListener('input', function() {
      generateConnectorRows(parseInt(this.value) || 1);
    });

    setTimeout(function() { stationPickerMap.invalidateSize(); }, 200);
  }

  var connectorOptions = '<option value="SAE J1772">SAE J1772 (Nivel 2)</option>' +
    '<option value="CCS1">CCS1 (DC Rápida)</option>' +
    '<option value="CCS2">CCS2 (DC Rápida)</option>' +
    '<option value="CHAdeMO">CHAdeMO (DC Rápida)</option>' +
    '<option value="Tesla">Tesla (SC / NEMA 14-50)</option>' +
    '<option value="GB/T">GB/T</option>' +
    '<option value="Otro">Otro</option>';

  var levelOptions = '<option value="">Nivel</option>' +
    '<option value="Nivel 1">Nivel 1 (120V)</option>' +
    '<option value="Nivel 2">Nivel 2 (240V)</option>' +
    '<option value="DC Rápida">DC Rápida</option>';

  function generateConnectorRows(count) {
    var container = document.getElementById('connector-rows');
    if (!container) return;
    var existing = container.querySelectorAll('.connector-row').length;
    if (count === existing) return;

    if (count < existing) {
      while (container.children.length > count) container.removeChild(container.lastChild);
    } else {
      for (var i = existing; i < count; i++) {
        var row = document.createElement('div');
        row.className = 'connector-row new-station-row';
        row.innerHTML = '<div class="form-group" style="flex:1;"><select class="conn-type">' + connectorOptions + '</select></div>' +
          '<div class="form-group" style="flex:1;"><select class="conn-level">' + levelOptions + '</select></div>' +
          '<div class="form-group" style="flex:1;"><input type="number" class="conn-power" placeholder="kW" min="0" /></div>';
        container.appendChild(row);
      }
    }
  }

  function getConnectorData() {
    var rows = document.querySelectorAll('#connector-rows .connector-row');
    var connectors = [];
    rows.forEach(function(row) {
      connectors.push({
        type: row.querySelector('.conn-type').value,
        level: row.querySelector('.conn-level').value,
        power: parseFloat(row.querySelector('.conn-power').value) || null
      });
    });
    return connectors;
  }

  var googleMapsKey = '';

  function reverseGeocode(lat, lng, addressFieldId) {
    fetch('/api/places?type=reverse&lat=' + lat + '&lng=' + lng)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.status === 'OK' && data.results && data.results[0]) {
          var el = document.getElementById(addressFieldId);
          if (el) el.value = data.results[0].formatted_address;
        }
      }).catch(function() {});
  }

  function addMapSearchBar(map, marker, addressFieldId, latFieldId, lngFieldId) {
    var mapContainer = document.getElementById('station-map-picker').parentElement;
    mapContainer.style.position = 'relative';
    var searchDiv = document.createElement('div');
    searchDiv.style.cssText = 'position:absolute;top:8px;left:8px;right:8px;z-index:1000;';
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Buscar dirección...';
    input.style.cssText = 'width:100%;padding:8px 12px;border:none;border-radius:var(--radius-sm);font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.3);background:var(--surface);color:var(--text);font-family:inherit;';
    searchDiv.appendChild(input);
    mapContainer.insertBefore(searchDiv, mapContainer.firstChild);

    var suggestionsDiv = document.createElement('div');
    suggestionsDiv.style.cssText = 'position:absolute;top:38px;left:0;right:0;background:var(--surface);border-radius:0 0 var(--radius-sm) var(--radius-sm);box-shadow:0 4px 12px rgba(0,0,0,0.3);display:none;z-index:1001;max-height:200px;overflow-y:auto;';
    searchDiv.appendChild(suggestionsDiv);

    var searchTimeout;
    input.addEventListener('input', function() {
      clearTimeout(searchTimeout);
      var query = input.value.trim();
      if (query.length < 3) { suggestionsDiv.style.display = 'none'; return; }
      searchTimeout = setTimeout(function() {
        fetch('/api/places?type=autocomplete&q=' + encodeURIComponent(query))
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.status === 'OK' && data.predictions && data.predictions.length > 0) {
              suggestionsDiv.innerHTML = data.predictions.map(function(p, i) {
                return '<div class="suggestion-item" data-index="' + i + '" style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);color:var(--text);">' + p.description + '</div>';
              }).join('');
              suggestionsDiv.style.display = 'block';
              suggestionsDiv.querySelectorAll('.suggestion-item').forEach(function(item) {
                item.addEventListener('click', function() {
                  var idx = parseInt(this.dataset.index);
                  var pred = data.predictions[idx];
                  input.value = pred.description;
                  suggestionsDiv.style.display = 'none';
                  fetch('/api/places?type=details&place_id=' + pred.place_id)
                    .then(function(r2) { return r2.json(); })
                    .then(function(details) {
                      if (details.status === 'OK' && details.result && details.result.geometry) {
                        var loc = details.result.geometry.location;
                        marker.setLatLng([loc.lat, loc.lng]);
                        map.setView([loc.lat, loc.lng], 16);
                        document.getElementById(latFieldId).value = loc.lat;
                        document.getElementById(lngFieldId).value = loc.lng;
                        document.getElementById(addressFieldId).value = details.result.formatted_address || pred.description;
                      }
                    }).catch(function() {});
                });
              });
            } else {
              suggestionsDiv.style.display = 'none';
            }
          }).catch(function() { suggestionsDiv.style.display = 'none'; });
      }, 300);
    });

    document.addEventListener('click', function(e) {
      if (!searchDiv.contains(e.target)) suggestionsDiv.style.display = 'none';
    });
  }

  function createStationIcon() {
    return L.divIcon({
      html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" color="#22c55e" fill="none" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 10.5C14.5 12.1569 13.1569 13.5 11.5 13.5C9.84315 13.5 8.5 12.1569 8.5 10.5C8.5 8.84315 9.84315 7.5 11.5 7.5C13.1569 7.5 14.5 8.84315 14.5 10.5Z"></path><path d="M17.495 14.5V20.5M20.5 17.495L14.5 17.495"></path><path d="M19.5 10.5352C19.4998 6.09743 15.9182 2.5 11.5 2.5C7.08184 2.5 3.50019 6.09743 3.5 10.5352C3.5 13.0728 4.5 15.0462 6.5 16.8086C7.57535 17.7562 9.32325 19.5313 10.5469 21.0625C10.7798 21.354 11.1397 21.5 11.5 21.5C11.8603 21.5 12.2202 21.354 12.4531 21.0625"></path></svg>',
      className: '',
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -36]
    });
  }

  async function submitNewStation(e) {
    e.preventDefault();
    var user = await getCurrentUser();
    if (!user) { showToast('Inicia sesión'); return; }

    var name = document.getElementById('station-name').value.trim();
    if (!name) { showToast('El nombre es requerido'); return; }

    var connectors = getConnectorData();
    var mainConnector = connectors.length > 0 ? connectors[0].type : null;
    var mainLevel = connectors.length > 0 ? connectors[0].level : null;
    var connectorJson = connectors.length > 1 ? JSON.stringify(connectors.map(function(c) { return c.type; })) : mainConnector;
    var levelJson = connectors.length > 1 ? JSON.stringify(connectors.map(function(c) { return c.level; })) : mainLevel;
    var powerJson = connectors.length > 1 ? JSON.stringify(connectors.map(function(c) { return c.power; })) : (connectors[0] && connectors[0].power ? connectors[0].power : null);

    var points = document.getElementById('station-points').value;
    var points = document.getElementById('station-points').value;
    var cost = document.getElementById('station-cost').value;
    var operator = document.getElementById('station-operator').value.trim();
    var statusId = parseInt(document.getElementById('station-status').value) || 50;
    var extraDesc = document.getElementById('station-description').value.trim();

    var descParts = [];
    if (connectorJson) descParts.push('Conector: ' + (connectors.length > 1 ? connectors.map(function(c) { return c.type; }).join(', ') : connectorJson));
    if (levelJson) descParts.push('Nivel: ' + (connectors.length > 1 ? connectors.map(function(c) { return c.level; }).filter(Boolean).join(', ') : mainLevel));
    if (power) descParts.push('Potencia: ' + power + ' kW');
    if (points) descParts.push('Puntos: ' + points);
    if (cost) descParts.push('Costo: ' + cost);
    if (operator) descParts.push('Operador: ' + operator);
    if (extraDesc) descParts.push(extraDesc);

    var data = {
      chargerId: null,
      type: 'new_station',
      description: descParts.join('\n'),
      newStationName: name,
      newStationAddress: document.getElementById('station-address').value.trim(),
      newStationConnector: connectorJson,
      newStationLat: parseFloat(document.getElementById('station-lat').value) || null,
      newStationLng: parseFloat(document.getElementById('station-lng').value) || null,
      level: levelJson,
      power: powerJson,
      points: points ? parseInt(points) : null,
      cost: cost,
      operator: operator,
      statusId: statusId
    };

    var result = await SupabaseApp.addReport(data);
    if (result) {
      document.getElementById('new-station-modal').classList.add('hidden');
      document.getElementById('new-station-form').reset();
      if (stationPickerMap) { stationPickerMap.remove(); stationPickerMap = null; }
      showToast('Nueva estación reportada. Gracias.');
    } else {
      showToast('Error al enviar');
    }
  }

  async function checkAdminHeader() {
    var user = await getCurrentUser();
    var btn = document.getElementById('btn-admin-header');
    if (!btn) return;
    if (user) {
      try {
        var admin = await SupabaseApp.isAdmin(user.id);
        btn.classList.toggle('hidden', !admin);
      } catch (e) {
        btn.classList.add('hidden');
      }
    } else {
      btn.classList.add('hidden');
    }
  }

  // === HELPER: get current user ===
  async function getCurrentUser() {
    try {
      var result = await SupabaseApp.getUser();
      if (result && result.data && result.data.user && result.data.user.id) {
        return result.data.user;
      }
    } catch (e) {}
    return null;
  }

  // === PROFILE MODAL ===
  function showProfileModal(user) {
    if (!user) return;
    var modal = document.getElementById('auth-modal');
    var title = document.getElementById('auth-title');
    var form = document.getElementById('auth-form');
    var content = modal.querySelector('.modal-content');
    var initial = user.email ? user.email[0].toUpperCase() : 'U';

    if (content) content.classList.remove('modal-content-wide');
    title.textContent = 'Mi perfil';
    var subtitleEl = document.getElementById('auth-subtitle');
    if (subtitleEl) subtitleEl.textContent = 'Bienvenido de nuevo a ElectroMap';
    form.innerHTML =
      '<div style="text-align:center;padding-bottom:4px;">' +
        '<div class="profile-avatar-upload" id="avatar-upload-area" style="margin-bottom:12px;">' +
          '<div class="avatar-circle" id="profile-avatar">' + initial + '</div>' +
          '<div class="avatar-overlay"><svg class="icon" width="12" height="12"><use href="#icon-camera"></use></svg></div>' +
          '<input type="file" id="avatar-file-input" accept="image/*" style="display:none;">' +
        '</div>' +
        '<div class="profile-name" style="color:var(--text);font-size:16px;font-weight:600;margin-bottom:2px;">' + (user.email || 'Usuario') + '</div>' +
        '<div style="color:var(--text-muted);font-size:12px;">Miembro de ElectroMap</div>' +
      '</div>' +
      '<div class="profile-tabs">' +
        '<button class="profile-tab active" data-tab="tab-cuenta">Cuenta</button>' +
        '<button class="profile-tab" data-tab="tab-stats">Estadísticas</button>' +
        '<button class="profile-tab" data-tab="tab-fotos">Fotos</button>' +
      '</div>' +
      '<div class="profile-tab-content" id="tab-cuenta">' +
        '<div class="profile-info-row"><span class="profile-stat-label">Nombre</span><span class="profile-stat-value" id="profile-name-display">' + (user.email || '') + '</span></div>' +
        '<div class="profile-info-row"><span class="profile-stat-label">Correo</span><span class="profile-stat-value" style="font-size:12px;word-break:break-all;">' + (user.email || '') + '</span></div>' +
        '<div class="profile-info-row"><span class="profile-stat-label">Miembro desde</span><span class="profile-stat-value" id="profile-member-since"></span></div>' +
        '<button class="btn-primary" id="btn-save-avatar" style="background:var(--accent);width:100%;display:none;margin-top:16px;margin-bottom:12px;">Guardar foto</button>' +
        '<button class="btn-primary" id="btn-logout" style="background:var(--danger);width:100%;border-radius:var(--radius-sm);margin-top:20px;">Cerrar sesión</button>' +
      '</div>' +
      '<div class="profile-tab-content hidden" id="tab-stats">' +
        '<div class="profile-stat-row"><span class="profile-stat-label">Favoritos</span><span class="profile-stat-value" id="profile-fav-count">0</span></div>' +
        '<div class="profile-stat-row"><span class="profile-stat-label">Reseñas</span><span class="profile-stat-value" id="profile-comment-count">0</span></div>' +
        '<div class="profile-stat-row"><span class="profile-stat-label">Fotos subidas</span><span class="profile-stat-value" id="profile-photo-count">0</span></div>' +
      '</div>' +
      '<div class="profile-tab-content hidden" id="tab-fotos">' +
        '<div id="profile-photos" class="photos-grid"></div>' +
        '<div id="profile-photos-empty" style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px 0;">No has subido fotos aún</div>' +
      '</div>';
    modal.classList.remove('hidden');

    // Tab switching
    form.querySelectorAll('.profile-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        form.querySelectorAll('.profile-tab').forEach(function(t) { t.classList.remove('active'); });
        form.querySelectorAll('.profile-tab-content').forEach(function(c) { c.classList.add('hidden'); });
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.remove('hidden');
      });
    });

    // Load profile data
    SupabaseApp.getProfile(user.id).then(function(profile) {
      if (profile) {
        if (profile.display_name) {
          var nameEl = document.getElementById('profile-name-display');
          if (nameEl) nameEl.textContent = profile.display_name;
          var headerName = document.querySelector('.profile-name');
          if (headerName) headerName.textContent = profile.display_name;
        }
        if (profile.created_at) {
          var dateEl = document.getElementById('profile-member-since');
          if (dateEl) dateEl.textContent = new Date(profile.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
        }
      }
    });
    SupabaseApp.getFavorites(user.id).then(function(favs) {
      var el = document.getElementById('profile-fav-count');
      if (el) el.textContent = favs.length;
    });
    SupabaseApp.getCommentsByUser(user.id).then(function(comments) {
      var el = document.getElementById('profile-comment-count');
      if (el) el.textContent = comments.length;
    });
    loadProfilePhotos(user.id);

    // Check admin
    SupabaseApp.isAdmin(user.id).then(function(admin) {
      var dashBtn = document.getElementById('btn-admin-header');
      if (dashBtn) dashBtn.classList.toggle('hidden', !admin);
    });

    var pendingAvatarData = null;

    // Avatar upload
    document.getElementById('avatar-upload-area').addEventListener('click', function() {
      document.getElementById('avatar-file-input').click();
    });

    document.getElementById('avatar-file-input').addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { showToast('La imagen no puede superar 2MB'); return; }

      var reader = new FileReader();
      reader.onload = function(ev) {
        var img = new Image();
        img.onload = function() {
          var canvas = document.createElement('canvas');
          var maxSize = 200;
          var w = img.width, h = img.height;
          if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
          else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          pendingAvatarData = canvas.toDataURL('image/jpeg', 0.7);
          var avatarEl = document.getElementById('profile-avatar');
          avatarEl.innerHTML = '<img src="' + pendingAvatarData + '" alt="Avatar">';
          document.getElementById('btn-save-avatar').style.display = 'block';
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    // Save avatar
    document.getElementById('btn-save-avatar').addEventListener('click', async function() {
      if (!pendingAvatarData) return;
      var btn = this;
      btn.textContent = 'Guardando...';
      btn.disabled = true;
      try {
        var client = SupabaseApp.getClient();
        if (!client) { showToast('Error: Sin conexión'); btn.disabled = false; return; }
        var user2 = await getCurrentUser();
        if (!user2) { showToast('Error: Sin sesión'); btn.disabled = false; return; }
        var { error } = await client.from('user_profiles')
          .update({ avatar_url: pendingAvatarData })
          .eq('id', user2.id);
        if (error) {
          console.error('Avatar save error:', error);
          showToast('Error: ' + error.message);
        } else {
          showToast('Foto de perfil guardada');
          btn.style.display = 'none';
        }
      } catch (err) {
        console.error('Avatar save exception:', err);
        showToast('Error al guardar foto');
      }
      btn.disabled = false;
    });

    // Load existing avatar
    (async function() {
      try {
        var client = SupabaseApp.getClient();
        if (client) {
          var { data } = await client.from('user_profiles').select('avatar_url').eq('id', user.id).single();
          if (data && data.avatar_url) {
            var avatarEl = document.getElementById('profile-avatar');
            avatarEl.innerHTML = '<img src="' + data.avatar_url + '" alt="Avatar">';
          }
        }
      } catch (e) {}
    })();

    // Logout
    document.getElementById('btn-logout').addEventListener('click', async function() {
      await SupabaseApp.signOut();
      modal.classList.add('hidden');
      showToast('Sesión cerrada');
      setTimeout(function() { window.location.reload(); }, 1000);
    });
  }

  // === EDIT STATION MODAL (ADMIN) ===
  var editStationMap = null;
  var editStationMarker = null;

  function openEditStationModal(charger) {
    document.getElementById('edit-station-modal').classList.remove('hidden');
    document.getElementById('edit-charger-name').value = charger.name || '';
    document.getElementById('edit-charger-address').value = charger.address || '';

    // Parse connector data from connections array
    var conns = charger.connections || [];
    var points = charger.numberOfPoints || conns.length || 1;
    document.getElementById('edit-charger-power').value = conns[0] ? conns[0].powerKW || '' : '';
    document.getElementById('edit-charger-points').value = points;
    document.getElementById('edit-charger-cost').value = charger.cost && charger.cost !== 'Desconocido' ? charger.cost : '';
    document.getElementById('edit-charger-operator').value = charger.operator && charger.operator !== 'CFE' && charger.operator !== 'Comunidad' ? charger.operator : '';
    var statusSel = document.getElementById('edit-charger-status');
    var sid = charger.statusId || 50;
    statusSel.value = (sid === 50 || sid === 10 || sid === 30) ? '50' : (sid === 20 || sid === 150) ? '20' : '0';
    document.getElementById('edit-charger-lat').value = charger.lat;
    document.getElementById('edit-charger-lng').value = charger.lng;

    // Generate connector rows from existing data
    var connContainer = document.getElementById('edit-connector-rows');
    connContainer.innerHTML = '';
    for (var i = 0; i < points; i++) {
      var c = conns[i] || {};
      var row = document.createElement('div');
      row.className = 'connector-row new-station-row';
      row.innerHTML = '<div class="form-group" style="flex:1;"><select class="conn-type">' + connectorOptions + '</select></div>' +
        '<div class="form-group" style="flex:1;"><select class="conn-level">' + levelOptions + '</select></div>';
      connContainer.appendChild(row);
      // Set values after adding to DOM
      var typeSelect = row.querySelector('.conn-type');
      var levelSelect = row.querySelector('.conn-level');
      if (c.type && c.type !== 'N/A') typeSelect.value = c.type;
      if (c.level && c.level !== 'N/A') levelSelect.value = c.level;
    }

    // Points change handler
    var pointsInput = document.getElementById('edit-charger-points');
    pointsInput.oninput = function() {
      var newCount = parseInt(this.value) || 1;
      var currentCount = connContainer.querySelectorAll('.connector-row').length;
      if (newCount > currentCount) {
        for (var j = currentCount; j < newCount; j++) {
          var nr = document.createElement('div');
          nr.className = 'connector-row new-station-row';
          nr.innerHTML = '<div class="form-group" style="flex:1;"><select class="conn-type">' + connectorOptions + '</select></div>' +
            '<div class="form-group" style="flex:1;"><select class="conn-level">' + levelOptions + '</select></div>';
          connContainer.appendChild(nr);
        }
      } else if (newCount < currentCount) {
        while (connContainer.children.length > newCount) connContainer.removeChild(connContainer.lastChild);
      }
    };

    // Init map
    if (editStationMap) { editStationMap.remove(); editStationMap = null; }
    editStationMap = L.map('edit-station-map', { zoomControl: false }).setView([charger.lat, charger.lng], 15);
    var isDark = currentTheme === 'dark';
    L.tileLayer(isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '' }).addTo(editStationMap);
    editStationMarker = L.marker([charger.lat, charger.lng], { draggable: true, icon: createStationIcon() }).addTo(editStationMap);
    editStationMarker.on('dragend', function() {
      var pos = editStationMarker.getLatLng();
      document.getElementById('edit-charger-lat').value = pos.lat;
      document.getElementById('edit-charger-lng').value = pos.lng;
      reverseGeocode(pos.lat, pos.lng, 'edit-charger-address');
    });
    editStationMap.on('click', function(e) {
      editStationMarker.setLatLng(e.latlng);
      document.getElementById('edit-charger-lat').value = e.latlng.lat;
      document.getElementById('edit-charger-lng').value = e.latlng.lng;
      reverseGeocode(e.latlng.lat, e.latlng.lng, 'edit-charger-address');
    });
    setTimeout(function() { editStationMap.invalidateSize(); }, 200);
  }

  async function saveChargerEdit() {
    var chargerId = currentCharger ? currentCharger.id : null;
    if (!chargerId) { showToast('Error: no hay cargador seleccionado'); return; }
    var name = document.getElementById('edit-charger-name').value.trim();
    if (!name) { showToast('El nombre es requerido'); return; }

    var existingApprovedId = currentCharger._approvedId || null;
    var origConn = currentCharger.connections && currentCharger.connections[0] ? currentCharger.connections[0] : {};

    // Get connector data from dynamic rows
    var connectors = [];
    document.querySelectorAll('#edit-connector-rows .connector-row').forEach(function(row) {
      connectors.push({
        type: row.querySelector('.conn-type').value,
        level: row.querySelector('.conn-level').value,
        power: parseFloat(row.querySelector('.conn-power').value) || null
      });
    });
    var connJson = connectors.length > 1 ? JSON.stringify(connectors.map(function(c) { return c.type; })) : (connectors[0] ? connectors[0].type : null);
    var lvlJson = connectors.length > 1 ? JSON.stringify(connectors.map(function(c) { return c.level; })) : (connectors[0] ? connectors[0].level : null);
    var pwJson = connectors.length > 1 ? JSON.stringify(connectors.map(function(c) { return c.power; })) : (connectors[0] && connectors[0].power ? connectors[0].power : null);

    var data = {
      name: name,
      address: document.getElementById('edit-charger-address').value.trim() || currentCharger.address,
      lat: parseFloat(document.getElementById('edit-charger-lat').value) || currentCharger.lat,
      lng: parseFloat(document.getElementById('edit-charger-lng').value) || currentCharger.lng,
      connector: connJson || origConn.type || null,
      level: lvlJson || origConn.level || null,
      power_kw: pwJson,
      points: parseInt(document.getElementById('edit-charger-points').value) || currentCharger.numberOfPoints || null,
      cost: document.getElementById('edit-charger-cost').value || currentCharger.cost || null,
      operator: document.getElementById('edit-charger-operator').value.trim() || currentCharger.operator || null,
      charger_id: chargerId,
      status: document.getElementById('edit-charger-status').value === '50' ? 'Operational' : document.getElementById('edit-charger-status').value === '20' ? 'Non-operational' : 'Unknown',
      status_id: parseInt(document.getElementById('edit-charger-status').value)
    };

    var result;
    if (existingApprovedId) {
      result = await SupabaseApp.updateStation(existingApprovedId, data);
    } else {
      result = await SupabaseApp.approveStation(data);
    }

    if (result !== false && result !== null) {
      document.getElementById('edit-station-modal').classList.add('hidden');
      if (editStationMap) { editStationMap.remove(); editStationMap = null; }
      showToast('Estación actualizada');
      // Clear cache and reload
      ChargerData.clearCache && ChargerData.clearCache();
      loadChargers();
    } else {
      showToast('Error al guardar');
    }
  }

  // === ADMIN CONNECTOR ROWS ===
  function generateAdminConnectorRows(count) {
    var container = document.getElementById('admin-connector-rows');
    if (!container) return;
    var existing = container.querySelectorAll('.connector-row').length;
    if (count === existing) return;
    if (count < existing) {
      while (container.children.length > count) container.removeChild(container.lastChild);
    } else {
      for (var i = existing; i < count; i++) {
        var row = document.createElement('div');
        row.className = 'connector-row new-station-row';
        row.innerHTML = '<div class="form-group" style="flex:1;"><select class="conn-type">' + connectorOptions + '</select></div>' +
          '<div class="form-group" style="flex:1;"><select class="conn-level">' + levelOptions + '</select></div>' +
          '<div class="form-group" style="flex:1;"><input type="number" class="conn-power" placeholder="kW" min="0" /></div>';
        container.appendChild(row);
      }
    }
  }

  function getAdminConnectorData() {
    var rows = document.querySelectorAll('#admin-connector-rows .connector-row');
    var connectors = [];
    rows.forEach(function(row) {
      connectors.push({
        type: row.querySelector('.conn-type').value,
        level: row.querySelector('.conn-level').value,
        power: parseFloat(row.querySelector('.conn-power').value) || null
      });
    });
    return connectors.length > 0 ? connectors : [{ type: null, level: null, power: null }];
  }

  // === ADMIN DASHBOARD ===
  function showAdminDashboard() {
    var modal = document.getElementById('auth-modal');
    var title = document.getElementById('auth-title');
    var subtitle = document.getElementById('auth-subtitle');
    var form = document.getElementById('auth-form');
    var content = modal.querySelector('.modal-content');

    content.classList.add('modal-content-wide');
    title.textContent = 'Dashboard';
    subtitle.textContent = '';

    form.innerHTML =
      '<div class="admin-layout">' +
        '<div class="admin-sidebar">' +
          '<button class="admin-nav active" data-section="admin-resumen">Resumen</button>' +
          '<button class="admin-nav" data-section="admin-usuarios">Usuarios</button>' +
          '<button class="admin-nav" data-section="admin-reportes">Reportes</button>' +
          '<button class="admin-nav" data-section="admin-estaciones">Estaciones</button>' +
          '<button class="admin-nav" data-section="admin-resenas">Reseñas</button>' +
          '<button class="admin-nav" data-section="admin-fotos">Fotos</button>' +
        '</div>' +
        '<div class="admin-content" id="admin-content"></div>' +
      '</div>';
    form.classList.remove('hidden');
    modal.classList.remove('hidden');

    // Tab navigation
    form.querySelectorAll('.admin-nav').forEach(function(nav) {
      nav.addEventListener('click', function() {
        form.querySelectorAll('.admin-nav').forEach(function(n) { n.classList.remove('active'); });
        nav.classList.add('active');
        loadAdminSection(nav.dataset.section);
      });
    });

    loadAdminSection('admin-resumen');
  }

  async function loadAdminSection(section) {
    var content = document.getElementById('admin-content');
    if (!content) return;
    content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Cargando...</div>';

    if (section === 'admin-resumen') await renderAdminResumen(content);
    else if (section === 'admin-usuarios') await renderAdminUsuarios(content);
    else if (section === 'admin-reportes') await renderAdminReportes(content);
    else if (section === 'admin-estaciones') await renderAdminEstaciones(content);
    else if (section === 'admin-resenas') await renderAdminResenas(content);
    else if (section === 'admin-fotos') await renderAdminFotos(content);
  }

  async function renderAdminResumen(el) {
    var stats = await SupabaseApp.getDashboardStats();
    if (!stats) { el.innerHTML = '<p>Error al cargar stats</p>'; return; }
    var reports = await SupabaseApp.getAllReports('pending');
    var users = await SupabaseApp.getAllUsers();
    var recentUsers = users.slice(0, 5);

    el.innerHTML =
      '<div class="admin-section-title">Resumen</div>' +
      '<div class="admin-stats-grid">' +
        '<div class="admin-stat-card"><div class="admin-stat-number">' + (stats.user_profiles || 0) + '</div><div class="admin-stat-label">Usuarios</div></div>' +
        '<div class="admin-stat-card"><div class="admin-stat-number" style="color:var(--warning);">' + reports.length + '</div><div class="admin-stat-label">Reportes pendientes</div></div>' +
        '<div class="admin-stat-card"><div class="admin-stat-number">' + (stats.comments || 0) + '</div><div class="admin-stat-label">Reseñas</div></div>' +
        '<div class="admin-stat-card"><div class="admin-stat-number">' + (stats.photos || 0) + '</div><div class="admin-stat-label">Fotos</div></div>' +
      '</div>' +
      '<div class="admin-section-title" style="margin-top:20px;">Últimos usuarios</div>' +
      recentUsers.map(function(u) {
        return '<div class="admin-row"><div class="admin-row-info"><span class="admin-row-name">' + (u.display_name || u.email) + '</span><span class="admin-row-sub">' + u.email + '</span></div><span class="admin-role-badge ' + u.role + '">' + u.role + '</span></div>';
      }).join('');
  }

  async function renderAdminUsuarios(el) {
    var users = await SupabaseApp.getAllUsers();
    el.innerHTML =
      '<div class="admin-section-title">Usuarios (' + users.length + ')</div>' +
      '<input type="text" id="admin-user-search" placeholder="Buscar por email o nombre..." class="admin-search" />' +
      '<div id="admin-users-list">' +
      users.map(function(u) {
        return '<div class="admin-row" data-search="' + (u.email + ' ' + (u.display_name || '')).toLowerCase() + '">' +
          '<div class="admin-row-info"><span class="admin-row-name">' + (u.display_name || 'Sin nombre') + '</span><span class="admin-row-sub">' + u.email + '</span></div>' +
          '<select class="admin-role-select" data-user-id="' + u.id + '" data-current-role="' + u.role + '">' +
            '<option value="user"' + (u.role === 'user' ? ' selected' : '') + '>User</option>' +
            '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Admin</option>' +
          '</select>' +
        '</div>';
      }).join('') + '</div>';

    el.querySelector('#admin-user-search').addEventListener('input', function() {
      var q = this.value.toLowerCase();
      el.querySelectorAll('.admin-row').forEach(function(row) {
        row.style.display = row.dataset.search.includes(q) ? '' : 'none';
      });
    });

    el.querySelectorAll('.admin-role-select').forEach(function(sel) {
      sel.addEventListener('change', async function() {
        await SupabaseApp.updateUserRole(this.dataset.userId, this.value);
        showToast('Rol actualizado');
      });
    });
  }

  async function renderAdminReportes(el) {
    var reports = await SupabaseApp.getAllReports('all');
    el.innerHTML =
      '<div class="admin-section-title">Reportes (' + reports.length + ')</div>' +
      '<div class="admin-filters">' +
        '<button class="admin-filter active" data-filter="all">Todos</button>' +
        '<button class="admin-filter" data-filter="pending">Pendientes</button>' +
        '<button class="admin-filter" data-filter="resolved">Resueltos</button>' +
        '<button class="admin-filter" data-filter="dismissed">Descartados</button>' +
      '</div>' +
      '<div id="admin-reports-list">' +
      reports.map(function(r) {
        return renderReportItem(r);
      }).join('') + '</div>';

    el.querySelectorAll('.admin-filter').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        el.querySelectorAll('.admin-filter').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var filtered = await SupabaseApp.getAllReports(btn.dataset.filter);
        document.getElementById('admin-reports-list').innerHTML = filtered.map(renderReportItem).join('');
        attachReportActions();
      });
    });
    attachReportActions();
  }

  function renderReportItem(r) {
    var statusClass = r.status === 'resolved' ? 'resolved' : r.status === 'dismissed' ? 'dismissed' : 'pending';
    var typeLabel = r.report_type === 'new_station' ? 'Nueva estación' : r.report_type === 'damaged' ? 'Dañado' : 'Info incorrecta';
    var html = '<div class="admin-report-item">' +
      '<div class="admin-report-header"><span class="admin-report-type">' + typeLabel + '</span><span class="admin-report-status ' + statusClass + '">' + (r.status || 'pending') + '</span></div>';
    if (r.new_station_name) {
      html += '<div class="admin-report-desc"><b>' + r.new_station_name + '</b></div>';
      if (r.new_station_address) html += '<div class="admin-report-desc">' + r.new_station_address + '</div>';
      var details = [];
      if (r.new_station_connector) details.push(r.new_station_connector);
      if (r.station_level) details.push(r.station_level);
      if (r.station_power_kw) details.push(r.station_power_kw + ' kW');
      if (r.station_points) details.push(r.station_points + ' puntos');
      if (r.station_cost) details.push(r.station_cost);
      if (r.station_operator) details.push(r.station_operator);
      if (details.length) html += '<div class="admin-report-desc">' + details.join(' · ') + '</div>';
      if (r.new_station_lat && r.new_station_lng) html += '<div class="admin-report-desc" style="font-size:11px;">' + r.new_station_lat.toFixed(5) + ', ' + r.new_station_lng.toFixed(5) + '</div>';
    } else {
      html += '<div class="admin-report-desc">' + (r.description || 'Sin descripción') + '</div>';
    }
    html += '<div class="admin-report-actions">';
    if (r.report_type === 'new_station' && statusClass === 'pending') {
      html += '<button class="admin-action-btn approve" data-id="' + r.id + '">Aprobar</button>';
    }
    html += '<button class="admin-action-btn dismiss" data-id="' + r.id + '">Descartar</button>' +
      '</div></div>';
    return html;
  }

  function attachReportActions() {
    document.querySelectorAll('.admin-action-btn.approve').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var reportId = this.dataset.id;
        // Find the report data
        var reports = await SupabaseApp.getAllReports('all');
        var report = reports.find(function(r) { return r.id === reportId; });
        if (!report) { showToast('Error: reporte no encontrado'); return; }
        // Approve: create in approved_stations
        var station = await SupabaseApp.approveStation({
          name: report.new_station_name,
          address: report.new_station_address,
          lat: report.new_station_lat,
          lng: report.new_station_lng,
          connector: report.new_station_connector,
          level: report.station_level,
          power: report.station_power_kw,
          points: report.station_points,
          cost: report.station_cost,
          operator: report.station_operator
        });
        if (station) {
          await SupabaseApp.updateReportStatus(reportId, 'resolved');
          showToast('Estación aprobada y publicada en el mapa');
          ChargerData.clearCache && ChargerData.clearCache();
          // Force full reload after a brief delay to ensure DB write is committed
          setTimeout(function() {
            loadChargers().then(function() {
              ChargerMap.addChargerMarkers(filteredChargers);
            });
          }, 500);
          loadAdminSection('admin-reportes');
        } else {
          showToast('Error al aprobar estación');
        }
      });
    });
    document.querySelectorAll('.admin-action-btn.dismiss').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        await SupabaseApp.updateReportStatus(this.dataset.id, 'dismissed');
        showToast('Descartado');
        loadAdminSection('admin-reportes');
      });
    });
  }

  async function renderAdminResenas(el) {
    var comments = await SupabaseApp.getAllCommentsAdmin(50, 0);
    el.innerHTML =
      '<div class="admin-section-title">Reseñas (' + comments.length + ')</div>' +
      comments.map(function(c) {
        var stars = c.rating ? '★'.repeat(c.rating) + '☆'.repeat(5 - c.rating) : '';
        var date = c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX') : '';
        return '<div class="admin-report-item">' +
          '<div class="admin-report-header"><span class="admin-row-name">' + (c.user_name || 'Anónimo') + '</span><span class="admin-report-sub">' + c.charger_id + '</span></div>' +
          '<div class="admin-stars">' + stars + '</div>' +
          '<div class="admin-report-desc">' + (c.comment || '') + '</div>' +
          '<div class="admin-report-actions"><span class="admin-report-date">' + date + '</span>' +
          '<button class="admin-action-btn delete" data-id="' + c.id + '" data-type="comment">Eliminar</button></div></div>';
      }).join('') || '<p style="color:var(--text-muted);padding:20px;">No hay reseñas</p>';

    el.querySelectorAll('.admin-action-btn.delete').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        await SupabaseApp.deleteAnyComment(this.dataset.id);
        showToast('Reseña eliminada');
        loadAdminSection('admin-resenas');
      });
    });
  }

  async function renderAdminFotos(el) {
    var photos = await SupabaseApp.getAllPhotosAdmin(50, 0);
    el.innerHTML =
      '<div class="admin-section-title">Fotos (' + photos.length + ')</div>' +
      '<div class="admin-photo-grid">' +
      photos.map(function(p) {
        var date = p.created_at ? new Date(p.created_at).toLocaleDateString('es-MX') : '';
        return '<div class="admin-photo-item">' +
          '<img src="' + p.url + '" loading="lazy" onclick="this.closest(\'.admin-photo-item\').querySelector(\'.admin-photo-overlay\').classList.toggle(\'hidden\')">' +
          '<div class="admin-photo-overlay hidden"><span>' + (p.user_id ? p.user_id.substring(0, 8) : '') + ' · ' + date + '</span>' +
          '<button class="admin-action-btn delete" data-id="' + p.id + '">Eliminar</button></div></div>';
      }).join('') + '</div>' || '<p style="color:var(--text-muted);padding:20px;">No hay fotos</p>';

    el.querySelectorAll('.admin-action-btn.delete').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        await SupabaseApp.deleteAnyPhoto(this.dataset.id);
        showToast('Foto eliminada');
        loadAdminSection('admin-fotos');
      });
    });
  }

  async function renderAdminEstaciones(el) {
    var stations = await SupabaseApp.getApprovedStations();
    el.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div class="admin-section-title" style="margin:0;">Estaciones (' + stations.length + ')</div>' +
        '<button class="btn-primary" id="btn-admin-add-station" style="padding:6px 14px;font-size:12px;">+ Crear estación</button>' +
      '</div>' +
      stations.map(function(s) {
        var details = [];
        if (s.connector) details.push(s.connector);
        if (s.level) details.push(s.level);
        if (s.power_kw) details.push(s.power_kw + ' kW');
        if (s.cost) details.push(s.cost);
        var badge = s.charger_id ? '<span class="admin-report-status" style="background:rgba(59,130,246,0.15);color:#3b82f6;">CFE editada</span>' : '<span class="admin-report-status resolved">Aprobada</span>';
        return '<div class="admin-report-item">' +
          '<div class="admin-report-header"><span class="admin-row-name">' + s.name + '</span>' + badge + '</div>' +
          '<div class="admin-report-desc">' + (s.address || '') + '</div>' +
          '<div class="admin-report-desc">' + details.join(' · ') + '</div>' +
          '<div class="admin-report-actions">' +
            '<button class="admin-action-btn edit-station" data-id="' + s.id + '">Editar</button>' +
            '<button class="admin-action-btn delete-station" data-id="' + s.id + '">Eliminar</button>' +
          '</div></div>';
      }).join('') || '<p style="color:var(--text-muted);padding:20px;">No hay estaciones aprobadas</p>';

    el.querySelectorAll('.admin-action-btn.delete-station').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        if (!await customConfirm('¿Eliminar esta estación del mapa?')) return;
        await SupabaseApp.deleteStation(this.dataset.id);
        showToast('Estación eliminada');
        loadAdminSection('admin-estaciones');
      });
    });

    el.querySelectorAll('.admin-action-btn.edit-station').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var station = stations.find(function(s) { return s.id === btn.dataset.id; });
        if (!station) return;
        var formHtml = '<div class="admin-section-title">Editar estación</div>' +
          '<div id="admin-edit-map" style="width:100%;height:200px;border-radius:var(--radius-sm);margin-bottom:12px;cursor:crosshair;"></div>' +
          '<p style="font-size:11px;color:var(--text-muted);margin-bottom:12px;text-align:center;">Haz clic para mover el pin</p>' +
          '<div class="form-group"><label>Nombre</label><input type="text" id="edit-st-name" value="' + (station.name || '') + '" /></div>' +
          '<div class="form-group"><label>Dirección</label><input type="text" id="edit-st-address" value="' + (station.address || '') + '" /></div>' +
          '<div class="new-station-row">' +
            '<div class="form-group" style="flex:1;"><label>Puntos</label><input type="number" id="edit-st-points" value="' + (station.points || 1) + '" /></div>' +
            '<div class="form-group" style="flex:1;"><label>Costo</label><select id="edit-st-cost"><option value="">Seleccionar</option><option value="Gratis"' + (station.cost === 'Gratis' ? ' selected' : '') + '>Gratis</option><option value="De pago"' + (station.cost === 'De pago' ? ' selected' : '') + '>De pago</option><option value="Desconocido"' + (station.cost === 'Desconocido' ? ' selected' : '') + '>No sé</option></select></div>' +
          '</div>' +
          '<div class="form-group"><label>Tipo de conector por punto</label><div id="admin-edit-connector-rows"></div></div>' +
          '<div class="form-group"><label>Operador</label><input type="text" id="edit-st-operator" value="' + (station.operator || '') + '" /></div>' +
          '<div class="form-group"><label>Estado</label><select id="edit-st-status">' +
            '<option value="50"' + ((station.status_id || 50) === 50 ? ' selected' : '') + '>Operativo</option>' +
            '<option value="20"' + (station.status_id === 20 ? ' selected' : '') + '>No operativo</option>' +
            '<option value="0"' + (station.status_id === 0 ? ' selected' : '') + '>Desconocido</option>' +
          '</select></div>' +
          '<input type="hidden" id="edit-st-lat" value="' + (station.lat || '') + '" />' +
          '<input type="hidden" id="edit-st-lng" value="' + (station.lng || '') + '" />' +
          '<button class="btn-primary" id="btn-save-station" style="width:100%;margin-top:8px;">Guardar cambios</button>' +
          '<button class="btn-primary" id="btn-cancel-edit" style="width:100%;margin-top:8px;background:var(--surface);color:var(--text);border:1px solid var(--border);">Cancelar</button>';
        el.innerHTML = formHtml;

        // Init mini map
        var adminEditMap = L.map('admin-edit-map', { zoomControl: false }).setView([station.lat || 27.49, station.lng || -109.94], 15);
        var isDrk = currentTheme === 'dark';
        L.tileLayer(isDrk ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '' }).addTo(adminEditMap);
        var adminEditMarker = L.marker([station.lat || 27.49, station.lng || -109.94], { draggable: true, icon: createStationIcon() }).addTo(adminEditMap);
        adminEditMarker.on('dragend', function() {
          var pos = adminEditMarker.getLatLng();
          document.getElementById('edit-st-lat').value = pos.lat;
          document.getElementById('edit-st-lng').value = pos.lng;
        });
        adminEditMap.on('click', function(e) {
          adminEditMarker.setLatLng(e.latlng);
          document.getElementById('edit-st-lat').value = e.latlng.lat;
          document.getElementById('edit-st-lng').value = e.latlng.lng;
        });
        setTimeout(function() { adminEditMap.invalidateSize(); }, 200);

        // Generate connector rows for dashboard edit
        var adminConnContainer = document.getElementById('admin-edit-connector-rows');
        var editPoints = station.points || 1;
        var parsedConns = [];
        try { parsedConns = JSON.parse(station.connector || '[]'); } catch(e) { parsedConns = station.connector ? [station.connector] : []; }
        var parsedLvls = [];
        try { parsedLvls = JSON.parse(station.level || '[]'); } catch(e) { parsedLvls = station.level ? [station.level] : []; }
        if (!Array.isArray(parsedConns)) parsedConns = [parsedConns];
        if (!Array.isArray(parsedLvls)) parsedLvls = [parsedLvls];
        for (var ci = 0; ci < editPoints; ci++) {
          var row = document.createElement('div');
          row.className = 'connector-row new-station-row';
          row.innerHTML = '<div class="form-group" style="flex:1;"><select class="conn-type">' + connectorOptions + '</select></div>' +
            '<div class="form-group" style="flex:1;"><select class="conn-level">' + levelOptions + '</select></div>';
          adminConnContainer.appendChild(row);
          if (parsedConns[ci]) row.querySelector('.conn-type').value = parsedConns[ci];
          if (parsedLvls[ci]) row.querySelector('.conn-level').value = parsedLvls[ci];
        }
        document.getElementById('edit-st-points').addEventListener('input', function() {
          var nc = parseInt(this.value) || 1;
          var cur = adminConnContainer.querySelectorAll('.connector-row').length;
          if (nc > cur) { for (var k = cur; k < nc; k++) { var r = document.createElement('div'); r.className = 'connector-row new-station-row'; r.innerHTML = '<div class="form-group" style="flex:1;"><select class="conn-type">' + connectorOptions + '</select></div><div class="form-group" style="flex:1;"><select class="conn-level">' + levelOptions + '</select></div>'; adminConnContainer.appendChild(r); } }
          else if (nc < cur) { while (adminConnContainer.children.length > nc) adminConnContainer.removeChild(adminConnContainer.lastChild); }
        });

        document.getElementById('btn-cancel-edit').addEventListener('click', function() { loadAdminSection('admin-estaciones'); });
        document.getElementById('btn-save-station').addEventListener('click', async function() {
          var editConns = [];
          adminConnContainer.querySelectorAll('.connector-row').forEach(function(r) {
            editConns.push({ type: r.querySelector('.conn-type').value, level: r.querySelector('.conn-level').value, power: parseFloat(r.querySelector('.conn-power').value) || null });
          });
          var editConnJson = editConns.length > 1 ? JSON.stringify(editConns.map(function(c) { return c.type; })) : (editConns[0] ? editConns[0].type : null);
          var editLvlJson = editConns.length > 1 ? JSON.stringify(editConns.map(function(c) { return c.level; })) : (editConns[0] ? editConns[0].level : null);
          var editPwJson = editConns.length > 1 ? JSON.stringify(editConns.map(function(c) { return c.power; })) : (editConns[0] && editConns[0].power ? editConns[0].power : null);
          await SupabaseApp.updateStation(station.id, {
            name: document.getElementById('edit-st-name').value,
            address: document.getElementById('edit-st-address').value,
            connector: editConnJson || null,
            level: editLvlJson || null,
            power_kw: editPwJson,
            points: parseInt(document.getElementById('edit-st-points').value) || null,
            cost: document.getElementById('edit-st-cost').value || null,
            operator: document.getElementById('edit-st-operator').value || null,
            lat: parseFloat(document.getElementById('edit-st-lat').value) || station.lat,
            lng: parseFloat(document.getElementById('edit-st-lng').value) || station.lng,
            status_id: parseInt(document.getElementById('edit-st-status').value) || 50
          });
          showToast('Estación actualizada');
          ChargerData.clearCache && ChargerData.clearCache();
          loadChargers();
          loadAdminSection('admin-estaciones');
        });
      });
    });

    // Create new station button
    var addBtn = document.getElementById('btn-admin-add-station');
    if (addBtn) {
      addBtn.addEventListener('click', function() {
        var connOpts = '<option value="SAE J1772">SAE J1772 (Nivel 2)</option><option value="CCS1">CCS1 (DC Rápida)</option><option value="CCS2">CCS2 (DC Rápida)</option><option value="CHAdeMO">CHAdeMO (DC Rápida)</option><option value="Tesla">Tesla (SC / NEMA 14-50)</option><option value="GB/T">GB/T</option><option value="Otro">Otro</option>';
        var lvlOpts = '<option value="">Nivel</option><option value="Nivel 1">Nivel 1 (120V)</option><option value="Nivel 2">Nivel 2 (240V)</option><option value="DC Rápida">DC Rápida</option>';

        var formHtml = '<div class="admin-section-title">Crear nueva estación</div>' +
          '<div style="position:relative;">' +
            '<div id="admin-create-map" style="width:100%;height:200px;border-radius:var(--radius-sm);margin-bottom:4px;cursor:crosshair;"></div>' +
            '<div id="admin-create-search" style="position:absolute;top:8px;left:8px;right:8px;z-index:1000;"></div>' +
          '</div>' +
          '<p style="font-size:11px;color:var(--text-muted);margin-bottom:12px;text-align:center;">Haz clic en el mapa o busca una dirección</p>' +
          '<div class="form-group"><label>Nombre *</label><input type="text" id="new-st-name" placeholder="Nombre de la estación" /></div>' +
          '<div class="form-group"><label>Dirección</label><input type="text" id="new-st-address" placeholder="Dirección completa" /></div>' +
          '<div class="new-station-row">' +
            '<div class="form-group" style="flex:1;"><label>Puntos</label><input type="number" id="new-st-points" min="1" max="20" value="1" /></div>' +
            '<div class="form-group" style="flex:1;"><label>Costo</label><select id="new-st-cost"><option value="Gratis">Gratis</option><option value="De pago">De pago</option><option value="Desconocido">No sé</option></select></div>' +
          '</div>' +
          '<div class="form-group"><label>Tipo de conector por punto</label><div id="admin-connector-rows"></div></div>' +
          '<div class="form-group"><label>Operador</label><input type="text" id="new-st-operator" placeholder="CFE, Tesla..." /></div>' +
          '<div class="form-group"><label>Estado</label><select id="new-st-status"><option value="50">Operativo</option><option value="20">No operativo</option><option value="0">Desconocido</option></select></div>' +
          '<input type="hidden" id="new-st-lat" value="" /><input type="hidden" id="new-st-lng" value="" />' +
          '<button class="btn-primary" id="btn-save-new-station" style="width:100%;margin-top:8px;">Crear estación</button>' +
          '<button class="btn-primary" id="btn-cancel-create" style="width:100%;margin-top:8px;background:var(--surface);color:var(--text);border:1px solid var(--border);">Cancelar</button>';
        el.innerHTML = formHtml;

        // Init map
        var center = userLat || 27.49;
        var centerLng = userLng || -109.94;
        var adminMap = L.map('admin-create-map', { zoomControl: false }).setView([center, centerLng], 15);
        var isDrk = currentTheme === 'dark';
        L.tileLayer(isDrk ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '' }).addTo(adminMap);
        var adminMarker = L.marker([center, centerLng], { draggable: true, icon: createStationIcon() }).addTo(adminMap);
        document.getElementById('new-st-lat').value = center;
        document.getElementById('new-st-lng').value = centerLng;
        adminMarker.on('dragend', function() {
          var pos = adminMarker.getLatLng();
          document.getElementById('new-st-lat').value = pos.lat;
          document.getElementById('new-st-lng').value = pos.lng;
          reverseGeocode(pos.lat, pos.lng, 'new-st-address');
        });
        adminMap.on('click', function(e) {
          adminMarker.setLatLng(e.latlng);
          document.getElementById('new-st-lat').value = e.latlng.lat;
          document.getElementById('new-st-lng').value = e.latlng.lng;
          reverseGeocode(e.latlng.lat, e.latlng.lng, 'new-st-address');
        });

        // Search bar
        var searchContainer = document.getElementById('admin-create-search');
        var searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Buscar dirección...';
        searchInput.style.cssText = 'width:100%;padding:8px 12px;border:none;border-radius:var(--radius-sm);font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.3);background:var(--surface);color:var(--text);font-family:inherit;';
        searchContainer.appendChild(searchInput);
        var searchSuggestions = document.createElement('div');
        searchSuggestions.style.cssText = 'position:absolute;top:38px;left:0;right:0;background:var(--surface);border-radius:0 0 var(--radius-sm) var(--radius-sm);box-shadow:0 4px 12px rgba(0,0,0,0.3);display:none;z-index:1001;max-height:200px;overflow-y:auto;';
        searchContainer.appendChild(searchSuggestions);
        var searchTimeout;
        searchInput.addEventListener('input', function() {
          clearTimeout(searchTimeout);
          var q = searchInput.value.trim();
          if (q.length < 3) { searchSuggestions.style.display = 'none'; return; }
          searchTimeout = setTimeout(function() {
            fetch('/api/places?type=autocomplete&q=' + encodeURIComponent(q))
              .then(function(r) { return r.json(); })
              .then(function(data) {
                if (data.status === 'OK' && data.predictions && data.predictions.length > 0) {
                  searchSuggestions.innerHTML = data.predictions.map(function(p, i) {
                    return '<div class="suggestion-item" data-index="' + i + '" style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);color:var(--text);">' + p.description + '</div>';
                  }).join('');
                  searchSuggestions.style.display = 'block';
                  searchSuggestions.querySelectorAll('.suggestion-item').forEach(function(item) {
                    item.addEventListener('click', function() {
                      var pred = data.predictions[parseInt(this.dataset.index)];
                      searchInput.value = pred.description;
                      searchSuggestions.style.display = 'none';
                      fetch('/api/places?type=details&place_id=' + pred.place_id)
                        .then(function(r2) { return r2.json(); })
                        .then(function(details) {
                          if (details.status === 'OK' && details.result && details.result.geometry) {
                            var loc = details.result.geometry.location;
                            adminMarker.setLatLng([loc.lat, loc.lng]);
                            adminMap.setView([loc.lat, loc.lng], 16);
                            document.getElementById('new-st-lat').value = loc.lat;
                            document.getElementById('new-st-lng').value = loc.lng;
                            document.getElementById('new-st-address').value = details.result.formatted_address || pred.description;
                          }
                        }).catch(function() {});
                    });
                  });
                } else { searchSuggestions.style.display = 'none'; }
              }).catch(function() { searchSuggestions.style.display = 'none'; });
          }, 300);
        });
        document.addEventListener('click', function(e) {
          if (!searchContainer.contains(e.target)) searchSuggestions.style.display = 'none';
        });

        setTimeout(function() { adminMap.invalidateSize(); }, 200);

        // Connector rows
        generateAdminConnectorRows(1);
        document.getElementById('new-st-points').addEventListener('input', function() {
          generateAdminConnectorRows(parseInt(this.value) || 1);
        });

        document.getElementById('btn-cancel-create').addEventListener('click', function() { loadAdminSection('admin-estaciones'); });
        document.getElementById('btn-save-new-station').addEventListener('click', async function() {
          var name = document.getElementById('new-st-name').value.trim();
          if (!name) { showToast('El nombre es requerido'); return; }
          var lat = parseFloat(document.getElementById('new-st-lat').value);
          var lng = parseFloat(document.getElementById('new-st-lng').value);
          if (!lat || !lng) { showToast('Coloca el pin en el mapa'); return; }

          var connectors = getAdminConnectorData();
          var mainConn = connectors.length > 0 ? connectors[0].type : null;
          var mainLvl = connectors.length > 0 ? connectors[0].level : null;
          var connJson = connectors.length > 1 ? JSON.stringify(connectors.map(function(c) { return c.type; })) : mainConn;
          var lvlJson = connectors.length > 1 ? JSON.stringify(connectors.map(function(c) { return c.level; })) : mainLvl;
          var powerJson = connectors.length > 1 ? JSON.stringify(connectors.map(function(c) { return c.power; })) : (connectors[0] && connectors[0].power ? connectors[0].power : null);

          var result = await SupabaseApp.approveStation({
            name: name,
            address: document.getElementById('new-st-address').value.trim(),
            lat: lat, lng: lng,
            connector: connJson,
            level: lvlJson,
            power: powerJson,
            points: parseInt(document.getElementById('new-st-points').value) || 1,
            cost: document.getElementById('new-st-cost').value || null,
            operator: document.getElementById('new-st-operator').value.trim() || null,
            status_id: parseInt(document.getElementById('new-st-status').value) || 50
          });
          if (result) {
            showToast('Estación creada y publicada en el mapa');
            ChargerData.clearCache && ChargerData.clearCache();
            loadChargers();
            loadAdminSection('admin-estaciones');
          } else {
            showToast('Error al crear estación');
          }
        });
      });
    }
  }

  // === LIGHTBOX ===
  function openLightbox(src) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    var img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'max-width:90%;max-height:90%;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.5);';
    overlay.appendChild(img);
    overlay.addEventListener('click', function() { overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function updatePasswordStrength(pw) {
    var bar = document.getElementById('strength-fill');
    var text = document.getElementById('strength-text');
    var container = document.getElementById('password-strength');
    if (!pw) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    var score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    var levels = [
      { width: '20%', color: '#ef4444', label: 'Muy débil' },
      { width: '40%', color: '#f97316', label: 'Débil' },
      { width: '60%', color: '#f59e0b', label: 'Regular' },
      { width: '80%', color: '#22c55e', label: 'Buena' },
      { width: '100%', color: '#16a34a', label: 'Muy fuerte' }
    ];
    var level = levels[Math.min(score, 4)];
    bar.style.width = level.width;
    bar.style.background = level.color;
    text.textContent = level.label;
    text.style.color = level.color;
  }

  async function handleLogin(e) {
    e.preventDefault();
    var emailEl = document.getElementById('auth-email');
    var passEl = document.getElementById('auth-password');
    if (!emailEl || !passEl) return;
    var email = emailEl.value;
    var password = passEl.value;
    var errorEl = document.getElementById('auth-error');
    var submitBtn = document.getElementById('auth-submit');
    if (!errorEl || !submitBtn) return;
    errorEl.classList.add('hidden');
    submitBtn.textContent = 'Cargando...';
    submitBtn.disabled = true;
    try {
      var result = await SupabaseApp.signIn(email, password);
      if (result && result.user) {
        hideAuthModal();
        showToast('Sesión iniciada correctamente');
        // Save display_name to profile if available
        var name = localStorage.getItem('em-pending-name');
        if (name && result.user.id) {
          SupabaseApp.updateDisplayName(result.user.id, name);
          localStorage.removeItem('em-pending-name');
        }
        loadUserFavorites();
        checkAdminHeader();
      } else {
        errorEl.textContent = 'Credenciales incorrectas. Intenta de nuevo.';
        errorEl.classList.remove('hidden');
      }
    } catch (err) {
      errorEl.textContent = err.message || 'Error al iniciar sesión';
      errorEl.classList.remove('hidden');
    }
    submitBtn.textContent = 'Iniciar sesión';
    submitBtn.disabled = false;
  }

  async function handleSignup(e) {
    e.preventDefault();
    var name = document.getElementById('signup-name').value.trim();
    var email = document.getElementById('signup-email').value;
    var password = document.getElementById('signup-password').value;
    var confirm = document.getElementById('signup-confirm').value;
    var errorEl = document.getElementById('signup-error');
    var submitBtn = document.getElementById('signup-submit');
    errorEl.classList.add('hidden');
    if (password !== confirm) { errorEl.textContent = 'Las contraseñas no coinciden'; errorEl.classList.remove('hidden'); return; }
    if (password.length < 6) { errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres'; errorEl.classList.remove('hidden'); return; }
    submitBtn.textContent = 'Creando cuenta...';
    submitBtn.disabled = true;
    try {
      var result = await SupabaseApp.signUp(email, password, name);
      if (result && result.user) {
        // Store name for post-login save
        if (name) localStorage.setItem('em-pending-name', name);
        hideAuthModal();
        showToast('Cuenta creada. Revisa tu correo para confirmar.');
      } else {
        errorEl.textContent = 'Error al crear cuenta. Es posible que el correo ya esté registrado.';
        errorEl.classList.remove('hidden');
      }
    } catch (err) {
      errorEl.textContent = err.message || 'Error al crear cuenta';
      errorEl.classList.remove('hidden');
    }
    submitBtn.textContent = 'Crear cuenta';
    submitBtn.disabled = false;
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    var email = document.getElementById('forgot-email').value;
    var errorEl = document.getElementById('forgot-error');
    var submitBtn = document.getElementById('forgot-submit');
    errorEl.classList.add('hidden');
    submitBtn.textContent = 'Enviando...';
    submitBtn.disabled = true;
    try {
      await SupabaseApp.getClient().auth.resetPasswordForEmail(email, { redirectTo: 'https://electromap.josue.work' });
      errorEl.textContent = 'Revisa tu correo para restablecer la contraseña';
      errorEl.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
      errorEl.style.borderColor = 'rgba(34, 197, 94, 0.3)';
      errorEl.style.color = '#22c55e';
      errorEl.classList.remove('hidden');
    } catch (err) {
      errorEl.textContent = err.message || 'Error al enviar correo';
      errorEl.classList.remove('hidden');
    }
    submitBtn.textContent = 'Enviar enlace';
    submitBtn.disabled = false;
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    var password = document.getElementById('reset-password').value;
    var confirm = document.getElementById('reset-confirm').value;
    var errorEl = document.getElementById('reset-error');
    var submitBtn = document.getElementById('reset-submit');
    errorEl.classList.add('hidden');
    if (password !== confirm) { errorEl.textContent = 'Las contraseñas no coinciden'; errorEl.classList.remove('hidden'); return; }
    if (password.length < 6) { errorEl.textContent = 'Mínimo 6 caracteres'; errorEl.classList.remove('hidden'); return; }
    submitBtn.textContent = 'Guardando...';
    submitBtn.disabled = true;
    try {
      var client = SupabaseApp.getClient();
      var { error } = await client.auth.updateUser({ password: password });
      if (error) {
        errorEl.textContent = error.message || 'Error al actualizar contraseña';
        errorEl.classList.remove('hidden');
      } else {
        showToast('Contraseña actualizada correctamente');
        window.location.hash = '';
        hideAuthModal();
        window.location.reload();
      }
    } catch (err) {
      errorEl.textContent = err.message || 'Error inesperado';
      errorEl.classList.remove('hidden');
    }
    submitBtn.textContent = 'Guardar contraseña';
    submitBtn.disabled = false;
  }

  function checkResetToken() {
    document.addEventListener('auth:password-recovery', function() {
      showAuthView('reset');
      document.getElementById('auth-title').textContent = 'Nueva contraseña';
      document.getElementById('auth-subtitle').textContent = 'Elige una contraseña segura';
      document.getElementById('auth-modal').classList.remove('hidden');
      window.location.hash = '';
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();