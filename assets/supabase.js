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

  async function addComment(chargerId, userName, rating, comment) {
    if (!client) return null;
    const { data, error } = await client.from('comments').insert({
      charger_id: chargerId,
      user_name: userName || 'Anónimo',
      rating: rating,
      comment: comment
    }).select();
    return error ? null : data[0];
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

  async function addPhoto(chargerId, url, caption) {
    if (!client) return null;
    const { data, error } = await client.from('photos').insert({
      charger_id: chargerId,
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
      new_station_connector: reportData.newStationConnector
    }).select();
    return error ? null : data[0];
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

  // === AUTH ===
  async function signUp(email, password) {
    if (!client) return null;
    const { data, error } = await client.auth.signUp({ email, password });
    return error ? null : data;
  }

  async function signIn(email, password) {
    if (!client) return null;
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    return error ? null : data;
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
  }

  function getUser() {
    if (!client) return null;
    return client.auth.getUser();
  }

  return {
    init, getClient,
    getComments, addComment, getAverageRating,
    getPhotos, addPhoto,
    addReport, getReports,
    getFavorites, toggleFavorite,
    addToHistory, getHistory,
    signUp, signIn, signOut, getUser
  };
})();