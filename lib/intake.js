// lib/intake.js
// Implements the satellite + citizen "sensor fusion" model discussed in the
// project design: raw reports always land in incident_reports first, and
// are only promoted/merged into the incidents table (the table the
// allocation engine reads from) after a trust rule is satisfied.

const { distanceKm } = require('./geo');

const BASE_CONFIDENCE = {
  satellite: 0.9,
  official: 0.95,
  sensor: 0.7,
  citizen_report: 0.4
};

const CLUSTER_RADIUS_KM = 2;
const CLUSTER_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 hours

function fileReport(store, report) {
  const db = store.load();

  const rawReport = {
    report_id: store.nextId('reports'),
    source_type: report.source_type,
    lat: report.lat,
    lon: report.lon,
    raw_payload: report,
    submitted_by: report.submitted_by || null,
    external_ref: report.external_ref || null,
    created_at: new Date().toISOString()
  };

  // Look for an existing nearby, recent, same-type incident to merge into.
  const now = Date.now();
  const match = db.incidents.find((inc) => {
    if (inc.disaster_type !== report.disaster_type) return false;
    if (inc.status === 'resolved' || inc.status === 'false_alarm') return false;
    const age = now - new Date(inc.created_at).getTime();
    if (age > CLUSTER_WINDOW_MS) return false;
    const d = distanceKm({ lat: inc.lat, lon: inc.lon }, { lat: report.lat, lon: report.lon });
    return d <= CLUSTER_RADIUS_KM;
  });

  let incident;
  if (match) {
    match.verification_count += 1;
    match.people_affected = Math.max(match.people_affected, report.people_affected || 0);
    match.severity_score = Math.max(match.severity_score, report.severity_score || 1);
    // Each additional independent confirmation raises confidence, capped at 0.98.
    match.confidence_score = Math.min(
      0.98,
      Math.max(match.confidence_score, BASE_CONFIDENCE[report.source_type] || 0.4) +
        0.1 * (match.verification_count - 1)
    );
    if (
      match.source_type !== 'satellite' &&
      (report.source_type === 'satellite' || report.source_type === 'official')
    ) {
      match.satellite_source = report.satellite_source || match.satellite_source;
    }
    if (match.confidence_score >= 0.6 && match.status === 'unverified') {
      match.status = 'verified';
    }
    match.updated_at = new Date().toISOString();
    incident = match;
  } else {
    incident = {
      incident_id: store.nextId('incidents'),
      disaster_type: report.disaster_type,
      lat: report.lat,
      lon: report.lon,
      district: report.district || null,
      state: report.state || null,
      severity_score: report.severity_score || 5,
      people_affected: report.people_affected || 0,
      description: report.description || '',
      photo_url: report.photo_url || null,
      source_type: report.source_type,
      confidence_score: BASE_CONFIDENCE[report.source_type] || 0.4,
      verification_count: 1,
      reported_by: report.submitted_by || null,
      satellite_source: report.satellite_source || null,
      status: (report.source_type === 'satellite' || report.source_type === 'official') ? 'verified' : 'unverified',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.incidents.push(incident);
  }

  rawReport.incident_id = incident.incident_id;
  db.incident_reports.push(rawReport);
  store.save();

  return incident;
}

module.exports = { fileReport, BASE_CONFIDENCE, CLUSTER_RADIUS_KM };
