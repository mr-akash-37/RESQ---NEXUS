// lib/geo.js
// Small geospatial helpers. In the full production design (see /docs schema),
// these calculations are done by PostGIS. This module reproduces the same
// logic in plain JS so the prototype needs no spatial database extension.

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Great-circle distance between two lat/long points, in kilometers.
function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

// Rough ETA assuming an average road speed. Disaster conditions slow this
// down, so we apply a conservative average speed rather than highway speed.
function etaMinutes(km, avgSpeedKmh = 32) {
  return Math.round((km / avgSpeedKmh) * 60);
}

module.exports = { distanceKm, etaMinutes };
