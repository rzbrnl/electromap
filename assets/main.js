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
    document.getElementById('forgot-password').addEventListener('click', async function(e) {
      e.preventDefault();
      var email = document.getElementById('auth-email').value;
      if (!email) {
        document.getElementById('auth-error').textContent = 'Ingresa tu correo primero';
        document.getElementById('auth-error').classList.remove('hidden');
        return;
      }
      try {
        await SupabaseApp.getClient().auth.resetPasswordForEmail(email, {
          redirectTo: 'https://electromap.josue.work'
        });
        document.getElementById('auth-error').textContent = 'Revisa tu correo para restablecer la contraseña';
        document.getElementById('auth-error').style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
        document.getElementById('auth-error').style.borderColor = 'rgba(34, 197, 94, 0.3)';
        document.getElementById('auth-error').style.color = '#22c55e';
        document.getElementById('auth-error').classList.remove('hidden');
      } catch (err) {
        document.getElementById('auth-error').textContent = 'Error: ' + (err.message || 'Intenta de nuevo');
        document.getElementById('auth-error').classList.remove('hidden');
      }
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
    document.getElementById('report-type').addEventListener('change', function() {
      document.getElementById('new-station-fields').style.display = this.value === 'new_station' ? 'block' : 'none';
    });

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

    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') { hideSidebar(); hideFilters(); hideAuthModal(); document.getElementById('report-modal').classList.add('hidden'); } });
  }

  var isLoginMode = true;

  async function toggleAuthModal() {
    try {
      var result = await SupabaseApp.getUser();
      if (result && result.data && result.data.user && result.data.user.id) {
        showProfileModal(result.data.user);
      } else {
        document.getElementById('auth-modal').classList.remove('hidden');
      }
    } catch (e) {
      document.getElementById('auth-modal').classList.remove('hidden');
    }
  }

  function hideAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
    document.getElementById('auth-error').classList.add('hidden');
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
      return '<div class="comment-item"><div class="comment-header"><span class="comment-author">' + (c.user_name || 'Anónimo') + '</span><span class="comment-stars">' + stars + '</span></div><div class="comment-text">' + (c.comment || '') + '</div><div class="comment-date">' + date + '</div></div>';
    }).join('');
  }

  async function submitComment() {
    var user = await getCurrentUser();
    if (!user) { showToast('Inicia sesión para comentar'); return; }
    if (!currentCharger) return;

    var text = document.getElementById('comment-text').value.trim();
    if (!text && !selectedRating) { showToast('Escribe un comentario o selecciona una calificación'); return; }

    var userName = user.email ? user.email.split('@')[0] : 'Anónimo';
    var result = await SupabaseApp.addComment(currentCharger.id, userName, selectedRating || null, text);
    if (result) {
      document.getElementById('comment-text').value = '';
      selectedRating = 0;
      updateStarRating(0);
      loadComments(currentCharger);
      showToast('Comentario enviado');
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
    grid.innerHTML = photos.map(function(p) {
      return '<img src="' + p.url + '" alt="' + (p.caption || 'Foto') + '" loading="lazy" onerror="this.style.display=\'none\'">';
    }).join('');
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
      var result = await SupabaseApp.addPhoto(currentCharger.id, dataUrl, '');
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

    if (type === 'new_station') {
      data.newStationName = document.getElementById('report-station-name').value.trim();
      data.newStationAddress = document.getElementById('report-station-address').value.trim();
      data.newStationConnector = document.getElementById('report-station-connector').value.trim();
      if (userLat) data.newStationLat = userLat;
      if (userLng) data.newStationLng = userLng;
    }

    var result = await SupabaseApp.addReport(data);
    if (result) {
      document.getElementById('report-modal').classList.add('hidden');
      document.getElementById('report-form').reset();
      showToast('Reporte enviado. Gracias.');
    } else {
      showToast('Error al enviar reporte');
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
        '<div style="color:var(--text);font-size:16px;font-weight:600;margin-bottom:4px;">' + (user.email || 'Usuario') + '</div>' +
        '<div style="color:var(--text-muted);font-size:13px;">Miembro de ElectroMap</div>' +
      '</div>' +
      '<div class="profile-section">' +
        '<div class="profile-section-title">Estadísticas</div>' +
        '<div class="profile-stat-row"><span class="profile-stat-label">Favoritos</span><span class="profile-stat-value" id="profile-fav-count">0</span></div>' +
        '<div class="profile-stat-row"><span class="profile-stat-label">Reseñas</span><span class="profile-stat-value" id="profile-comment-count">0</span></div>' +
      '</div>' +
      '<button class="btn-primary" id="btn-logout" style="background:var(--danger);margin-top:16px;width:100%;">Cerrar sesión</button>';
    modal.classList.remove('hidden');

    // Load profile data
    SupabaseApp.getFavorites(user.id).then(function(favs) {
      var el = document.getElementById('profile-fav-count');
      if (el) el.textContent = favs.length;
    });

    // Avatar upload
    document.getElementById('avatar-upload-area').addEventListener('click', function() {
      document.getElementById('avatar-file-input').click();
    });

    document.getElementById('avatar-file-input').addEventListener('change', async function(e) {
      var file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { showToast('La imagen no puede superar 2MB'); return; }

      var reader = new FileReader();
      reader.onload = function(ev) {
        var avatarEl = document.getElementById('profile-avatar');
        avatarEl.innerHTML = '<img src="' + ev.target.result + '" alt="Avatar">';
      };
      reader.readAsDataURL(file);
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', async function() {
      await SupabaseApp.signOut();
      modal.classList.add('hidden');
      showToast('Sesión cerrada');
      setTimeout(function() { window.location.reload(); }, 1000);
    });
  }

  function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').textContent = isLoginMode ? 'Iniciar sesión' : 'Crear cuenta';
    document.getElementById('auth-submit').textContent = isLoginMode ? 'Iniciar sesión' : 'Crear cuenta';
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
        var loginResult = await SupabaseApp.signIn(email, password);
        if (loginResult && loginResult.user) {
          hideAuthModal();
          showToast('Sesión iniciada correctamente');
          loadUserFavorites();
        } else {
          errorEl.textContent = 'Error al iniciar sesión. Verifica tus credenciales.';
          errorEl.classList.remove('hidden');
        }
      } else {
        var signupResult = await SupabaseApp.signUp(email, password);
        if (signupResult && signupResult.user) {
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

    submitBtn.textContent = isLoginMode ? 'Iniciar sesión' : 'Crear cuenta';
    submitBtn.disabled = false;
  }

  document.addEventListener('DOMContentLoaded', init);
})();