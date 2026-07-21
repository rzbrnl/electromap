/* ElectroMap - Data Layer */
/* Open Charge Map API integration */

const ChargerData = (() => {
  const API_BASE = 'https://api.openchargemap.io/v3/';
  let API_KEY = '3d44a410-854e-4da9-b309-2c8e2b29b0f9';
  let cache = new Map();
  let lastFetch = null;

  function setApiKey(key) {
    API_KEY = key;
  }

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
      distanceunit: '2',
      maxresults: maxResults,
      compact: 'true',
      verbose: 'false',
      key: API_KEY
    });

    try {
      const response = await fetch(`https://api.openchargemap.io/v3/?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const chargers = parseChargers(data);

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

  function parseChargers(rawData) {
    if (!Array.isArray(rawData)) return [];

    return rawData.map(item => ({
      id: item.ID,
      name: item.AddressInfo?.Title || 'Sin nombre',
      address: formatAddress(item.AddressInfo),
      lat: item.AddressInfo?.Latitude,
      lng: item.AddressInfo?.Longitude,
      country: item.AddressInfo?.Country?.Title || '',
      distance: item.AddressInfo?.Distance,
      distanceUnit: item.AddressInfo?.DistanceUnit,
      operator: item.OperatorInfo?.Title || 'Desconocido',
      network: item.NetworkInfo?.Title || '',
      status: item.StatusType?.Title || 'Unknown',
      statusId: item.StatusType?.ID,
      usage: item.UsageType?.Title || 'Desconocido',
      connections: parseConnections(item.Connections),
      numConnections: item.Connections?.length || 0
    }));
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
      type: conn.ConnectionType?.Title || 'Desconocido',
      typeId: conn.ConnectionType?.ID,
      powerKW: conn.PowerKW || 0,
      level: conn.Level?.Title || 'Desconocido',
      levelId: conn.Level?.ID,
      amps: conn.Amps,
      voltage: conn.Voltage
    }));
  }

  function getConnectorTypes(chargers) {
    const types = new Set();
    chargers.forEach(c => {
      c.connections.forEach(conn => {
        types.add(conn.type);
      });
    });
    return Array.from(types);
  }

  function filterChargers(chargers, filters) {
    return chargers.filter(charger => {
      // Filter by connector type
      if (filters.connectorTypes && filters.connectorTypes.length > 0) {
        const hasMatchingConnector = charger.connections.some(conn =>
          filters.connectorTypes.some(type => conn.type.includes(type))
        );
        if (!hasMatchingConnector) return false;
      }

      // Filter by level
      if (filters.levels && filters.levels.length > 0) {
        const hasMatchingLevel = charger.connections.some(conn =>
          filters.levels.includes(String(conn.levelId))
        );
        if (!hasMatchingLevel) return false;
      }

      // Filter by status
      if (filters.status && filters.status.length > 0) {
        const statusMap = {
          'operational': [50, 10],
          'non-operational': [20, 30, 150],
          'unknown': [0, 75, 999]
        };

        const matchesStatus = filters.status.some(status => {
          const ids = statusMap[status] || [];
          return ids.includes(charger.statusId);
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
    setApiKey,
    fetchChargers,
    filterChargers,
    searchChargers,
    getConnectorTypes,
    getStats,
    getMarkerColor,
    get lastFetch() { return lastFetch; }
  };
})();