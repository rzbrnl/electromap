/* ElectroMap - Data Layer */
/* Open Charge Map API integration */

const ChargerData = (() => {
  const API_KEY = '3d44a410-854e-4da9-b309-2c8e2b29b0f9';
  const API_BASE = 'https://api.openchargemap.io/v3/poi/';
  let cache = new Map();
  let lastFetch = null;

  function getCacheKey(lat, lng, radius) {
    return `${lat.toFixed(2)}_${lng.toFixed(2)}_${radius}`;
  }

  async function fetchChargers(lat, lng, radius = 25, maxResults = 100) {
    const cacheKey = getCacheKey(lat, lng, radius);

    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
        return cached.data;
      }
    }

    const params = new URLSearchParams({
      output: 'json',
      latitude: lat,
      longitude: lng,
      distance: radius,
      distanceunit: 'km',
      maxresults: maxResults,
      compact: 'true',
      verbose: 'false',
      key: API_KEY
    });

    try {
      const url = `${API_BASE}?${params.toString()}`;
      console.log('Fetching:', url);

      const response = await fetch(url);

      if (!response.ok) {
        const text = await response.text();
        console.error('API response:', response.status, text);
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('API returned', data.length, 'chargers');

      const chargers = parseChargers(data, lat, lng);
      console.log('Parsed', chargers.length, 'chargers');

      cache.set(cacheKey, {
        data: chargers,
        timestamp: Date.now()
      });

      lastFetch = new Date();
      return chargers;
    } catch (error) {
      console.error('Error fetching chargers:', error);
      throw error;
    }
  }

  const STATUS_MAP = {
    50: 'Operational',
    10: 'Operational',
    20: 'Not Operational',
    30: 'Operational',
    150: 'Not Operational',
    75: 'Unknown',
    0: 'Unknown',
    999: 'Unknown'
  };

  const LEVEL_MAP = {
    1: 'Level 1',
    2: 'Level 2',
    3: 'DC Fast Charging'
  };

  const USAGE_MAP = {
    0: 'Desconocido',
    1: 'Público - Libre acceso',
    2: 'Público - Pago en sitio',
    3: 'Público - Membresia requerida',
    4: 'Privado - Residencial',
    5: 'Privado - Staff',
    6: 'Público - Pago por uso',
    7: 'Público - Pago en sitio',
    8: 'Público - Membresia requerida',
    9: 'Público - Pago en sitio',
    10: 'Público - Pago por uso'
  };

  const OPERATOR_MAP = {
    1: 'Electrify America',
    2: 'Tesla',
    3: 'ChargePoint',
    4: 'EVgo',
    5: 'Blink',
    6: 'SemaConnect',
    7: 'Greenlots',
    8: 'FLO',
    9: 'CFE',
    10: 'IONITY',
    11: 'Allego',
    12: 'Fastned',
    13: 'bp pulse',
    14: 'Shell Recharge',
    15: 'EV Connect'
  };

  const CONNECTION_MAP = {
    1: 'CCS (Combo)',
    2: 'CHAdeMO',
    3: 'Tesla',
    4: 'Type 1 (J1772)',
    5: 'Type 2 (Mennekes)',
    10: 'Type 1 (J1772)',
    25: 'Type 2 (Mennekes)',
    27: 'Tesla',
    30: 'CCS (Type 2)',
    32: 'GB/T DC',
    33: 'GB/T AC'
  };

  function parseChargers(rawData, userLat, userLng) {
    if (!Array.isArray(rawData)) return [];

    return rawData.map(item => {
      const lat = item.AddressInfo?.Latitude;
      const lng = item.AddressInfo?.Longitude;

      let distance = null;
      if (userLat && userLng && lat && lng) {
        distance = calculateDistance(userLat, userLng, lat, lng);
      } else if (item.AddressInfo?.Distance) {
        distance = item.AddressInfo.Distance;
      }

      return {
        id: item.ID,
        name: item.AddressInfo?.Title || 'Sin nombre',
        address: formatAddress(item.AddressInfo),
        lat,
        lng,
        country: item.AddressInfo?.Country?.Title || item.AddressInfo?.CountryID || '',
        distance,
        distanceUnit: 2,
        operator: item.OperatorInfo?.Title || OPERATOR_MAP[item.OperatorID] || 'Desconocido',
        network: item.NetworkInfo?.Title || '',
        status: item.StatusType?.Title || STATUS_MAP[item.StatusTypeID] || 'Unknown',
        statusId: item.StatusType?.ID || item.StatusTypeID || 0,
        usage: item.UsageType?.Title || USAGE_MAP[item.UsageTypeID] || 'Desconocido',
        cost: item.UsageCost || '',
        numberOfPoints: item.NumberOfPoints || 0,
        photos: (item.MediaItems || []).map(m => m.ItemThumbnailURL || m.ItemURL).filter(Boolean).slice(0, 6),
        comments: (item.UserComments || []).slice(0, 5),
        connections: parseConnections(item.Connections),
        numConnections: item.Connections?.length || 0
      };
    });
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  function formatAddress(info) {
    if (!info) return '';
    const parts = [
      info.AddressLine1,
      info.AddressLine2,
      info.Town,
      info.StateOrProvince,
      info.Country?.Title
    ].filter(Boolean);
    return parts.join(', ');
  }

  function parseConnections(connections) {
    if (!connections || !Array.isArray(connections)) return [];

    return connections.map(conn => ({
      type: conn.ConnectionType?.Title || CONNECTION_MAP[conn.ConnectionTypeID] || 'Desconocido',
      typeId: conn.ConnectionType?.ID || conn.ConnectionTypeID,
      powerKW: conn.PowerKW || 0,
      level: conn.Level?.Title || LEVEL_MAP[conn.LevelID] || 'Desconocido',
      levelId: conn.Level?.ID || conn.LevelID,
      amps: conn.Amps,
      voltage: conn.Voltage
    }));
  }

  function filterChargers(chargers, filters) {
    return chargers.filter(charger => {
      if (filters.connectorTypes && filters.connectorTypes.length > 0) {
        const hasMatchingConnector = charger.connections.some(conn =>
          filters.connectorTypes.some(type => conn.type.includes(type))
        );
        if (!hasMatchingConnector) return false;
      }

      if (filters.levels && filters.levels.length > 0) {
        const hasMatchingLevel = charger.connections.some(conn =>
          filters.levels.includes(String(conn.levelId))
        );
        if (!hasMatchingLevel) return false;
      }

      if (filters.status && filters.status.length > 0) {
        const statusMap = {
          'operational': [50, 10, 30],
          'non-operational': [20, 30, 150],
          'unknown': [0, 75, 999]
        };

        const chargerStatusId = charger.statusId || 0;
        const matchesStatus = filters.status.some(status => {
          const ids = statusMap[status] || [];
          return ids.includes(chargerStatusId);
        });

        if (!matchesStatus) return false;
      }

      return true;
    });
  }

  function searchChargers(chargers, query) {
    if (!query || query.trim() === '') return chargers;

    const lowerQuery = query.toLowerCase();
    return chargers.filter(charger =>
      charger.name.toLowerCase().includes(lowerQuery) ||
      charger.address.toLowerCase().includes(lowerQuery) ||
      charger.operator.toLowerCase().includes(lowerQuery) ||
      charger.country.toLowerCase().includes(lowerQuery)
    );
  }

  function getStats(chargers) {
    const total = chargers.length;
    const active = chargers.filter(c =>
      c.statusId === 50 || c.statusId === 10
    ).length;
    const fastChargers = chargers.filter(c =>
      c.connections.some(conn => conn.levelId === 3)
    ).length;

    return { total, active, fastChargers };
  }

  function getMarkerColor(charger) {
    const hasFast = charger.connections.some(conn => conn.levelId === 3);
    const hasLevel2 = charger.connections.some(conn => conn.levelId === 2);

    if (hasFast) return 'fast';
    if (hasLevel2) return 'level2';
    return 'level1';
  }

  return {
    fetchChargers,
    filterChargers,
    searchChargers,
    getStats,
    getMarkerColor,
    get lastFetch() { return lastFetch; }
  };
})();