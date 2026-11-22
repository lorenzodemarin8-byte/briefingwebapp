/* js/utils.js
   Utility, formattazione date/orari, parsing METAR/OFP, Notifiche, Toast e Gestione Tema.
*/

var currentFlightId = null;
var currentAirportsData = [];
var navlogActuals = {};
var notificationsList = [];

/* ---------- TOAST & NOTIFICATIONS ---------- */
function showToast(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  }, 6000);
}

function addNotification(msg) {
  notificationsList.unshift({ text: msg, time: new Date() });
  updateNotifUI();
  showToast(msg);
}

function updateNotifUI() {
  const badge = document.getElementById('notif-badge');
  if (badge) {
    badge.style.display = notificationsList.length > 0 ? 'flex' : 'none';
    badge.textContent = notificationsList.length;
  }
  const container = document.getElementById('notif-list');
  if (!container) return;
  container.innerHTML = '';
  if (notificationsList.length === 0) {
    container.innerHTML = '<p class="hint" style="text-align:center; margin-top:20px;">Nessuna notifica.</p>';
    return;
  }
  notificationsList.forEach(n => {
    const el = document.createElement('div');
    el.className = 'notif-item';
    const timeStr = n.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + 'z';
    el.innerHTML = `<div class="notif-time">${timeStr}</div><div>${n.text.replace(/\n/g, '<br>')}</div>`;
    container.appendChild(el);
  });
}

/* ---------- THEME ---------- */
const SUN_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/><line x1="4.5" y1="4.5" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.5" y2="19.5"/><line x1="4.5" y1="19.5" x2="6.2" y2="17.8"/><line x1="17.8" y1="6.2" x2="19.5" y2="4.5"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/></svg>';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.innerHTML = theme === 'dark' ? MOON_ICON : SUN_ICON;
}

function initTheme() {
  applyTheme(getTheme());
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = getTheme() === 'dark' ? 'light' : 'dark';
      setTheme(next);
      applyTheme(next);
    });
  }
}

/* ---------- FORMATTAZIONE ORARI, DATE E NUMERI ---------- */
function unixToHHMM(unixSeconds) {
  if (!unixSeconds) return '--:--';
  const d = new Date(Number(unixSeconds) * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function minToHHMM(totalMin) {
  if (totalMin === "" || totalMin === null || totalMin === undefined || isNaN(totalMin)) return "--:--";
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hhmmToMin(str) {
  if (!str || !/^\d{1,2}:\d{2}$/.test(str)) return null;
  const parts = str.split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function formatHHMM(totalSeconds) {
  if (!totalSeconds && totalSeconds !== 0) return '--:--';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m`;
}

function formatDateFromUnix(unixSeconds) {
  if (!unixSeconds) return '--';
  const d = new Date(Number(unixSeconds) * 1000);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatDateShortFromUnix(unixSeconds) {
  if (!unixSeconds) return '--';
  const d = new Date(Number(unixSeconds) * 1000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getUTCDate()).padStart(2, '0')} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatLocalTime(unixSeconds, tzOffsetHours) {
  if (!unixSeconds) return '--:--';
  const offset = Number(tzOffsetHours) || 0;
  const d = new Date((Number(unixSeconds) + offset * 3600) * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const sign = offset >= 0 ? `+${offset}` : `${offset}`;
  return `${hh}:${mm} L (UTC${sign})`;
}

function getFirstAlternate(data) {
  if (!data || !data.alternate) return {};
  if (Array.isArray(data.alternate)) return data.alternate[0] || {};
  return data.alternate;
}

function getAlternatesList(data) {
  if (!data || !data.alternate) return [];
  return Array.isArray(data.alternate) ? data.alternate : [data.alternate];
}

function isoToUnix(isoString) {
  if (!isoString) return null;
  const t = Date.parse(isoString);
  return isNaN(t) ? null : Math.floor(t / 1000);
}

function formatObsDateTime(isoString) {
  const unix = isoToUnix(isoString);
  if (!unix) return '--';
  const d = new Date(unix * 1000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}, ${hh}:${mm}z`;
}

function formatNotamDate(dtg) {
  if (!dtg || dtg.length < 12) return 'UFN';
  const y = parseInt(dtg.substring(0, 4), 10);
  const m = parseInt(dtg.substring(4, 6), 10) - 1;
  const d = parseInt(dtg.substring(6, 8), 10);
  const hh = parseInt(dtg.substring(8, 10), 10);
  const mm = parseInt(dtg.substring(10, 12), 10);
  const date = new Date(Date.UTC(y, m, d, hh, mm));
  if (isNaN(date.getTime())) return 'UFN';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(date.getUTCDate()).padStart(2, '0')} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}z`;
}

function parseHHMM(str, baseUnixTimestamp) {
  if (!str) return null;
  const normalized = String(str).trim();
  const match = normalized.match(/^(\d{2}):?(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h > 23 || m > 59 || !Number.isFinite(Number(baseUnixTimestamp))) return null;
  let d = new Date(baseUnixTimestamp * 1000);
  const schedHH = d.getUTCHours();
  d.setUTCHours(h, m, 0, 0);

  if (h < schedHH && (schedHH - h) > 12) {
    d.setUTCDate(d.getUTCDate() + 1);
  } else if (h > schedHH && (h - schedHH) > 12) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return Math.floor(d.getTime() / 1000);
}

function findTocFix(data) {
  const list = data.navlog && data.navlog.fix;
  if (!list) return null;
  const arr = Array.isArray(list) ? list : [list];
  return arr.find((f) => f.ident === 'TOC') || null;
}

function calculateCdmEstimatedTimes(data, state, ctotOverride) {
  const times = (data && data.times) || {};
  const flightState = state || {};
  const scheduledOut = Number(times.sched_out) || 0;
  const scheduledOff = Number(times.sched_off) || scheduledOut;
  const scheduledOn = Number(times.sched_on) || 0;
  const scheduledIn = Number(times.sched_in) || 0;
  const effectiveOut = Number(flightState.effectiveEtd) || Number(times.est_out) || scheduledOut;

  const rawCtot = ctotOverride !== undefined ? ctotOverride : flightState.ctot;
  const ctotText = String(rawCtot || '').replace(/[^0-9]/g, '').slice(0, 4);
  const ctotUnix = ctotText.length === 4 ? parseHHMM(ctotText, scheduledOff || effectiveOut) : null;
  const taxiOut = Math.max(0, Number(times.taxi_out) || 0);
  const enroute = Math.max(0, Number(times.est_time_enroute) || Number(times.sched_time_enroute) || 0);
  const taxiIn = Math.max(0, Number(times.taxi_in) || 0);
  const estimatedOff = ctotUnix || (effectiveOut ? effectiveOut + taxiOut : (scheduledOff || 0));
  const estimatedOn = estimatedOff ? estimatedOff + enroute : (scheduledOn || 0);
  const estimatedIn = estimatedOn ? estimatedOn + taxiIn : (scheduledIn || 0);

  return {
    effectiveOut,
    estimatedOff,
    estimatedOn,
    estimatedIn,
    ctotUnix,
    delaySeconds: scheduledOff && estimatedOff ? estimatedOff - scheduledOff : 0
  };
}

function decodeQCodeCategory(qcode) {
  if (!qcode || qcode.length < 3) return 'AIRPORT';
  const sub2 = qcode.substring(1, 3).toUpperCase();
  if (sub2 === 'PD') return 'SID';
  if (sub2 === 'PA') return 'STAR';
  if (sub2 === 'PI') return 'APPROACH PROCEDURES';
  if (sub2 === 'MR') return 'RUNWAY';
  return 'AIRPORT';
}

function getSimBriefNotamCategory(notam) {
  const valid = new Set(['AIRPORT', 'RUNWAY', 'SID', 'STAR', 'APPROACH PROCEDURES']);
  const provider = String(notam && notam.notam_qcode_category || '').trim()
    .toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const decoded = decodeQCodeCategory(notam && notam.notam_qcode);
  if (decoded !== 'AIRPORT') return decoded;

  const text = String(notam && (notam.notam_report || notam.notam_text) || '').toUpperCase();
  if (/\b(?:OCA|OCH|LPV|LNAV|LNAV\/VNAV|ILS|LOC|LOCALIZER|GLIDE ?SLOPE|DME)\b/.test(text) &&
      /\b(?:APPROACH|RWY|RUNWAY|MINIMA|MINIMUM|MISSED APPROACH|RECEPTION|COVERAGE)\b/.test(text)) {
    return 'APPROACH PROCEDURES';
  }
  return valid.has(provider) ? provider : 'AIRPORT';
}

function computeRunwayWind(r, metarText) {
  if (!metarText) {
    return {
      hw: Number(r.headwind_component),
      xw: Number(r.crosswind_component)
    };
  }

  const match = metarText.match(/\b(\d{3}|VRB)(\d{2,3})(?:G\d{2,3})?KT\b/);
  if (!match) {
    return {
      hw: Number(r.headwind_component),
      xw: Number(r.crosswind_component)
    };
  }

  let rwyHeading = parseFloat(r.magnetic_course || r.true_course);
  if (isNaN(rwyHeading)) {
    const num = parseInt(String(r.identifier).replace(/\D/g, ''), 10);
    if (!isNaN(num)) rwyHeading = num * 10;
    else rwyHeading = 0;
  }

  const spd = parseInt(match[2], 10);
  if (match[1] === 'VRB') {
    return { hw: 0, xw: spd };
  }

  const dir = parseInt(match[1], 10);
  let diff = (dir - rwyHeading) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  const rad = diff * Math.PI / 180;
  const hw = Math.round(spd * Math.cos(rad));
  const xw = Math.round(Math.abs(spd * Math.sin(rad)));

  return { hw, xw };
}

function formatImpact(imp) {
  let bPrefix = 'P', bVal = '0000', tPrefix = 'P', tVal = '0000';
  if (imp) {
    let bDiff = parseInt(imp.burn_difference, 10) || 0;
    let tDiff = parseInt(imp.time_difference, 10) || 0;

    bPrefix = bDiff < 0 ? 'M' : 'P';
    tPrefix = tDiff < 0 ? 'M' : 'P';
    bVal = Math.abs(bDiff).toString().padStart(4, '0');

    let tSec = Math.abs(tDiff);
    let tMins = Math.floor(tSec / 60);
    let h = Math.floor(tMins / 60);
    let m = tMins % 60;
    tVal = String(h).padStart(2, '0') + String(m).padStart(2, '0');
  }
  return { burn: `${bPrefix} ${bVal}`, time: `${tPrefix} ${tVal}` };
}
