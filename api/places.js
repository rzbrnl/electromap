module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Simple in-memory rate limiting: max 30 requests per minute per IP
  var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  var now = Date.now();
  if (!global._rateLimits) global._rateLimits = {};
  if (!global._rateLimits[ip]) global._rateLimits[ip] = [];
  global._rateLimits[ip] = global._rateLimits[ip].filter(function(t) { return now - t < 60000; });
  if (global._rateLimits[ip].length >= 30) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Demasiadas peticiones. Intenta de nuevo en un minuto.' });
    return;
  }
  global._rateLimits[ip].push(now);

  var googleKey = process.env.GOOGLE_MAPS_KEY || '';
  if (!googleKey) {
    res.status(500).json({ error: 'Google Maps key not configured' });
    return;
  }

  var type = req.query.type;

  try {
    var url;
    if (type === 'autocomplete') {
      var q = req.query.q || '';
      url = 'https://maps.googleapis.com/maps/api/place/autocomplete/json?input=' + encodeURIComponent(q) + '&components=country:mx&key=' + googleKey + '&language=es';
    } else if (type === 'details') {
      url = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' + (req.query.place_id || '') + '&key=' + googleKey + '&fields=geometry,formatted_address&language=es';
    } else if (type === 'geocode') {
      url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(req.query.address || '') + '&components=country:mx&key=' + googleKey + '&language=es';
    } else if (type === 'reverse') {
      url = 'https://maps.googleapis.com/maps/api/geocode/json?latlng=' + (req.query.lat || '') + ',' + (req.query.lng || '') + '&key=' + googleKey + '&language=es';
    } else {
      res.status(400).json({ error: 'Invalid type' });
      return;
    }

    var response = await fetch(url);
    var data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
