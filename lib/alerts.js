// lib/alerts.js
// Addresses the recurring failure pattern from the Bihar (2021), Chennai
// (2015), and Uttarakhand (2023) flood-response reviews: alerts were sent
// but nobody could tell who had seen or acted on them. Every alert here
// carries a lifecycle (sent -> acknowledged / escalated), not just a
// send-and-forget message.

const ESCALATION_MINUTES = 10;

function createAlert(store, { incident_id, message, channel, sent_to, sent_to_district }) {
  const db = store.load();
  const alert = {
    alert_id: store.nextId('alerts'),
    incident_id: incident_id || null,
    message,
    channel: channel || 'sms',
    sent_to: sent_to || null,
    sent_to_district: sent_to_district || null,
    delivery_status: 'sent',
    acknowledged_at: null,
    escalated_to: null,
    sent_at: new Date().toISOString()
  };
  db.alerts.push(alert);
  store.save();
  return alert;
}

function acknowledge(store, alertId) {
  const db = store.load();
  const alert = db.alerts.find((a) => a.alert_id === Number(alertId));
  if (!alert) return null;
  alert.delivery_status = 'acknowledged';
  alert.acknowledged_at = new Date().toISOString();
  store.save();
  return alert;
}

// Called periodically; in a real deployment this would be a scheduled job.
function runEscalationSweep(store) {
  const db = store.load();
  const now = Date.now();
  let changed = false;
  for (const alert of db.alerts) {
    if (alert.delivery_status !== 'sent') continue;
    const age = (now - new Date(alert.sent_at).getTime()) / 60000;
    if (age >= ESCALATION_MINUTES) {
      alert.delivery_status = 'escalated';
      alert.escalated_to = alert.sent_to_district
        ? `${alert.sent_to_district} backup officer`
        : 'district backup officer';
      changed = true;
    }
  }
  if (changed) store.save();
}

module.exports = { createAlert, acknowledge, runEscalationSweep, ESCALATION_MINUTES };
