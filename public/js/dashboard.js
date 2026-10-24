// public/js/dashboard.js

let map, incidentLayer, resourceLayer, allocationLayer;

function severityBadgeClass(score) {
  if (score >= 8) return 'severity-high';
  if (score >= 5) return 'severity-mid';
  return 'severity-low';
}

function severityColor(score) {
  if (score >= 8) return '#e4483d';
  if (score >= 5) return '#f2a93b';
  return '#2fb8a6';
}

function resourceIconColor(type) {
  const map = {
    ambulance: '#e4483d',
    rescue_boat: '#8fc4ff',
    shelter: '#2fb8a6',
    medical_team: '#f2a93b',
    food_kit: '#c9a86a',
    fire_truck: '#e4483d',
    water_tanker: '#8fc4ff',
    personnel: '#93a7bd'
  };
  return map[type] || '#93a7bd';
}

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([12.9716, 77.5946], 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);
  incidentLayer = L.layerGroup().addTo(map);
  resourceLayer = L.layerGroup().addTo(map);
  allocationLayer = L.layerGroup().addTo(map);
}

function renderFeed(incidents) {
  const list = document.getElementById('feedList');
  if (incidents.length === 0) {
    list.innerHTML = '<div class="empty-state">No incidents reported yet.<br>Try the Report page to file one.</div>';
    return;
  }
  list.innerHTML = incidents.map((i) => `
    <div class="incident-card" onclick="focusIncident(${i.lat}, ${i.lon})">
      <div class="top-row">
        <strong>${i.disaster_type.replace('_',' ')}</strong>
        <span class="badge ${severityBadgeClass(i.severity_score)}">sev ${i.severity_score}</span>
      </div>
      <div class="meta">incident #${i.incident_id}, ${i.status}</div>
      <div class="flex gap-8" style="margin-top:6px; align-items:center">
        <span class="badge source-${i.source_type}">${i.source_type.replace('_',' ')}</span>
        <span class="meta">${(i.confidence_score*100).toFixed(0)}% confidence, ${i.people_affected} affected</span>
      </div>
    </div>
  `).join('');
}

function focusIncident(lat, lon) {
  map.setView([lat, lon], 14);
}
window.focusIncident = focusIncident;

function renderIncidentsOnMap(incidents) {
  incidentLayer.clearLayers();
  incidents.forEach((i) => {
    const popup = `<strong>${i.disaster_type}</strong><br>Severity ${i.severity_score}, ${i.status}<br>${i.description || ''}`;

    // Critical incidents get a pulsing marker — motion here signals urgency,
    // it isn't decorative, so it's reserved for severity 8+.
    if (i.severity_score >= 8) {
      const icon = L.divIcon({
        className: '',
        html: '<div class="pulse-marker"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      L.marker([i.lat, i.lon], { icon }).bindPopup(popup).addTo(incidentLayer);
      return;
    }

    const marker = L.circleMarker([i.lat, i.lon], {
      radius: 8 + (i.severity_score / 2),
      color: severityColor(i.severity_score),
      fillColor: severityColor(i.severity_score),
      fillOpacity: 0.55,
      weight: 2
    }).bindPopup(popup);
    incidentLayer.addLayer(marker);
  });
}

function renderResourcesOnMap(resources) {
  resourceLayer.clearLayers();
  resources.forEach((r) => {
    const marker = L.circleMarker([r.lat, r.lon], {
      radius: 6,
      color: resourceIconColor(r.resource_type),
      fillColor: resourceIconColor(r.resource_type),
      fillOpacity: r.status === 'available' ? 0.9 : 0.25,
      weight: 1
    }).bindPopup(`<strong>${r.name}</strong><br>${r.resource_type} · ${r.status}<br>Available: ${r.quantity_available}/${r.capacity}`);
    resourceLayer.addLayer(marker);
  });
  document.getElementById('resourceSummary').textContent =
    `${resources.filter(r => r.status === 'available').length} resources available · ${resources.filter(r => r.status === 'dispatched').length} dispatched`;
}

function renderAllocationLines(allocations, incidents, resources) {
  allocationLayer.clearLayers();
  allocations.forEach((a) => {
    const inc = incidents.find((i) => i.incident_id === a.incident_id);
    const res = resources.find((r) => r.resource_id === a.resource_id);
    if (!inc || !res) return;
    L.polyline([[inc.lat, inc.lon], [res.lat, res.lon]], {
      color: '#f2a93b', weight: 2, dashArray: '4 6', opacity: 0.8
    }).addTo(allocationLayer);
  });
}

async function loadAll() {
  const [incidents, resources] = await Promise.all([
    api('/api/incidents'),
    api('/api/resources')
  ]);
  renderFeed(incidents);
  renderIncidentsOnMap(incidents);
  renderResourcesOnMap(resources);
  return { incidents, resources };
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadAll().catch((e) => toast(e.message, true));

  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadAll().catch((e) => toast(e.message, true));
  });

  document.getElementById('allocateBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById('allocStatus');
    statusEl.textContent = 'Running allocation…';
    try {
      const result = await api('/api/allocate', { method: 'POST' });
      statusEl.textContent = `${result.assigned} resource(s) assigned`;
      const { incidents, resources } = await loadAll();
      renderAllocationLines(result.allocations.length ? result.allocations : await api('/api/allocations'), incidents, resources);
      toast(`Allocation complete — ${result.assigned} assignment(s) made.`);
    } catch (e) {
      statusEl.textContent = 'Allocation failed';
      toast(e.message, true);
    }
  });
});
