import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- Extract functions from data.js for testing ---

function calculateDistance(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatCost(cost) {
  if (!cost || cost.trim() === '') return 'Gratis';
  var l = cost.toLowerCase();
  if (l === 'free' || l === 'gratis' || l === 'free charging') return 'Gratis';
  return cost;
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

function connectorLevel(connector) {
  if (!connector) return '';
  var dc = ['CCS1', 'CCS2', 'CHAdeMO', 'NACS DC', 'GB/T DC'];
  for (var i = 0; i < dc.length; i++) { if (connector.indexOf(dc[i]) !== -1) return 'DC Rápida'; }
  return 'Nivel 2';
}

function getStats(chargers) {
  var total = chargers.length;
  var active = chargers.filter(function(c) { return c.statusId === 50 || c.statusId === 10; }).length;
  return { total: total, active: active, fastChargers: 0 };
}

function makeCharger(overrides) {
  return Object.assign({
    id: 'test-1', name: 'Test Station', address: 'Test Address',
    lat: 27.48, lng: -109.94, operator: 'CFE', statusId: 50,
    cost: 'Gratis', numberOfPoints: 1, photos: [],
    connections: [{ type: 'CCS1', typeId: 0, powerKW: 50, level: 'DC Rápida', levelId: 3 }],
    _approvedId: null
  }, overrides || {});
}

// --- Tests ---

describe('calculateDistance', () => {
  it('returns 0 for same coordinates', () => {
    assert.equal(Math.round(calculateDistance(27.48, -109.94, 27.48, -109.94)), 0);
  });

  it('calculates distance between Ciudad Obregon and Hermosillo', () => {
    // ~200km apart
    const dist = calculateDistance(27.48, -109.94, 29.07, -110.97);
    assert.ok(dist > 150 && dist < 250, `Expected ~200km, got ${dist}`);
  });

  it('calculates distance between Mexico City and Guadalajara', () => {
    const dist = calculateDistance(19.43, -99.13, 20.67, -103.35);
    assert.ok(dist > 400 && dist < 550, `Expected ~460km, got ${dist}`);
  });
});

describe('formatCost', () => {
  it('returns Gratis for empty string', () => assert.equal(formatCost(''), 'Gratis'));
  it('returns Gratis for null', () => assert.equal(formatCost(null), 'Gratis'));
  it('returns Gratis for "free"', () => assert.equal(formatCost('free'), 'Gratis'));
  it('returns Gratis for "Gratis"', () => assert.equal(formatCost('Gratis'), 'Gratis'));
  it('preserves custom cost text', () => assert.equal(formatCost('$5 por hora'), '$5 por hora'));
});

describe('normalizeConnector', () => {
  it('maps CCS1', () => assert.equal(normalizeConnector('CCS1'), 'CCS1'));
  it('maps CCS2', () => assert.equal(normalizeConnector('CCS2'), 'CCS2'));
  it('maps CHAdeMO', () => assert.equal(normalizeConnector('CHAdeMO'), 'CHAdeMO'));
  it('maps NACS DC', () => assert.equal(normalizeConnector('NACS DC Supercharger'), 'NACS DC'));
  it('maps NACS AC', () => assert.equal(normalizeConnector('NACS (AC)'), 'NACS AC'));
  it('maps GB/T DC', () => assert.equal(normalizeConnector('GB/T DC'), 'GB/T DC'));
  it('maps GB/T AC', () => assert.equal(normalizeConnector('GB/T AC'), 'GB/T AC'));
  it('maps Tipo 2', () => assert.equal(normalizeConnector('Tipo 2 (Mennekes)'), 'Tipo 2'));
  it('maps SAE J1772', () => assert.equal(normalizeConnector('SAE J1772'), 'SAE J1772'));
  it('maps NEMA 14-50', () => assert.equal(normalizeConnector('NEMA 14-50'), 'NEMA 14-50'));
  it('returns original for unknown type', () => assert.equal(normalizeConnector('Otro'), 'Otro'));
  it('handles empty input', () => assert.equal(normalizeConnector(''), ''));
  it('handles null input', () => assert.equal(normalizeConnector(null), ''));
});

describe('connectorLevel', () => {
  it('returns DC Rápida for CCS1', () => assert.equal(connectorLevel('CCS1'), 'DC Rápida'));
  it('returns DC Rápida for CCS2', () => assert.equal(connectorLevel('CCS2'), 'DC Rápida'));
  it('returns DC Rápida for CHAdeMO', () => assert.equal(connectorLevel('CHAdeMO'), 'DC Rápida'));
  it('returns DC Rápida for NACS DC', () => assert.equal(connectorLevel('NACS DC'), 'DC Rápida'));
  it('returns DC Rápida for GB/T DC', () => assert.equal(connectorLevel('GB/T DC'), 'DC Rápida'));
  it('returns Nivel 2 for SAE J1772', () => assert.equal(connectorLevel('SAE J1772'), 'Nivel 2'));
  it('returns Nivel 2 for NACS AC', () => assert.equal(connectorLevel('NACS AC'), 'Nivel 2'));
  it('returns Nivel 2 for GB/T AC', () => assert.equal(connectorLevel('GB/T AC'), 'Nivel 2'));
  it('returns Nivel 2 for Tipo 2', () => assert.equal(connectorLevel('Tipo 2'), 'Nivel 2'));
  it('returns Nivel 2 for NEMA 14-50', () => assert.equal(connectorLevel('NEMA 14-50'), 'Nivel 2'));
  it('returns empty for null', () => assert.equal(connectorLevel(null), ''));
});

describe('getStats', () => {
  it('counts total and active chargers', () => {
    var chargers = [
      makeCharger({ statusId: 50 }),
      makeCharger({ id: 'test-2', statusId: 50 }),
      makeCharger({ id: 'test-3', statusId: 20 })
    ];
    var stats = getStats(chargers);
    assert.equal(stats.total, 3);
    assert.equal(stats.active, 2);
  });

  it('handles empty array', () => {
    var stats = getStats([]);
    assert.equal(stats.total, 0);
    assert.equal(stats.active, 0);
  });
});
