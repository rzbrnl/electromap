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
    SupabaseApp.init();
    checkResetToken();
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

    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') { hideSidebar(); hideFilters(); hideAuthModal(); document.getElementById('report-modal').classList.add('hidden'); document.getElementById('new-station-modal').classList.add('hidden'); } });
  }

  // === AUTH VIEWS ===
  function showAuthView(view) {
    document.getElementById('auth-form').classList.add('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('forgot-form').classList.add('hidden');
    document.getElementById('reset-form').classList.add('hidden');
    document.getElementById('auth-error').classList.add('hidden');
    document.getElementById('signup-error').classList.add('hidden');
    document.getElementById('forgot-error').classList.add('hidden');
    document.getElementById('reset-error').classList.add('hidden');
    if (view === 'login') {
      document.getElementById('auth-form').classList.remove('hidden');
      document.getElementById('auth-title').textContent = 'Iniciar sesión';
      document.getElementById('auth-subtitle').textContent = 'Bienvenido de nuevo a ElectroMap';
    } else if (view === 'signup') {
      document.getElementById('signup-form').classList.remove('hidden');
      document.getElementById('auth-title').textContent = 'Crear cuenta';
      document.getElementById('auth-subtitle').textContent = 'Únete a la comunidad ElectroMap';
    } else if (view === 'forgot') {
      document.getElementById('forgot-form').classList.remove('hidden');
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
    document.getElementById('auth-error').classList.add('hidden');
    document.getElementById('signup-error').classList.add('hidden');
    document.getElementById('forgot-error').classList.add('hidden');
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
    });

    stationPickerMap.on('click', function(e) {
      stationMarker.setLatLng(e.latlng);
      document.getElementById('station-lat').value = e.latlng.lat;
      document.getElementById('station-lng').value = e.latlng.lng;
    });

    setTimeout(function() { stationPickerMap.invalidateSize(); }, 200);
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

    var descParts = [];
    var connector = document.getElementById('station-connector').value;
    var level = document.getElementById('station-level').value;
    var power = document.getElementById('station-power').value;
    var points = document.getElementById('station-points').value;
    var cost = document.getElementById('station-cost').value;
    var operator = document.getElementById('station-operator').value.trim();
    var extraDesc = document.getElementById('station-description').value.trim();

    if (connector) descParts.push('Conector: ' + connector);
    if (level) descParts.push('Nivel: ' + level);
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
      newStationConnector: connector,
      newStationLat: parseFloat(document.getElementById('station-lat').value) || null,
      newStationLng: parseFloat(document.getElementById('station-lng').value) || null
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
    var initial = user.email ? user.email[0].toUpperCase() : 'U';

    title.textContent = 'Mi perfil';
    form.innerHTML =
      '<div class="profile-avatar-upload" id="avatar-upload-area">' +
        '<div class="avatar-circle" id="profile-avatar">' + initial + '</div>' +
        '<div class="avatar-overlay"><svg class="icon" width="12" height="12"><use href="#icon-camera"></use></svg></div>' +
        '<input type="file" id="avatar-file-input" accept="image/*" style="display:none;">' +
      '</div>' +
      '<div style="text-align:center;">' +
        '<div class="profile-name" style="color:var(--text);font-size:16px;font-weight:600;margin-bottom:2px;">' + (user.email || 'Usuario') + '</div>' +
        '<div style="color:var(--text-muted);font-size:12px;">Miembro de ElectroMap</div>' +
      '</div>' +
      '<div class="profile-tabs">' +
        '<button class="profile-tab active" data-tab="tab-cuenta">Cuenta</button>' +
        '<button class="profile-tab" data-tab="tab-stats">Estadísticas</button>' +
        '<button class="profile-tab" data-tab="tab-fotos">Fotos</button>' +
      '</div>' +
      '<div class="profile-tab-content" id="tab-cuenta">' +
        '<button class="btn-primary" id="btn-save-avatar" style="background:var(--accent);width:100%;display:none;margin-bottom:12px;">Guardar foto</button>' +
        '<button class="btn-primary" id="btn-logout" style="background:var(--danger);width:100%;">Cerrar sesión</button>' +
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
      if (profile && profile.display_name) {
        var nameEl = document.querySelector('#auth-form .profile-name');
        if (nameEl) nameEl.textContent = profile.display_name;
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
    var email = document.getElementById('auth-email').value;
    var password = document.getElementById('auth-password').value;
    var errorEl = document.getElementById('auth-error');
    var submitBtn = document.getElementById('auth-submit');
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