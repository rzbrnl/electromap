/* ElectroMap - Map Layer */
var ChargerMap = (function() {
  var map = null;
  var markers = null;
  var userMarker = null;
  var userCircle = null;
  var onChargerSelect = null;
  var currentRoute = null;
  var routeMarkers = [];
  var routeDestination = null;

  // Navigation state
  var navActive = false;
  var navRoute = null;
  var navSteps = [];
  var navStepCoords = [];
  var navCurrentStep = 0;
  var navWatchId = null;
  var googleMap = null;
  var googleDirectionsRenderer = null;

  function init(callback) {
    onChargerSelect = callback;
    map = L.map('map', {
      center: [19.4326, -99.1332],
      zoom: 12,
      zoomControl: false,
      maxZoom: 18,
      minZoom: 3
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    markers = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: function(cluster) {
        var count = cluster.getChildCount();
        var size = count > 50 ? 44 : 36;
        var fontSize = count > 50 ? 14 : 12;
        return L.divIcon({
          html: '<div class="charger-marker" style="width:' + size + 'px;height:' + size + 'px;font-size:' + fontSize + 'px;">' + count + '</div>',
          className: 'charger-cluster',
          iconSize: L.point(size, size)
        });
      }
    });
    map.addLayer(markers);
    updateTileLayer(false);
    setTimeout(function() { map.invalidateSize(); }, 100);
  }

  function updateTileLayer(isDark) {
    map.eachLayer(function(layer) {
      if (layer instanceof L.TileLayer) map.removeLayer(layer);
    });
    if (isDark) {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '', subdomains: 'abcd', maxZoom: 20
      }).addTo(map);
    } else {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '', subdomains: 'abcd', maxZoom: 19
      }).addTo(map);
    }
    map.invalidateSize();
  }

  function clearMarkers() { markers.clearLayers(); }

  function addChargerMarkers(chargers) {
    markers.clearLayers();
    chargers.forEach(function(charger) {
      if (!charger.lat || !charger.lng) return;
      var colorClass = ChargerData.getMarkerColor(charger);
      var icon = L.divIcon({
        html: '<div class="charger-marker ' + colorClass + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg></div>',
        className: 'charger-marker-wrapper',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      var marker = L.marker([charger.lat, charger.lng], { icon: icon });
      marker.on('click', function() { if (onChargerSelect) onChargerSelect(charger); });
      var power = charger.connections.filter(function(c) { return c.powerKW; }).map(function(c) { return c.powerKW + ' kW'; }).join(', ') || 'N/A';
      marker.bindTooltip('<b>' + charger.name + '</b><br>' + charger.operator + ' · ' + power, {
        direction: 'top', offset: [0, -20], opacity: 0.95, className: 'charger-tooltip'
      });
      markers.addLayer(marker);
    });
  }

  function setUserLocation(lat, lng) {
    if (userMarker) map.removeLayer(userMarker);
    if (userCircle) map.removeLayer(userCircle);
    var icon = L.divIcon({
      html: '<div style="width:16px;height:16px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 0 2px rgba(59,130,246,0.3),0 2px 8px rgba(0,0,0,0.3);"></div>',
      className: 'user-marker', iconSize: [16, 16], iconAnchor: [8, 8]
    });
    userMarker = L.marker([lat, lng], { icon: icon, zIndexOffset: 1000 }).addTo(map);
    userCircle = L.circle([lat, lng], { radius: 500, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 1 }).addTo(map);
    map.setView([lat, lng], 13);
  }

  function getUserLocation() {
    return new Promise(function(resolve, reject) {
      if (!navigator.geolocation) { reject(new Error('No support')); return; }
      navigator.geolocation.getCurrentPosition(
        function(pos) { resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        function(err) { reject(err); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  function centerOnLocation(lat, lng, zoom) { map.setView([lat, lng], zoom || 13); }
  function getBounds() { return map.getBounds(); }
  function getCenter() { var c = map.getCenter(); return { lat: c.lat, lng: c.lng }; }
  function getZoom() { return map.getZoom(); }
  function getRadius() {
    var bounds = map.getBounds();
    var center = bounds.getCenter();
    var ne = bounds.getNorthEast();
    var dist = center.distanceTo(ne) / 1000;
    return Math.min(Math.ceil(dist), 100);
  }
  function onMapEvent(event, callback) { if (map) map.on(event, callback); }

  function showRoute(originLat, originLng, destLat, destLng, destName) {
    if (currentRoute) { map.removeLayer(currentRoute); currentRoute = null; }
    routeMarkers.forEach(function(m) { map.removeLayer(m); });
    routeMarkers = [];
    routeDestination = { lat: destLat, lng: destLng, name: destName };

    var destIcon = L.divIcon({
      html: '<div style="width:32px;height:32px;background:#22c55e;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>',
      className: '', iconSize: [32, 32], iconAnchor: [16, 16]
    });
    var destMarker = L.marker([destLat, destLng], { icon: destIcon }).addTo(map).bindPopup(destName);
    routeMarkers.push(destMarker);

    var bounds = L.latLngBounds([[originLat, originLng], [destLat, destLng]]);
    map.fitBounds(bounds, { padding: [80, 80] });

    // Use OSRM for route display on our map
    var url = 'https://router.project-osrm.org/route/v1/driving/' + originLng + ',' + originLat + ';' + destLng + ',' + destLat + '?overview=full&geometries=geojson&steps=true';
    fetch(url).then(function(r) { return r.json(); }).then(function(data) {
      if (data.code === 'Ok') {
        var route = data.routes[0];
        var coords = route.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
        currentRoute = L.polyline(coords, { color: '#3b82f6', weight: 5, opacity: 0.8 }).addTo(map);
        var distance = (route.distance / 1000).toFixed(1);
        var duration = Math.round(route.duration / 60);
        showNavPanel(route, distance, duration);
      }
    }).catch(function(err) { console.error('Route error:', err); });
  }

  function showNavPanel(route, distance, duration) {
    var panel = document.getElementById('navigation-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'navigation-panel';
      panel.className = 'navigation-panel';
      document.getElementById('map').appendChild(panel);
    }

    navStepCoords = [];
    var stepsHtml = '';
    if (route.legs && route.legs[0] && route.legs[0].steps) {
      route.legs[0].steps.forEach(function(step, i) {
        if (!step.maneuver) return;

        // Store step coordinates
        var coord = step.maneuver.location;
        if (coord) {
          navStepCoords.push({ lat: coord[1], lng: coord[0] });
        }

        var icon = '→';
        var instruction = '';
        var t = step.maneuver.type;
        if (t === 'arrive') { icon = '📍'; instruction = 'Llegaste a tu destino'; }
        else if (t === 'depart') { icon = '🚗'; instruction = step.name ? 'Sal por ' + step.name : 'Comienza a conducir'; }
        else if (t === 'turn') { icon = step.maneuver.modifier === 'right' ? '➡️' : '⬅️'; instruction = step.maneuver.modifier === 'right' ? 'Gira a la derecha' : 'Gira a la izquierda'; if (step.name) instruction += ' en ' + step.name; }
        else if (t === 'new name' || t === 'continue') { icon = '↑'; instruction = step.name ? 'Sigue por ' + step.name : 'Continúa recto'; }
        else if (t === 'roundabout') { icon = '🔄'; instruction = 'En la rotonda, toma la salida ' + (step.maneuver.exit || ''); }
        else { instruction = step.name || 'Continúa'; }

        var stepDist = (step.distance / 1000).toFixed(1);
        stepsHtml += '<div class="nav-step' + (i === 0 ? ' active' : '') + '" id="nav-step-' + i + '"><div class="nav-step-icon">' + icon + '</div><div class="nav-step-info"><div class="nav-step-text">' + instruction + '</div><div class="nav-step-dist">' + stepDist + ' km</div></div></div>';
      });
    }

    panel.innerHTML = '<div class="nav-header"><div class="nav-summary"><span class="nav-distance">' + distance + ' km</span><span class="nav-time">· ' + duration + ' min</span></div><button class="nav-close" onclick="ChargerMap.stopNavigation()">✕</button></div><div class="nav-steps">' + stepsHtml + '</div><div class="nav-actions"><button class="nav-start-btn" onclick="ChargerMap.startNavigation()">🔊 Iniciar navegación con voz</button><button class="nav-google-btn" onclick="ChargerMap.openNavigation()">Google Maps</button></div>';
  }

  // Voice navigation
  function speak(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      var utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-MX';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }

  function startNavigation() {
    if (!routeDestination) return;
    navActive = true;
    navCurrentStep = 0;
    speak('Navegación iniciada. Sigue las instrucciones en pantalla.');

    // Start GPS tracking
    if (navigator.geolocation) {
      navWatchId = navigator.geolocation.watchPosition(
        function(pos) {
          if (!navActive) return;
          var lat = pos.coords.latitude;
          var lng = pos.coords.longitude;

          // Update user marker
          if (userMarker) {
            userMarker.setLatLng([lat, lng]);
          }

          // Check if near destination
          var distToDest = getDistance(lat, lng, routeDestination.lat, routeDestination.lng);
          if (distToDest < 0.05) { // 50 meters
            speak('Has llegado a tu destino.');
            stopNavigation();
            return;
          }

          // Update current step based on position
          updateNavStep(lat, lng);
        },
        function(err) { console.error('GPS error:', err); },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 2000 }
      );
    }

    // Keep screen awake
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').catch(function() {});
    }

    updateNavButton(true);
  }

  function stopNavigation() {
    navActive = false;
    if (navWatchId) {
      navigator.geolocation.clearWatch(navWatchId);
      navWatchId = null;
    }
    window.speechSynthesis.cancel();
    updateNavButton(false);
  }

  function updateNavButton(active) {
    var btn = document.querySelector('.nav-start-btn');
    if (btn) {
      if (active) {
        btn.textContent = '⏹ Detener navegación';
        btn.onclick = stopNavigation;
      } else {
        btn.textContent = '🔊 Iniciar navegación con voz';
        btn.onclick = startNavigation;
      }
    }
  }

  function updateNavStep(lat, lng) {
    var steps = document.querySelectorAll('.nav-step');
    if (navCurrentStep >= steps.length - 1) return;

    // Get next step coordinates
    var nextCoord = navStepCoords[navCurrentStep + 1];
    if (!nextCoord) return;

    // Calculate distance to next step
    var distToNext = getDistance(lat, lng, nextCoord.lat, nextCoord.lng);

    // If within 50 meters of next step, advance
    if (distToNext < 0.05) {
      navCurrentStep++;

      // Highlight current step
      steps.forEach(function(s) { s.classList.remove('active'); });
      if (steps[navCurrentStep]) {
        steps[navCurrentStep].classList.add('active');

        // Speak instruction
        var instruction = steps[navCurrentStep].querySelector('.nav-step-text');
        if (instruction) {
          speak(instruction.textContent);
        }

        // Scroll to current step
        steps[navCurrentStep].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  function getDistance(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  function openNavigation() {
    if (routeDestination) {
      window.open('https://www.google.com/maps/dir/?api=1&destination=' + routeDestination.lat + ',' + routeDestination.lng + '&travelmode=driving', '_blank');
    }
  }

  function closeNavigation() {
    stopNavigation();
    var panel = document.getElementById('navigation-panel');
    if (panel) panel.remove();
    if (currentRoute) { map.removeLayer(currentRoute); currentRoute = null; }
    routeMarkers.forEach(function(m) { map.removeLayer(m); });
    routeMarkers = [];
    routeDestination = null;
  }

  function removeRouteLayer(layer) { if (layer) map.removeLayer(layer); }

  return {
    init: init, updateTileLayer: updateTileLayer, clearMarkers: clearMarkers,
    addChargerMarkers: addChargerMarkers, setUserLocation: setUserLocation,
    getUserLocation: getUserLocation, centerOnLocation: centerOnLocation,
    getBounds: getBounds, getCenter: getCenter, getZoom: getZoom,
    getRadius: getRadius, onMapEvent: onMapEvent, showRoute: showRoute,
    openNavigation: openNavigation, closeNavigation: closeNavigation,
    startNavigation: startNavigation, stopNavigation: stopNavigation,
    removeRouteLayer: removeRouteLayer
  };
})();