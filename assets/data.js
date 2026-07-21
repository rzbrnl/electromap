/* ElectroMap - Data Layer */
/* Open Charge Map API integration with fallback */

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
      verbose: 'false'
    });

    if (API_KEY && API_KEY !== 'YOUR_API_KEY_HERE') {
      params.append('key', API_KEY);
    }

    try {
      const url = `https://api.openchargemap.io/v3/?${params.toString()}`;
      console.log('Fetching chargers from:', url);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`API returned ${response.status}, using sample data`);
        return getSampleChargers(lat, lng);
      }

      const data = await response.json();

      if (!data || data.length === 0) {
        console.warn('API returned empty data, using sample data');
        return getSampleChargers(lat, lng);
      }

      const chargers = parseChargers(data);

      cache.set(cacheKey, {
        data: chargers,
        timestamp: Date.now()
      });

      lastFetch = new Date();
      return chargers;
    } catch (error) {
      console.warn('API error, using sample data:', error.message);
      return getSampleChargers(lat, lng);
    }
  }

  function getSampleChargers(lat, lng) {
    const sampleData = [
      {
        id: 1,
        name: 'Estación de Carga Rápida CFE',
        address: 'Centro de carga principal',
        lat: lat + 0.01,
        lng: lng + 0.01,
        country: 'México',
        distance: 0.5,
        distanceUnit: 2,
        operator: 'CFE',
        network: 'CFE',
        status: 'Operational',
        statusId: 50,
        usage: 'Public',
        connections: [
          { type: 'CCS (Type 2)', typeId: 1, powerKW: 150, level: 'DC Fast Charging', levelId: 3, amps: 200, voltage: 800 }
        ],
        numConnections: 1
      },
      {
        id: 2,
        name: 'Cargador Nivel 2 Walmart',
        address: 'Estacionamiento Walmart',
        lat: lat - 0.005,
        lng: lng + 0.008,
        country: 'México',
        distance: 1.2,
        distanceUnit: 2,
        operator: 'Walmart',
        network: 'Walmart',
        status: 'Operational',
        statusId: 50,
        usage: 'Public',
        connections: [
          { type: 'Type 2 (Mennekes)', typeId: 25, powerKW: 22, level: 'Level 2', levelId: 2, amps: 32, voltage: 240 }
        ],
        numConnections: 1
      },
      {
        id: 3,
        name: 'Tesla Supercharger',
        address: 'Plaza Comercial',
        lat: lat + 0.003,
        lng: lng - 0.007,
        country: 'México',
        distance: 0.8,
        distanceUnit: 2,
        operator: 'Tesla',
        network: 'Tesla',
        status: 'Operational',
        statusId: 50,
        usage: 'Public',
        connections: [
          { type: 'Tesla', typeId: 27, powerKW: 250, level: 'DC Fast Charging', levelId: 3, amps: 300, voltage: 480 }
        ],
        numConnections: 1
      },
      {
        id: 4,
        name: 'Cargador CHAdeMO IKEA',
        address: 'IKEA Estacionamiento',
        lat: lat - 0.008,
        lng: lng - 0.003,
        country: 'México',
        distance: 1.5,
        distanceUnit: 2,
        operator: 'IKEA',
        network: 'IKEA',
        status: 'Operational',
        statusId: 50,
        usage: 'Public',
        connections: [
          { type: 'CHAdeMO', typeId: 2, powerKW: 50, level: 'DC Fast Charging', levelId: 3, amps: 125, voltage: 500 }
        ],
        numConnections: 1
      },
      {
        id: 5,
        name: 'Cargador CCS Home Depot',
        address: 'Home Depot Parking',
        lat: lat + 0.006,
        lng: lng + 0.004,
        country: 'México',
        distance: 0.3,
        distanceUnit: 2,
        operator: 'Home Depot',
        network: 'Home Depot',
        status: 'Operational',
        statusId: 50,
        usage: 'Public',
        connections: [
          { type: 'CCS (Combo)', typeId: 1, powerKW: 100, level: 'DC Fast Charging', levelId: 3, amps: 150, voltage: 650 }
        ],
        numConnections: 1
      },
      {
        id: 6,
        name: 'Cargador Nivel 1 Hotel',
        address: 'Hotel Parking',
        lat: lat + 0.012,
        lng: lng - 0.009,
        country: 'México',
        distance: 2.1,
        distanceUnit: 2,
        operator: 'Hotel',
        network: 'Hotel',
        status: 'Operational',
        statusId: 50,
        usage: 'Public',
        connections: [
          { type: 'Type 1 (J1772)', typeId: 10, powerKW: 1.4, level: 'Level 1', levelId: 1, amps: 12, voltage: 120 }
        ],
        numConnections: 1
      },
      {
        id: 7,
        name: 'Estación IONITY',
        address: 'Autopista México-Puebla',
        lat: lat - 0.015,
        lng: lng + 0.012,
        country: 'México',
        distance: 3.2,
        distanceUnit: 2,
        operator: 'IONITY',
        network: 'IONITY',
        status: 'Operational',
        statusId: 50,
        usage: 'Public',
        connections: [
          { type: 'CCS (Type 2)', typeId: 1, powerKW: 350, level: 'DC Fast Charging', levelId: 3, amps: 500, voltage: 900 }
        ],
        numConnections: 1
      },
      {
        id: 8,
        name: 'Cargador Electrify America',
        address: 'Centro Comercial',
        lat: lat + 0.009,
        lng: lng - 0.005,
        country: 'México',
        distance: 1.8,
        distanceUnit: 2,
        operator: 'Electrify America',
        network: 'Electrify America',
        status: 'Operational',
        statusId: 50,
        usage: 'Public',
        connections: [
          { type: 'CCS (Combo)', typeId: 1, powerKW: 150, level: 'DC Fast Charging', levelId: 3, amps: 200, voltage: 800 }
        ],
        numConnections: 1
      }
    ];

    lastFetch = new Date();
    return sampleData;
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