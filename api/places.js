module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  var googleKey = process.env.GOOGLE_MAPS_KEY || '';
  if (!googleKey) {
    res.status(500).json({ error: 'Google Maps key not configured' });
    return;
  }

  var type = req.query.type;
  var q = req.query.q || '';

  try {
    var url;
    if (type === 'autocomplete') {
      url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(q) + '&components=country:mx&key=' + googleKey + '&language=es';
    } else if (type === 'reverse') {
      var lat = req.query.lat || '';
      var lng = req.query.lng || '';
      url = 'https://maps.googleapis.com/maps/api/geocode/json?latlng=' + lat + ',' + lng + '&key=' + googleKey + '&language=es';
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
