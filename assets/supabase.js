/* ElectroMap - Supabase Community Module */

var SupabaseApp = (function() {
  var client = null;
  var currentUser = null;
  var initialized = false;

  async function init() {
    if (initialized) return;
    try {
      var resp = await fetch('/api/config');
      if (resp.ok) {
        var config = await resp.json();
        if (config.SUPABASE_URL && config.SUPABASE_KEY) {
          client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
          initialized = true;
          console.log('Supabase initialized');
          client.auth.onAuthStateChange(function(event, session) {
            if (event === 'PASSWORD_RECOVERY') {
              window._resetSession = session;
              document.dispatchEvent(new CustomEvent('auth:password-recovery'));
            }
          });
        }
      }
    } catch (e) {
      console.warn('Supabase init error:', e.message);
    }
  }

  function getClient() { return client; }

  // === COMMENTS ===
  async function getComments(chargerId) {
    if (!client) return [];
    const { data, error } = await client.from('comments')
      .select('*')
      .eq('charger_id', chargerId)
      .order('created_at', { ascending: false });
    return error ? [] : data;
  }

  async function getCommentsByUser(userId) {
    if (!client) return [];
    const { data, error } = await client.from('comments')
      .select('id')
      .eq('user_id', userId);
    return error ? [] : data;
  }

  async function addComment(chargerId, userName, rating, comment, userId) {
    if (!client) return null;
    const { data, error } = await client.from('comments').insert({
      charger_id: chargerId,
      user_id: userId || null,
      user_name: userName || 'Anónimo',
      rating: rating,
      comment: comment
    }).select();
    return error ? null : data[0];
  }

  async function updateComment(commentId, rating, comment) {
    if (!client) return false;
    const { error } = await client.from('comments')
      .update({ rating: rating, comment: comment })
      .eq('id', commentId);
    return !error;
  }

  async function deleteComment(commentId) {
    if (!client) return false;
    const { error } = await client.from('comments').delete().eq('id', commentId);
    return !error;
  }

  async function getAverageRating(chargerId) {
    if (!client) return 0;
    const { data } = await client.from('comments')
      .select('rating')
      .eq('charger_id', chargerId)
      .not('rating', 'is', null);
    if (!data || data.length === 0) return 0;
    const sum = data.reduce((a, b) => a + b.rating, 0);
    return Math.round((sum / data.length) * 10) / 10;
  }

  // === PHOTOS ===
  async function getPhotos(chargerId) {
    if (!client) return [];
    const { data, error } = await client.from('photos')
      .select('*')
      .eq('charger_id', chargerId)
      .order('created_at', { ascending: false });
    return error ? [] : data;
  }

  async function getUserPhotos(userId) {
    if (!client) return [];
    const { data, error } = await client.from('photos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return error ? [] : data;
  }

  async function deletePhoto(photoId) {
    if (!client) return false;
    const { error } = await client.from('photos').delete().eq('id', photoId);
    return !error;
  }

  async function addPhoto(chargerId, url, caption, userId) {
    if (!client) return null;
    const { data, error } = await client.from('photos').insert({
      charger_id: chargerId,
      user_id: userId || null,
      url: url,
      caption: caption || ''
    }).select();
    return error ? null : data[0];
  }

  // === REPORTS ===
  async function addReport(reportData) {
    if (!client) return null;
    const { data, error } = await client.from('reports').insert({
      charger_id: reportData.chargerId,
      report_type: reportData.type,
      description: reportData.description,
      new_station_name: reportData.newStationName,
      new_station_address: reportData.newStationAddress,
      new_station_lat: reportData.newStationLat,
      new_station_lng: reportData.newStationLng,
      new_station_connector: reportData.newStationConnector,
      station_level: reportData.level,
      station_power_kw: reportData.power,
      station_points: reportData.points,
      station_cost: reportData.cost,
      station_operator: reportData.operator
    }).select();
    return error ? null : data[0];
  }

  async function deleteReport(reportId) {
    if (!client) return false;
    const { error } = await client.from('reports').delete().eq('id', reportId);
    return !error;
  }

  // === APPROVED STATIONS ===
  async function getApprovedStations() {
    if (!client) return [];
    const { data, error } = await client.from('approved_stations')
      .select('*')
      .order('created_at', { ascending: false });
    return error ? [] : data;
  }

  async function approveStation(stationData) {
    if (!client) return null;
    const { data, error } = await client.from('approved_stations').insert({
      name: stationData.name,
      address: stationData.address,
      lat: stationData.lat,
      lng: stationData.lng,
      connector: stationData.connector,
      level: stationData.level,
      power_kw: stationData.power,
      points: stationData.points,
      cost: stationData.cost,
      operator: stationData.operator,
      charger_id: stationData.chargerId || null
    }).select();
    return error ? null : data[0];
  }

  async function updateStation(id, stationData) {
    if (!client) return false;
    // Only update non-null fields
    var clean = {};
    Object.keys(stationData).forEach(function(k) {
      if (stationData[k] !== null && stationData[k] !== undefined) clean[k] = stationData[k];
    });
    clean.updated_at = new Date().toISOString();
    const { error } = await client.from('approved_stations')
      .update(clean)
      .eq('id', id);
    return !error;
  }

  async function deleteStation(id) {
    if (!client) return false;
    const { error } = await client.from('approved_stations').delete().eq('id', id);
    return !error;
  }

  async function getReports() {
    if (!client) return [];
    const { data, error } = await client.from('reports')
      .select('*')
      .order('created_at', { ascending: false });
    return error ? [] : data;
  }

  // === FAVORITES ===
  async function getFavorites(userId) {
    if (!client) return [];
    const { data, error } = await client.from('favorites')
      .select('charger_id')
      .eq('user_id', userId);
    return error ? [] : data.map(f => f.charger_id);
  }

  async function toggleFavorite(userId, chargerId) {
    if (!client) return false;
    const { data: existing } = await client.from('favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('charger_id', chargerId)
      .single();

    if (existing) {
      await client.from('favorites').delete().eq('id', existing.id);
      return false;
    } else {
      await client.from('favorites').insert({ user_id: userId, charger_id: chargerId });
      return true;
    }
  }

  // === HISTORY ===
  async function addToHistory(userId, chargerId) {
    if (!client) return;
    await client.from('visit_history').insert({ user_id: userId, charger_id: chargerId });
  }

  async function getHistory(userId, limit) {
    if (!client) return [];
    const { data, error } = await client.from('visit_history')
      .select('charger_id, visited_at')
      .eq('user_id', userId)
      .order('visited_at', { ascending: false })
      .limit(limit || 10);
    return error ? [] : data;
  }

  // === PROFILE ===
  async function getProfile(userId) {
    if (!client) return null;
    const { data } = await client.from('user_profiles')
      .select('display_name, avatar_url, created_at')
      .eq('id', userId)
      .single();
    return data || null;
  }

  async function updateDisplayName(userId, name) {
    if (!client) return;
    await client.from('user_profiles').upsert({
      id: userId, display_name: name
    }, { onConflict: 'id' });
  }

  // === AUTH ===
  async function signUp(email, password, displayName) {
    if (!client) return null;
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || '' } }
    });
    if (error || !data || !data.user) return null;
    // Save display_name to user_profiles
    try {
      await client.from('user_profiles').upsert({
        id: data.user.id,
        email: email,
        display_name: displayName || ''
      }, { onConflict: 'id' });
    } catch (e) {}
    return data;
  }

  async function signIn(email, password) {
    if (!client) return null;
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    return error ? null : data;
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    currentUser = null;
  }

  function getUser() {
    if (!client) return null;
    return client.auth.getUser();
  }

  // === ADMIN ===
  async function isAdmin(userId) {
    if (!client) return false;
    try {
      const { data } = await client.rpc('is_admin');
      return data === true;
    } catch (e) {
      return false;
    }
  }

  async function getDashboardStats() {
    if (!client) return null;
    var counts = {};
    var tables = ['user_profiles', 'comments', 'photos', 'reports', 'favorites'];
    for (var i = 0; i < tables.length; i++) {
      var { count } = await client.from(tables[i]).select('*', { count: 'exact', head: true });
      counts[tables[i]] = count || 0;
    }
    return counts;
  }

  async function getAllUsers() {
    if (!client) return [];
    const { data, error } = await client.from('user_profiles')
      .select('id, email, display_name, avatar_url, role, created_at')
      .order('created_at', { ascending: false });
    return error ? [] : data;
  }

  async function updateUserRole(userId, role) {
    if (!client) return false;
    const { error } = await client.from('user_profiles')
      .update({ role: role })
      .eq('id', userId);
    return !error;
  }

  async function getAllReports(status) {
    if (!client) return [];
    var query = client.from('reports').select('*').order('created_at', { ascending: false });
    if (status && status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    return error ? [] : data;
  }

  async function updateReportStatus(reportId, status) {
    if (!client) return false;
    const { error } = await client.from('reports')
      .update({ status: status })
      .eq('id', reportId);
    return !error;
  }

  async function getAllCommentsAdmin(limit, offset) {
    if (!client) return [];
    const { data, error } = await client.from('comments')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset || 0, (offset || 0) + (limit || 50) - 1);
    return error ? [] : data;
  }

  async function getAllPhotosAdmin(limit, offset) {
    if (!client) return [];
    const { data, error } = await client.from('photos')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset || 0, (offset || 0) + (limit || 50) - 1);
    return error ? [] : data;
  }

  async function deleteAnyComment(commentId) {
    if (!client) return false;
    const { error } = await client.from('comments').delete().eq('id', commentId);
    return !error;
  }

  async function deleteAnyPhoto(photoId) {
    if (!client) return false;
    const { error } = await client.from('photos').delete().eq('id', photoId);
    return !error;
  }

  return {
    init, getClient,
    getComments, getCommentsByUser, addComment, updateComment, deleteComment, getAverageRating,
    getPhotos, getUserPhotos, deletePhoto, addPhoto,
    addReport, getReports, deleteReport,
    getApprovedStations, approveStation, updateStation, deleteStation,
    getFavorites, toggleFavorite,
    addToHistory, getHistory,
    getProfile, updateDisplayName,
    isAdmin, getDashboardStats, getAllUsers, updateUserRole,
    getAllReports, updateReportStatus,
    getAllCommentsAdmin, getAllPhotosAdmin, deleteAnyComment, deleteAnyPhoto,
    signUp, signIn, signOut, getUser
  };
})();