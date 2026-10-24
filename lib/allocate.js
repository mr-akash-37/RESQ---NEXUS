// lib/allocate.js
// The allocation "brain" described in the project design:
//   1. Rank incidents by urgency (severity x people affected), not just by
//      when they arrived.
//   2. For each incident, find the nearest AVAILABLE resource of a
//      compatible type within a maximum response radius.
//   3. Assign, decrement resource capacity, and record distance/ETA so the
//      dispatch list is explainable, not a black box.
//
// This is deliberately a transparent greedy/priority algorithm rather than
// a full linear-programming solver — a defensible, explainable baseline
// that a full OR-Tools/LP solver could later replace without changing the
// rest of the system.

const { distanceKm, etaMinutes } = require('./geo');

// Which resource types a given disaster type typically calls for, in
// priority order. This is what makes allocation "intelligent" rather than
// just nearest-anything matching.
const NEEDS_MAP = {
  flood: ['rescue_boat', 'medical_team', 'shelter', 'food_kit'],
  cyclone: ['shelter', 'medical_team', 'food_kit'],
  earthquake: ['medical_team', 'ambulance', 'shelter'],
  landslide: ['medical_team', 'ambulance', 'rescue_boat'],
  heatwave: ['medical_team', 'water_tanker'],
  fire: ['fire_truck', 'medical_team', 'ambulance'],
  medical_emergency: ['ambulance', 'medical_team'],
  other: ['medical_team', 'shelter']
};

const MAX_RADIUS_KM = 50; // matches the 50km ambulance radius referenced in prior research review

function urgencyScore(incident) {
  const severity = incident.severity_score || 5;
  const affected = Math.log10((incident.people_affected || 1) + 1);
  const confidenceWeight = incident.confidence_score || 0.5;
  return severity * (1 + affected) * confidenceWeight;
}

function allocate(store) {
  const db = store.load();
  const results = [];

  const activeIncidents = db.incidents
    .filter((i) => i.status === 'verified' || i.status === 'active')
    .slice()
    .sort((a, b) => urgencyScore(b) - urgencyScore(a));

  for (const incident of activeIncidents) {
    const neededTypes = NEEDS_MAP[incident.disaster_type] || NEEDS_MAP.other;

    for (const type of neededTypes) {
      const candidates = db.resources.filter(
        (r) => r.resource_type === type && r.status === 'available' && r.quantity_available > 0
      );
      if (candidates.length === 0) continue;

      let best = null;
      let bestDist = Infinity;
      for (const r of candidates) {
        const d = distanceKm(
          { lat: incident.lat, lon: incident.lon },
          { lat: r.lat, lon: r.lon }
        );
        if (d < bestDist && d <= MAX_RADIUS_KM) {
          bestDist = d;
          best = r;
        }
      }
      if (!best) continue;

      const allocation = {
        allocation_id: store.nextId('allocations'),
        incident_id: incident.incident_id,
        resource_id: best.resource_id,
        resource_type: best.resource_type,
        resource_name: best.name,
        allocated_qty: 1,
        distance_km: Math.round(bestDist * 10) / 10,
        eta_minutes: etaMinutes(bestDist),
        algorithm_used: 'priority_nearest_v1',
        status: 'assigned',
        assigned_at: new Date().toISOString()
      };

      best.quantity_available -= 1;
      if (best.quantity_available <= 0) best.status = 'dispatched';
      best.updated_at = new Date().toISOString();

      db.allocations.push(allocation);
      results.push(allocation);
    }

    incident.status = 'active';
    incident.updated_at = new Date().toISOString();
  }

  store.save();
  return results;
}

module.exports = { allocate, urgencyScore, NEEDS_MAP, MAX_RADIUS_KM };
