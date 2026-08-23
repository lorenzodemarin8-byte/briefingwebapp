/* app.js 
   Routing semplice basato su hash: #/home  |  #/flight/<id>
*/

let currentFlightId = null;

/* ---------- THEME ---------- */
const SUN_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/><line x1="4.5" y1="4.5" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.5" y2="19.5"/><line x1="4.5" y1="19.5" x2="6.2" y2="17.8"/><line x1="17.8" y1="6.2" x2="19.5" y2="4.5"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/></svg>';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  const btn = document.getElementById('theme-toggle');
  btn.innerHTML = theme === 'dark' ? MOON_ICON : SUN_ICON;
}

function initTheme() {
  applyTheme(getTheme());
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  });
}

/* ---------- ROUTING ---------- */
function router() {
  const hash = window.location.hash || '#/home';
  const parts = hash.replace('#/', '').split('/');
  if (parts[0] === 'flight' && parts[1]) {
    currentFlightId = parts[1];
    showDashboard(currentFlightId);
  } else {
    showHome();
  }
}

function showHome() {
  document.getElementById('view-home').style.display = 'block';
  document.getElementById('view-dashboard').style.display = 'none';
  document.getElementById('topbar-title').textContent = 'My Flights';
  document.getElementById('home-nav-btn').style.visibility = 'hidden';
  document.getElementById('flight-info-bar').style.display = 'none';
  document.querySelector('.bottombar').style.display = 'none';
  document.body.classList.remove('in-flight');
  renderFlightsList();
}

function showDashboard(id) {
  const flight = getFlight(id);
  document.getElementById('view-home').style.display = 'none';
  document.getElementById('view-dashboard').style.display = 'block';
  document.getElementById('home-nav-btn').style.visibility = 'visible';
  document.querySelector('.bottombar').style.display = 'flex';
  document.body.classList.add('in-flight');
  if (!flight) {
    document.getElementById('topbar-title').textContent = 'Volo non trovato';
    document.getElementById('flight-info-bar').style.display = 'none';
    return;
  }
  document.getElementById('topbar-title').textContent = 'Dashboard';
  document.getElementById('flight-info-bar').style.display = 'flex';
  renderFlightInfoBar(flight);
  renderDashboard(flight);
  resetPager();
}

function renderFlightInfoBar(flight) {
  const data = flight.raw;
  const general = data.general || {};
  const aircraft = data.aircraft || {};
  const origin = data.origin || {};
  const destination = data.destination || {};
  const times = data.times || {};
  const params = data.params || {};

  document.getElementById('fib-flightnum').textContent = extractCallsign(data);
  document.getElementById('fib-reg').textContent = aircraft.reg || '----';
  document.getElementById('fib-callsign').textContent = (data.atc && data.atc.callsign) || '----';
  
  document.getElementById('fib-route').innerHTML = 
    `<strong>${origin.icao_code || '----'}</strong> (${unixToHHMM(times.sched_out)}) - <strong>${destination.icao_code || '----'}</strong> (${unixToHHMM(times.sched_in)})`;
  
  document.getElementById('fib-ofp').textContent = general.release ? `OFP ${general.release}` : 'OFP --';
  document.getElementById('fib-ofpdate').textContent = params.time_generated ? formatObsDateTime(new Date(Number(params.time_generated) * 1000).toISOString()) : '--';

  const isAccepted = flight.state && flight.state.accepted;
  const badge = document.getElementById('fib-status');
  badge.textContent = isAccepted ? 'CONFIRMED' : 'NOT ACCEPTED';
  badge.className = isAccepted ? 'status-badge accepted' : 'status-badge not-accepted';
}

/* ---------- HOME: LISTA VOLI ---------- */
function renderFlightsList() {
  const all = getFlights();
  const ids = Object.keys(all);
  const list = document.getElementById('flights-list');
  const empty = document.getElementById('empty-state');
  list.innerHTML = '';
  if (ids.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  ids
    .sort((a, b) => (all[b].fetchedAt || 0) - (all[a].fetchedAt || 0))
    .forEach((id) => {
      const flight = all[id];
      const data = flight.raw;
      const orig = data.origin ? data.origin.icao_code : '????';
      const dest = data.destination ? data.destination.icao_code : '????';
      const callsign = extractCallsign(data);
      const std = data.times ? unixToHHMM(data.times.sched_out) : '--:--';

      const card = document.createElement('div');
      card.className = 'flight-card';
      card.innerHTML = `
        <div class="fc-callsign">${callsign}</div>
        <div class="fc-route">${orig} → ${dest}</div>
        <div class="fc-meta">STD ${std} - ${flight.state && flight.state.accepted ? 'Accepted' : 'Not accepted'}</div>
      `;
      card.addEventListener('click', () => {
        window.location.hash = `#/flight/${id}`;
      });
      list.appendChild(card);
    });
}

/* ---------- SIMBRIEF REFRESH ---------- */
async function handleRefresh() {
  const input = document.getElementById('sb-username');
  const status = document.getElementById('sb-status');
  const username = input.value.trim();

  if (!username) {
    status.textContent = 'Inserisci prima uno username o Pilot ID SimBrief.';
    return;
  }
  status.textContent = 'Recupero l\'ultimo OFP da SimBrief...';

  try {
    const data = await fetchSimBriefOFP(username);
    const id = extractFlightId(data);
    saveFlight(id, {
      raw: data,
      fetchedAt: Date.now(),
      state: (getFlight(id) && getFlight(id).state) || { accepted: false, fuelOrdered: false }
    });
    status.textContent = `Volo importato: ${extractCallsign(data)} (${data.origin ? data.origin.icao_code : '?'} → ${data.destination ? data.destination.icao_code : '?'})`;
    renderFlightsList();
  } catch (err) {
    console.error(err);
    status.textContent = 'Errore: ' + err.message;
  }
}

/* ---------- DASHBOARD: formattazione ---------- */
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

function getFirstAlternate(data) {
  if (!data.alternate) return {};
  if (Array.isArray(data.alternate)) return data.alternate[0] || {};
  return data.alternate;
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

/* ---------- DASHBOARD: rendering ---------- */
function renderDashboard(flight) {
  try {
    const data = flight.raw;
    const general = data.general || {};
    const origin = data.origin || {};
    const destination = data.destination || {};
    const alternate = data.alternate || {};
    const times = data.times || {};
    const aircraft = data.aircraft || {};

    document.getElementById('fi-header-actype').textContent = aircraft.icaocode || '----';
    document.getElementById('fi-header-flightnum').textContent = extractCallsign(data);
    document.getElementById('fi-header-reg').textContent = aircraft.reg || '----';

    document.getElementById('fi-orig').textContent = origin.icao_code || '----';
    document.getElementById('fi-dest').textContent = destination.icao_code || '----';
    document.getElementById('fi-altn').textContent = alternate.icao_code ? `(${alternate.icao_code})` : '';

    document.getElementById('fi-flighttime').textContent = formatHHMM(times.est_time_enroute || times.sched_time_enroute);
    document.getElementById('fi-blocktime').textContent = formatHHMM(times.est_block || times.sched_block);

    document.getElementById('fi-rwy-dep').textContent = origin.plan_rwy || '--';
    document.getElementById('fi-sid').textContent = general.sid_ident || 'NONE';
    document.getElementById('fi-date').textContent = formatDateFromUnix(times.sched_out);
    document.getElementById('fi-std').textContent = unixToHHMM(times.sched_out);
    document.getElementById('fi-etd').textContent = unixToHHMM(times.est_out || times.sched_out);

    document.getElementById('fi-rwy-arr').textContent = destination.plan_rwy || '--';
    document.getElementById('fi-star').textContent = general.star_ident || 'NONE';
    document.getElementById('fi-date-arr').textContent = formatDateFromUnix(times.sched_in);
    document.getElementById('fi-sta').textContent = unixToHHMM(times.sched_in);
    document.getElementById('fi-eta').textContent = unixToHHMM(times.est_in || times.sched_in);

    const deltaEl = document.getElementById('fi-eta-delta');
    if (times.sched_in && times.est_in) {
      const diffMin = Math.round((Number(times.est_in) - Number(times.sched_in)) / 60);
      if (diffMin === 0) {
        deltaEl.textContent = '';
      } else if (diffMin < 0) {
        deltaEl.textContent = `-${String(Math.abs(diffMin)).padStart(2, '0')}m`;
        deltaEl.className = 'fi-delta delta-early';
      } else {
        deltaEl.textContent = `+${String(diffMin).padStart(2, '0')}m`;
        deltaEl.className = 'fi-delta delta-late';
      }
    } else {
      deltaEl.textContent = '';
    }

    applyAcceptanceUI(flight.state && flight.state.accepted);

    // ---- WEIGHT ----
    const w = data.weights || {};
    document.getElementById('w-dow').textContent = w.oew ?? '---';
    document.getElementById('w-dow-limit').textContent = '---';
    document.getElementById('w-load').textContent = w.payload ?? '---';
    document.getElementById('w-load-limit').textContent = '---';
    document.getElementById('w-zfw').textContent = w.est_zfw ?? '---';
    document.getElementById('w-zfw-limit').textContent = w.max_zfw ?? '---';
    document.getElementById('w-tow').textContent = w.est_tow ?? '---';
    document.getElementById('w-tow-limit').textContent = w.max_tow ?? '---';
    document.getElementById('w-lw').textContent = w.est_ldw ?? '---';
    document.getElementById('w-lw-limit').textContent = w.max_ldw ?? '---';

    // ---- FUEL ----
    const f = data.fuel || {};
    const altnForTime = getFirstAlternate(data);
    const tripSec = Number(times.est_time_enroute) || 0;
    const contSec = Number(times.contfuel_time) || 0;
    const finresSec = Number(times.reserve_time) || 0;
    const altnSec = Number(altnForTime.ete) || 0;
    const taxiOutSec = Number(times.taxi_out) || 0;
    const minTakeoffSec = tripSec + contSec + finresSec + altnSec;

    document.getElementById('f-trip-time').textContent = formatHHMM(tripSec);
    document.getElementById('f-trip-kg').textContent = f.enroute_burn ?? '---';
    document.getElementById('f-mtow-time').textContent = minTakeoffSec ? formatHHMM(minTakeoffSec) : '--:--';
    document.getElementById('f-mtow-kg').textContent = f.min_takeoff ?? '---';
    document.getElementById('f-taxi-time').textContent = taxiOutSec ? formatHHMM(taxiOutSec) : '--:--';
    document.getElementById('f-taxi-kg').textContent = f.taxi ?? '---';
    document.getElementById('f-block-time').textContent = '--:--';
    document.getElementById('f-block-kg').textContent = f.plan_ramp ?? '---';
    document.getElementById('f-landing-time').textContent = '--:--';
    document.getElementById('f-landing-kg').textContent = f.plan_landing ?? '---';
    document.getElementById('f-disc-time').textContent = '--:--';
    document.getElementById('f-disc-kg').textContent = (w.max_ldw != null && w.est_ldw != null) ? (w.max_ldw - w.est_ldw) : '---';

    // ---- WEATHER ----
    const altn = getFirstAlternate(data);
    const wxAirports = { origin, destination, alternate: altn };
    document.getElementById('wx-tab-origin').textContent = origin.icao_code || 'ORIG';
    document.getElementById('wx-tab-destination').textContent = destination.icao_code || 'DEST';
    renderWeather(wxAirports, 'origin');

    document.querySelectorAll('.wx-tab').forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll('.wx-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        renderWeather(wxAirports, tab.dataset.wx);
      };
    });

    // ---- ROUTE ----
    renderRouteMap(data);
    renderRouteSummary(data, origin, destination, general);

  } catch (err) {
    console.error('Errore nel rendering della Dashboard:', err);
  }
}

function renderWeather(wxAirports, which) {
  const airport = wxAirports[which] || {};
  document.getElementById('wx-metar-text').textContent = airport.metar || 'METAR non disponibile';
  document.getElementById('wx-taf-text').textContent = airport.taf || 'TAF non disponibile';
  document.getElementById('wx-metar-age').textContent = formatObsDateTime(airport.metar_time);
  document.getElementById('wx-taf-age').textContent = airport.taf_time ? `Issued ${formatObsDateTime(airport.taf_time)}` : '';

  const badge = document.getElementById('wx-vmc-badge');
  const category = (airport.metar_category || '').toLowerCase();
  if (category === 'vfr' || category === 'mvfr') {
    badge.textContent = 'VMC';
    badge.className = 'wx-badge vmc';
  } else if (category === 'ifr' || category === 'lifr') {
    badge.textContent = 'IMC';
    badge.className = 'wx-badge imc';
  } else {
    badge.textContent = '--';
    badge.className = 'wx-badge';
  }
}

function getMapList(data) {
  const images = data.images || {};
  if (!images.map) return [];
  return Array.isArray(images.map) ? images.map : [images.map];
}

function findMapUrl(data, nameContains) {
  const images = data.images || {};
  if (!images.directory) return null;
  const entry = getMapList(data).find((m) => (m.name || '').toLowerCase().includes(nameContains));
  return entry ? images.directory + entry.link : null;
}

function renderRouteMap(data) {
  const img = document.getElementById('route-map-img');
  const fallback = document.getElementById('route-map-fallback');
  const url = findMapUrl(data, 'route');

  if (!url) {
    img.style.display = 'none';
    fallback.style.display = 'block';
    fallback.innerHTML = 'Mappa rotta non disponibile. Controlla che "Maps" sia attivo tra le opzioni del dispatch su SimBrief.';
    return;
  }

  img.onload = () => { fallback.style.display = 'none'; };
  img.onerror = () => {
    img.style.display = 'none';
    fallback.style.display = 'block';
    fallback.innerHTML = `Impossibile mostrare la mappa qui dentro. <a href="${url}" target="_blank" rel="noopener">Aprila in una nuova scheda</a>.`;
  };
  img.style.display = 'block';
  img.src = url;
}

function renderRouteSummary(data, origin, destination, general) {
  const el = document.getElementById('route-summary');
  let route = general.route || '';
  let initialAltStr = '';
  let currentFL = 0;

  // Assicurati che navlog e fix esistano
  if (!data.navlog || !data.navlog.fix) {
    el.innerHTML = `<strong>${origin.icao_code || '----'}</strong>/${origin.plan_rwy || '--'} ${route} <strong>${destination.icao_code || '----'}</strong>/${destination.plan_rwy || '--'}`;
    return;
  }

  // Normalizza i fix in un array
  let fixes = Array.isArray(data.navlog.fix) ? data.navlog.fix : [data.navlog.fix];
  
  // Trova il primissimo livello di volo valido nel navlog per l'altitudine iniziale
  for (let fix of fixes) {
    if (fix.altitude_feet) {
      currentFL = Math.round(parseInt(fix.altitude_feet, 10) / 100);
      initialAltStr = 'F' + currentFL;
      break;
    }
  }

  // Dividiamo la rotta in array di parole per innestare gli step
  let routeArray = route.split(' ');
  let activeFL = currentFL;

  // Analizza i fix uno ad uno per trovare i salti di altitudine (Step Climbs)
  fixes.forEach(fix => {
    if (fix.ident && fix.altitude_feet) {
      let fixFL = Math.round(parseInt(fix.altitude_feet, 10) / 100);
      
      // C'è stato un salto di livello?
      if (fixFL > 0 && fixFL !== activeFL) {
        
        // Cerca se questo fix è una parola singola all'interno della rotta
        for (let i = 0; i < routeArray.length; i++) {
          if (routeArray[i] === fix.ident) {
            routeArray[i] = `${fix.ident}/F${fixFL}`; // Innesta il livello
            activeFL = fixFL; // Aggiorna il livello corrente
            break;
          }
        }
      }
    }
  });

  // Ricomponi la rotta
  route = routeArray.join(' ');

  el.innerHTML = `<strong>${origin.icao_code || '----'}</strong>/${origin.plan_rwy || '--'} ${initialAltStr} ${route} <strong>${destination.icao_code || '----'}</strong>/${destination.plan_rwy || '--'}`;
}
/* ---------- PAGER ---------- */
function resetPager() {
  const scroller = document.getElementById('pager-scroll');
  if (scroller) scroller.scrollLeft = 0;
  document.querySelectorAll('.pager-dot').forEach((d, i) => d.classList.toggle('active', i === 0));
}

function initPager() {
  const scroller = document.getElementById('pager-scroll');
  const dots = document.querySelectorAll('.pager-dot');

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      const pageIndex = Number(dot.dataset.page);
      scroller.scrollTo({ left: pageIndex * scroller.clientWidth, behavior: 'smooth' });
    });
  });

  scroller.addEventListener('scroll', () => {
    const pageIndex = Math.round(scroller.scrollLeft / scroller.clientWidth);
    dots.forEach((d, i) => d.classList.toggle('active', i === pageIndex));
  });
}

/* ---------- SIGNATURE PAD E ACCETTAZIONE ---------- */
let isDrawing = false;
let ctx = null;
let canvas = null;

function initSignaturePad() {
  canvas = document.getElementById('signature-pad');
  if(!canvas) return;
  ctx = canvas.getContext('2d');
  
  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = getTheme() === 'dark' ? '#fff' : '#000';
  }
  
  window.addEventListener('resize', resizeCanvas);
  
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
  
  function startDrawing(e) {
    isDrawing = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    e.preventDefault();
  }
  
  function draw(e) {
    if (!isDrawing) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    e.preventDefault();
  }
  
  function stopDrawing() { isDrawing = false; }
  
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
  
  canvas.addEventListener('touchstart', startDrawing, {passive: false});
  canvas.addEventListener('touchmove', draw, {passive: false});
  canvas.addEventListener('touchend', stopDrawing);
  canvas.addEventListener('touchcancel', stopDrawing);
  
  return resizeCanvas;
}

function clearSignature() {
  if(ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('acceptance-checkbox').checked = false;
}

function openSignatureModal() {
  document.getElementById('signature-modal-overlay').classList.add('open');
  document.getElementById('signature-modal').classList.add('open');
  setTimeout(() => {
    const resize = initSignaturePad();
    if(resize) resize();
  }, 50); 
}

function closeSignatureModal() {
  document.getElementById('signature-modal-overlay').classList.remove('open');
  document.getElementById('signature-modal').classList.remove('open');
}

function setupAcceptanceLogic() {
  document.getElementById('accept-flight-btn').addEventListener('click', openSignatureModal);
  
  document.getElementById('sig-cancel-btn').addEventListener('click', () => {
    clearSignature();
    closeSignatureModal();
  });
  
  document.getElementById('sig-save-btn').addEventListener('click', () => {
    if (currentFlightId) {
      updateFlightState(currentFlightId, { accepted: true });
    }
    closeSignatureModal();
    applyAcceptanceUI(true);
  });
}

function applyAcceptanceUI(isAccepted) {
  const btn = document.getElementById('accept-flight-btn');
  const badge = document.getElementById('fib-status');
  
  if (isAccepted) {
    btn.textContent = 'Flight Accepted';
    btn.classList.add('btn-accepted');
    if(badge) {
      badge.textContent = 'CONFIRMED';
      badge.className = 'status-badge accepted';
    }
  } else {
    btn.textContent = 'Accept Flight';
    btn.classList.remove('btn-accepted');
    if(badge) {
      badge.textContent = 'NOT ACCEPTED';
      badge.className = 'status-badge not-accepted';
    }
  }
}

/* ---------- INTERAZIONI GENERALI ---------- */
function openDrawer() {
  document.getElementById('side-drawer').classList.add('open');
  document.getElementById('drawer-overlay').classList.add('open');
}

function closeDrawer() {
  document.getElementById('side-drawer').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('open');
}

function initInteractions() {
  const lastId = localStorage.getItem('mbriefing_sb_id');
  if (lastId) document.getElementById('sb-username').value = lastId;

  document.getElementById('menu-toggle').addEventListener('click', openDrawer);
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);
  document.getElementById('sb-refresh').addEventListener('click', async () => {
    await handleRefresh();
    localStorage.setItem('mbriefing_sb_id', document.getElementById('sb-username').value.trim());
  });

  document.getElementById('content-refresh-btn').addEventListener('click', async () => {
    const saved = localStorage.getItem('mbriefing_sb_id');
    if (!saved) {
      openDrawer();
      return;
    }
    document.getElementById('sb-username').value = saved;
    await handleRefresh();
  });

  document.getElementById('home-nav-btn').addEventListener('click', () => {
    window.location.hash = '#/home';
  });

  initPager();
  setupAcceptanceLogic();

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('topbar-title').textContent = btn.textContent;
    });
  });
}

/* ---------- BOOT ---------- */
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initInteractions();
  router();
});
