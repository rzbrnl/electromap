/* ElectroMap - Data Layer */
/* CFE Electrolineras Públicas México */

var ChargerData = (function() {
  var GOOGLE_MAPS_KEY = '';
  var cache = new Map();
  var lastFetch = null;
  var userLat = null;
  var userLng = null;
  var cfeData = null;

  async function loadConfig() {
    try {
      var resp = await fetch('/api/config');
      if (resp.ok) {
        var config = await resp.json();
        GOOGLE_MAPS_KEY = config.GOOGLE_MAPS_KEY || '';
      }
    } catch (e) {
      console.warn('Config load error:', e.message);
    }
  }

  function setUserLocation(lat, lng) {
    userLat = lat;
    userLng = lng;
  }

  function getUserLocation() {
    return { lat: userLat, lng: userLng };
  }

  function getCacheKey(lat, lng, radius) {
    return lat.toFixed(2) + '_' + lng.toFixed(2) + '_' + radius;
  }

  async function fetchChargers(lat, lng, radius) {
    radius = radius || 50;
    var cacheKey = getCacheKey(lat, lng, radius);

    if (cache.has(cacheKey)) {
      var cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
        return cached.data;
      }
    }

    // Load CFE data if not loaded
    if (!cfeData) {
      try {
        var resp = await fetch('/cfe-data.json');
        if (resp.ok) {
          cfeData = await resp.json();
        }
      } catch (e) {
        console.warn('CFE load error:', e.message);
      }
    }

    var chargers = [];
    if (cfeData) {
      chargers = cfeData.filter(function(c) {
        if (!c.lat || !c.lng) return false;
        return calculateDistance(lat, lng, c.lat, c.lng) <= radius;
      }).map(function(c) {
        return {
          id: 'cfe-' + c.cons,
          name: c.nombre_estacion,
          address: c.direccion + ', ' + c.ciudad + ', ' + c.estado,
          lat: c.lat,
          lng: c.lng,
          country: 'México',
          distance: calculateDistance(lat, lng, c.lat, c.lng),
          distanceUnit: 2,
          operator: 'CFE',
          network: 'CFE',
          status: 'Operational',
          statusId: 50,
          usage: 'Público',
          cost: 'Gratis',
          numberOfPoints: parseInt(c.electrolineras_totales) || 0,
          photos: [],
          connections: [{ type: c.tipo_01 || 'N/A', typeId: 0, powerKW: parseFloat(c.potencia_01) || 0, level: 'Level 2', levelId: 2 }],
          numConnections: parseInt(c.electrolineras_totales) || 0
        };
      });
    }

    cache.set(cacheKey, { data: chargers, timestamp: Date.now() });
    lastFetch = new Date();
    return chargers;
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  function filterChargers(chargers, filters) {
    return chargers.filter(function(charger) {
      // Always show community/approved stations
      if (charger._approvedId) return true;

      if (filters.connectorTypes && filters.connectorTypes.length > 0) {
        if (!charger.connections.some(function(conn) { return filters.connectorTypes.some(function(type) { return conn.type.includes(type); }); })) return false;
      }
      if (filters.levels && filters.levels.length > 0) {
        if (!charger.connections.some(function(conn) { return filters.levels.indexOf(String(conn.levelId)) !== -1; })) return false;
      }
      if (filters.status && filters.status.length > 0) {
        var statusMap = { 'operational': [50, 10, 30], 'non-operational': [20, 30, 150], 'unknown': [0, 75, 999] };
        var sid = charger.statusId || 0;
        if (!filters.status.some(function(s) { return (statusMap[s] || []).indexOf(sid) !== -1; })) return false;
      }
      return true;
    });
  }

  function searchChargers(chargers, query) {
    if (!query || query.trim() === '') return chargers;
    var q = query.toLowerCase();
    return chargers.filter(function(c) {
      return c.name.toLowerCase().indexOf(q) !== -1 || c.address.toLowerCase().indexOf(q) !== -1 || c.operator.toLowerCase().indexOf(q) !== -1;
    });
  }

  function getStats(chargers) {
    var total = chargers.length;
    var active = chargers.filter(function(c) { return c.statusId === 50 || c.statusId === 10; }).length;
    return { total: total, active: active, fastChargers: 0 };
  }

  function getMarkerColor(charger) {
    var hasFast = charger.connections.some(function(c) { return c.levelId === 3; });
    var hasLevel2 = charger.connections.some(function(c) { return c.levelId === 2; });
    if (hasFast) return 'fast';
    if (hasLevel2) return 'level2';
    return 'level1';
  }

  function clearCache() {
    cache.clear();
    lastFetch = null;
  }

  return {
    setUserLocation: setUserLocation,
    getUserLocation: getUserLocation,
    fetchChargers: fetchChargers,
    filterChargers: filterChargers,
    searchChargers: searchChargers,
    getStats: getStats,
    getMarkerColor: getMarkerColor,
    loadConfig: loadConfig,
    clearCache: clearCache,
    get lastFetch() { return lastFetch; }
  };
})();

ChargerData.loadConfig();