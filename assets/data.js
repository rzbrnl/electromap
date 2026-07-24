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

  function normalizeConnector(type) {
    var t = (type || '').toLowerCase();
    if (t.indexOf('nacs') !== -1) {
      if (t.indexOf('dc') !== -1 || t.indexOf('supercharger') !== -1) return 'NACS DC';
      return 'NACS AC';
    }
    if (t.indexOf('ccs') !== -1) {
      if (t.indexOf('1') !== -1) return 'CCS1';
      return 'CCS2';
    }
    if (t.indexOf('chademo') !== -1) return 'CHAdeMO';
    if (t.indexOf('gb/t dc') !== -1 || (t.indexOf('gb') !== -1 && t.indexOf('dc') !== -1)) return 'GB/T DC';
    if (t.indexOf('gb/t ac') !== -1 || (t.indexOf('gb') !== -1 && t.indexOf('ac') !== -1)) return 'GB/T AC';
    if (t.indexOf('gb/t') !== -1 || t.indexOf('gb') !== -1) return 'GB/T DC';
    if (t.indexOf('tipo 2') !== -1 || t.indexOf('mennekes') !== -1 || t.indexOf('type 2') !== -1 || t.indexOf('type2') !== -1) return 'Tipo 2';
    if (t.indexOf('j1772') !== -1 || t.indexOf('sae j1772') !== -1 || t.indexOf('type 1') !== -1 || t.indexOf('type1') !== -1) return 'SAE J1772';
    if (t.indexOf('nema') !== -1 || t.indexOf('14-50') !== -1) return 'NEMA 14-50';
    if (t.indexOf('dc') !== -1 && t.indexOf('combo') !== -1) return 'CCS2';
    return type || '';
  }

  function filterChargers(chargers, filters) {
    var totalConnectors = document.querySelectorAll('#filter-connectors input[type="checkbox"]').length;
    var totalLevels = document.querySelectorAll('#filter-levels input[type="checkbox"]').length;
    var totalStatus = document.querySelectorAll('#filter-status input[type="checkbox"]').length;

    return chargers.filter(function(charger) {
      // Always show community/approved stations
      if (charger._approvedId) return true;

      if (filters.connectorTypes && filters.connectorTypes.length > 0 && filters.connectorTypes.length < totalConnectors) {
        var chargerType = normalizeConnector(charger.connections[0] ? charger.connections[0].type : '');
        if (filters.connectorTypes.indexOf(chargerType) === -1) return false;
      }
      if (filters.levels && filters.levels.length > 0 && filters.levels.length < totalLevels) {
        var hasMatch = charger.connections.some(function(conn) {
          return filters.levels.indexOf(String(conn.levelId)) !== -1;
        });
        if (!hasMatch) return false;
      }
      if (filters.status && filters.status.length > 0 && filters.status.length < totalStatus) {
        var sId = charger.statusId || 0;
        var isOp = sId === 50 || sId === 10 || sId === 30;
        var isNon = sId === 20 || sId === 150;
        var isUnk = sId === 0 || sId === 75 || sId === 999;
        if (filters.status.indexOf('operational') === -1 && isOp) return false;
        if (filters.status.indexOf('non-operational') === -1 && isNon) return false;
        if (filters.status.indexOf('unknown') === -1 && isUnk) return false;
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