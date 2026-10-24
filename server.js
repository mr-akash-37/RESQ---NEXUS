// server.js
// ResQ Nexus — Intelligent Disaster Response & Resource Allocation
//
// Deliberately built with ZERO npm dependencies so it runs on any machine
// with Node.js installed, with no "npm install" step, no native modules to
// compile, and no external database server to set up. Data persists to
// data/store.json between runs.
//
// Run:   node server.js
// Then:  open http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const store = require('./lib/store');
const { allocate } = require('./lib/allocate');
const { fileReport } = require('./lib/intake');
const { createAlert, acknowledge, runEscalationSweep } = require('./lib/alerts');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) req.destroy(); // basic guard
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Prevent path traversal outside /public
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return send(res, 403, { error: 'Forbidden' });
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // allow /report instead of /report.html, etc.
      const withHtml = filePath + '.html';
      fs.stat(withHtml, (err2, stat2) => {
        if (err2 || !stat2.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(path.join(PUBLIC_DIR, '404.html')).pipe(res);
          return;
        }
        streamFile(res, withHtml);
      });
      return;
    }
    streamFile(res, filePath);
  });
}

function streamFile(res, filePath) {
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, pathname, query) {
  const db = store.load();

  try {
    // ---------- INCIDENTS ----------
    if (pathname === '/api/incidents' && req.method === 'GET') {
      return send(res, 200, db.incidents.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    }

    // ---------- REPORTS (citizen form + satellite feed both land here) ----------
    if (pathname === '/api/reports' && req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.lat !== 'number' || typeof body.lon !== 'number') {
        return send(res, 400, { error: 'lat and lon are required numbers' });
      }
      if (!body.disaster_type) {
        return send(res, 400, { error: 'disaster_type is required' });
      }
      const incident = fileReport(store, {
        source_type: body.source_type || 'citizen_report',
        disaster_type: body.disaster_type,
        lat: body.lat,
        lon: body.lon,
        district: body.district,
        state: body.state,
        severity_score: Number(body.severity_score) || 5,
        people_affected: Number(body.people_affected) || 0,
        description: body.description || '',
        photo_url: body.photo_url || null,
        submitted_by: body.name || body.submitted_by || null,
        satellite_source: body.satellite_source || null
      });
      return send(res, 201, incident);
    }

    // ---------- SOS (one-tap emergency ambulance request) ----------
    if (pathname === '/api/sos' && req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.lat !== 'number' || typeof body.lon !== 'number') {
        return send(res, 400, { error: 'lat and lon are required numbers' });
      }
      const incident = fileReport(store, {
        source_type: 'citizen_report',
        disaster_type: 'medical_emergency',
        lat: body.lat,
        lon: body.lon,
        severity_score: 10,
        people_affected: Number(body.people_affected) || 1,
        description: body.description || 'SOS: ambulance requested',
        submitted_by: body.name || 'anonymous'
      });
      incident.status = 'verified';
      incident.confidence_score = 0.95;
      store.save();
      const assigned = allocate(store);
      const alert = createAlert(store, {
        incident_id: incident.incident_id,
        message: `SOS ambulance request near ${body.lat.toFixed(4)}, ${body.lon.toFixed(4)}`,
        channel: 'push',
        sent_to_district: body.district || incident.district
      });
      return send(res, 201, {
        incident,
        allocations: assigned.filter((a) => a.incident_id === incident.incident_id),
        alert
      });
    }

    // ---------- RESOURCES ----------
    if (pathname === '/api/resources' && req.method === 'GET') {
      return send(res, 200, db.resources);
    }
    if (pathname === '/api/resources' && req.method === 'POST') {
      const body = await readBody(req);
      const required = ['resource_type', 'name', 'lat', 'lon'];
      for (const f of required) {
        if (body[f] === undefined) return send(res, 400, { error: `${f} is required` });
      }
      const resource = {
        resource_id: store.nextId('resources'),
        resource_type: body.resource_type,
        name: body.name,
        lat: Number(body.lat),
        lon: Number(body.lon),
        capacity: Number(body.capacity) || 1,
        quantity_available: Number(body.quantity_available) || 1,
        status: 'available',
        district: body.district || null,
        state: body.state || null,
        updated_at: new Date().toISOString()
      };
      db.resources.push(resource);
      store.save();
      return send(res, 201, resource);
    }
    if (pathname.match(/^\/api\/resources\/\d+$/) && req.method === 'PATCH') {
      const id = Number(pathname.split('/').pop());
      const body = await readBody(req);
      const resource = db.resources.find((r) => r.resource_id === id);
      if (!resource) return send(res, 404, { error: 'Resource not found' });
      Object.assign(resource, body, { updated_at: new Date().toISOString() });
      store.save();
      return send(res, 200, resource);
    }

    // ---------- ALLOCATION ENGINE ----------
    if (pathname === '/api/allocate' && req.method === 'POST') {
      const results = allocate(store);
      return send(res, 200, { assigned: results.length, allocations: results });
    }
    if (pathname === '/api/allocations' && req.method === 'GET') {
      return send(res, 200, db.allocations.slice().reverse());
    }

    // ---------- ALERTS ----------
    if (pathname === '/api/alerts' && req.method === 'GET') {
      runEscalationSweep(store);
      return send(res, 200, db.alerts.slice().reverse());
    }
    if (pathname === '/api/alerts' && req.method === 'POST') {
      const body = await readBody(req);
      const alert = createAlert(store, body);
      return send(res, 201, alert);
    }
    if (pathname.match(/^\/api\/alerts\/\d+\/acknowledge$/) && req.method === 'POST') {
      const id = Number(pathname.split('/')[3]);
      const alert = acknowledge(store, id);
      if (!alert) return send(res, 404, { error: 'Alert not found' });
      return send(res, 200, alert);
    }

    // ---------- STATS (for dashboard header) ----------
    if (pathname === '/api/stats' && req.method === 'GET') {
      runEscalationSweep(store);
      const active = db.incidents.filter((i) => i.status === 'active' || i.status === 'verified');
      return send(res, 200, {
        active_incidents: active.length,
        unverified_reports: db.incidents.filter((i) => i.status === 'unverified').length,
        resources_available: db.resources.filter((r) => r.status === 'available').length,
        resources_dispatched: db.resources.filter((r) => r.status === 'dispatched').length,
        pending_alerts: db.alerts.filter((a) => a.delivery_status === 'sent').length,
        escalated_alerts: db.alerts.filter((a) => a.delivery_status === 'escalated').length
      });
    }

    // ---------- RESET (demo convenience) ----------
    if (pathname === '/api/reset' && req.method === 'POST') {
      store.reset();
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'Internal error', detail: err.message });
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname, query);
  }
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ResQ Nexus is running');
  console.log(`  ->  http://localhost:${PORT}`);
  console.log('');
});
