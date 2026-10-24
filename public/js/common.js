// public/js/common.js
// Shared across every page: language toggle (English/Hindi labels), a toast
// helper, and the lightweight first-aid assistant widget referenced in the
// project's design notes (a rule-based guide, not a claimed AI chatbot).

const I18N = {
  en: {
    nav_home: 'Home', nav_report: 'Report incident', nav_dashboard: 'Dashboard',
    nav_resources: 'Resources', nav_alerts: 'Alerts'
  },
  hi: {
    nav_home: 'होम', nav_report: 'घटना दर्ज करें', nav_dashboard: 'डैशबोर्ड',
    nav_resources: 'संसाधन', nav_alerts: 'चेतावनी'
  }
};

function applyLang(lang) {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (I18N[lang] && I18N[lang][key]) el.textContent = I18N[lang][key];
  });
  localStorage.setItem('resq_lang', lang);
}

function initLangToggle() {
  const sel = document.getElementById('langToggle');
  if (!sel) return;
  const saved = localStorage.getItem('resq_lang') || 'en';
  sel.value = saved;
  applyLang(saved);
  sel.addEventListener('change', () => applyLang(sel.value));
}

function toast(message, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---------- First-aid assistant (rule-based, offline, no external API) ----------
const FIRST_AID = {
  bleeding: {
    label: 'Bleeding',
    steps: [
      'Apply firm, direct pressure with a clean cloth.',
      'Keep the injured area raised above heart level if possible.',
      'Do not remove the cloth if it soaks through — add another layer on top.',
      'Seek medical help immediately for deep or heavy bleeding.'
    ]
  },
  burns: {
    label: 'Burns',
    steps: [
      'Cool the burn under running water for at least 10–20 minutes.',
      'Remove jewellery or tight clothing near the burn before swelling starts.',
      'Cover loosely with a clean, non-fluffy cloth.',
      'Do not apply ice, butter, or ointments directly to the burn.'
    ]
  },
  fracture: {
    label: 'Suspected fracture',
    steps: [
      'Keep the injured area still — do not try to realign it.',
      'Support the limb with padding or a splint if one is available.',
      'Apply a cold pack wrapped in cloth to reduce swelling.',
      'Get the person to medical care without putting weight on the injury.'
    ]
  },
  drowning: {
    label: 'Near-drowning',
    steps: [
      'Move the person to dry, stable ground.',
      'Check for breathing; begin CPR immediately if they are not breathing.',
      'Keep them warm and lying on their side if breathing but unconscious.',
      'Call for emergency medical help right away, even if they seem recovered.'
    ]
  },
  flood_safety: {
    label: 'During a flood',
    steps: [
      'Move to higher ground; avoid walking or driving through moving water.',
      'Stay off bridges over fast-moving water.',
      'Disconnect electrical appliances if it is safe to do so.',
      'Keep a battery radio or charged phone on for official updates.'
    ]
  }
};

function initAssistant() {
  const fab = document.getElementById('assistFab');
  const panel = document.getElementById('assistPanel');
  if (!fab || !panel) return;

  const topicsView = panel.querySelector('.assist-topics');
  const detailView = panel.querySelector('.assist-detail');

  fab.addEventListener('click', () => panel.classList.toggle('open'));

  Object.entries(FIRST_AID).forEach(([key, item]) => {
    const btn = document.createElement('button');
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      topicsView.style.display = 'none';
      detailView.style.display = 'block';
      detailView.innerHTML =
        `<button class="btn btn-sm btn-outline" id="assistBack">← Back</button>
         <h4 style="margin-top:10px">${item.label}</h4>
         <ol style="padding-left:18px; color:var(--text-muted)">${item.steps.map((s) => `<li style="margin-bottom:6px">${s}</li>`).join('')}</ol>
         <p class="muted" style="font-size:0.78rem; margin-top:8px">General first-aid guidance only — not a substitute for professional medical care.</p>`;
      document.getElementById('assistBack').addEventListener('click', () => {
        detailView.style.display = 'none';
        topicsView.style.display = 'block';
      });
    });
    topicsView.appendChild(btn);
  });
}

// Counts a number up from 0 — used for the stat panel so figures feel
// measured rather than just appearing, without touching anything decorative.
function animateCount(el, target, duration = 700) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = target;
    return;
  }
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Reveals each pipeline step (and the connecting line) once, as it scrolls
// into view — a single orchestrated moment rather than a fade on every card.
function initScrollReveal() {
  const steps = document.querySelectorAll('.pipeline-step, .pipeline-connector');
  if (!steps.length || !('IntersectionObserver' in window)) {
    steps.forEach((s) => s.classList.add('in-view'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, idx) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('in-view'), idx * 90);
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.35 }
  );
  steps.forEach((s) => io.observe(s));
}

document.addEventListener('DOMContentLoaded', () => {
  initLangToggle();
  initAssistant();
  initScrollReveal();
});
