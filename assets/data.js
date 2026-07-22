/* ElectroMap - Data Layer */
/* Open Charge Map API integration */

const ChargerData = (() => {
  const API_KEY = '3d44a410-854e-4da9-b309-2c8e2b29b0f9';
  const API_BASE = 'https://api.openchargemap.io/v3/poi/';
  const GOOGLE_MAPS_KEY = 'AIzaSyA2zmXXHHSmeIUBw-jxpesxsilUVQaeZW0';
  const CFE_URL = 'https://repodatos.atdt.gob.mx/api_update/cfe/electrolineras_publicas_en_mexico/cfe_dseec_paese_electrolineras_2026.csv';
  let cache = new Map();
  let lastFetch = null;
  let userLat = null;
  let userLng = null;
  let cfeData = null;

  function setUserLocation(lat, lng) {
    userLat = lat;
    userLng = lng;
  }

  function getUserLocation() {
    return { lat: userLat, lng: userLng };
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

    let chargers = [];

    // Try Open Charge Map first
    try {
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
      const response = await fetch(`${API_BASE}?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        chargers = parseChargers(data);
      }
    } catch (e) {
      console.warn('OCM error:', e.message);
    }

    // Fetch CFE data if not cached
    if (!cfeData) {
      try {
        const resp = await fetch(CFE_URL);
        if (resp.ok) {
          const text = await resp.text();
          cfeData = parseCSV(text);
        }
      } catch (e) {
        console.warn('CFE error:', e.message);
      }
    }

    // Add CFE chargers near location
    if (cfeData) {
      const nearby = cfeData.filter(c => {
        if (!c.lat || !c.lng) return false;
        const dist = calculateDistance(lat, lng, c.lat, c.lng);
        return dist <= radius;
      }).map(c => ({
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
      }));
      chargers = chargers.concat(nearby);
    }

    cache.set(cacheKey, { data: chargers, timestamp: Date.now() });
    lastFetch = new Date();
    return chargers;
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

  function parseChargers(rawData) {
    if (!Array.isArray(rawData)) return [];

    return rawData.map(item => {
      const lat = item.AddressInfo?.Latitude;
      const lng = item.AddressInfo?.Longitude;

      let distance = null;
      if (userLat && userLng && lat && lng) {
        distance = calculateDistance(userLat, userLng, lat, lng);
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

  function parseCSV(text) {
    const lines = text.split('\n').slice(1);
    return lines.filter(l => l.trim()).map(line => {
      const parts = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === ',' && !inQuotes) { parts.push(current.trim()); current = ''; }
        else { current += ch; }
      }
      parts.push(current.trim());
      return {
        cons: parts[0],
        nombre_estacion: parts[2] || '',
        direccion: parts[3] || '',
        ciudad: parts[5] || '',
        estado: parts[6] || '',
        lat: parseFloat(parts[8]) || 0,
        lng: parseFloat(parts[9]) || 0,
        electrolineras_totales: parts[10] || '0',
        tipo_01: parts[12] || '',
        potencia_01: parts[13] || ''
      };
    }).filter(c => c.lat && c.lng);
  }

  async function fetchDrivingDistances(chargers) {
    const BATCH_SIZE = 25;
    const chargersWithCoords = chargers.filter(c => c.lat && c.lng);

    for (let i = 0; i < chargersWithCoords.length; i += BATCH_SIZE) {
      const batch = chargersWithCoords.slice(i, i + BATCH_SIZE);
      const destinations = batch.map(c => c.lat + ',' + c.lng).join('|');

      if (!destinations) continue;

      const origin = userLat + ',' + userLng;
      const url = 'https://maps.googleapis.com/maps/api/distancematrix/json?origins=' + origin + '&destinations=' + destinations + '&key=' + GOOGLE_MAPS_KEY + '&units=metric&language=es';

      try {
        const response = await fetch(url);
        const data = await response.json();
        console.log('Google Maps response:', data.status);

        if (data.status !== 'OK') {
          console.warn('Google Maps API error:', data);
          continue;
        }

        const elements = data.rows[0] ? data.rows[0].elements : [];

        for (let j = 0; j < batch.length; j++) {
          const element = elements[j];
          if (element && element.status === 'OK') {
            batch[j].drivingDistance = element.distance.value / 1000;
            batch[j].drivingDuration = element.duration.text;
          }
        }
      } catch (error) {
        console.warn('Google Maps fetch error:', error);
      }
    }
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
    setUserLocation,
    getUserLocation,
    fetchChargers,
    filterChargers,
    searchChargers,
    getStats,
    getMarkerColor,
    get lastFetch() { return lastFetch; }
  };
})();