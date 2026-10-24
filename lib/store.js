// lib/store.js
// A dependency-free persistence layer. Field names deliberately mirror the
// PostgreSQL + PostGIS schema this prototype is meant to graduate into:
// incidents / incident_reports / resources / allocations / alerts.
// Swapping this module for a real Postgres client later should not require
// changing any route logic, only this file.

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'store.json');

function seed() {
  return {
    nextId: { incidents: 1, reports: 1, resources: 1, allocations: 1, alerts: 1 },
    incidents: [],
    incident_reports: [],
    resources: [
      {
        resource_id: 1,
        resource_type: 'ambulance',
        name: 'Ambulance Unit 4',
        lat: 12.9789, lon: 77.6408,
        capacity: 2, quantity_available: 1,
        status: 'available',
        district: 'Bengaluru Urban', state: 'Karnataka',
        updated_at: new Date().toISOString()
      },
      {
        resource_id: 2,
        resource_type: 'rescue_boat',
        name: 'NDRF Rescue Boat 2',
        lat: 12.9351, lon: 77.6245,
        capacity: 6, quantity_available: 2,
        status: 'available',
        district: 'Bengaluru Urban', state: 'Karnataka',
        updated_at: new Date().toISOString()
      },
      {
        resource_id: 3,
        resource_type: 'shelter',
        name: 'Govt. High School Relief Shelter',
        lat: 12.9611, lon: 77.6387,
        capacity: 150, quantity_available: 150,
        status: 'available',
        district: 'Bengaluru Urban', state: 'Karnataka',
        updated_at: new Date().toISOString()
      },
      {
        resource_id: 4,
        resource_type: 'medical_team',
        name: 'Mobile Medical Team B',
        lat: 12.9915, lon: 77.5934,
        capacity: 4, quantity_available: 1,
        status: 'available',
        district: 'Bengaluru Urban', state: 'Karnataka',
        updated_at: new Date().toISOString()
      },
      {
        resource_id: 5,
        resource_type: 'food_kit',
        name: 'Relief Supply Depot – Ward 12',
        lat: 12.9435, lon: 77.5985,
        capacity: 500, quantity_available: 500,
        status: 'available',
        district: 'Bengaluru Urban', state: 'Karnataka',
        updated_at: new Date().toISOString()
      }
    ],
    allocations: [],
    alerts: []
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  if (!fs.existsSync(DATA_FILE)) {
    cache = seed();
    save();
    return cache;
  }
  try {
    cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('Could not read store.json, reseeding.', e.message);
    cache = seed();
    save();
  }
  return cache;
}

function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
}

function nextId(kind) {
  const db = load();
  const id = db.nextId[kind]++;
  save();
  return id;
}

function reset() {
  cache = seed();
  save();
  return cache;
}

module.exports = { load, save, nextId, reset };
