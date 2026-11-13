/* js/dashboard.js
   Rendering Dashboard, polling VATSIM A-CDM, Flight Checklist, Weight & Fuel, Route, Weather, Pager e Firme.
*/

var cdmInterval = null;
var prevCdmState = { tobt: "", tsat: "", ctot: "" };
var isFirstCdmFetch = true;

var isDrawing = false;
var ctx = null;
var canvas = null;

var submitIsDrawing = false;
var submitCtx = null;
var submitCanvas = null;

/* ---------- VATSIM A-CDM API ---------- */
async function fetchCdmData(callsign) {
  if (!callsign) return null;
  try {
    const res = await fetch(`https://api.viffsys.com/ifps/callsign?callsign=${callsign}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("Errore fetch CDM ufficiale:", err);
    return null;
  }
}

/* ---------- NAVIGRAPH ---------- */
function buildNavigraphImportUrl(ofp) {
  if (!ofp || !ofp.origin || !ofp.destination || !ofp.general) return '';
  const origin = `${ofp.origin.icao_code}/${ofp.origin.plan_rwy}`;
  const dest = `${ofp.destination.icao_code}/${ofp.destination.plan_rwy}`;
  const route = `${origin} ${ofp.general.route} ${dest}`;

  const rulesMap = { I: "IFR", V: "VFR", Y: "IFR/VFR", Z: "VFR/IFR" };
  const rules = rulesMap[ofp.atc.flight_rules] || "IFR";

  const title = `${ofp.general.icao_airline || ''}${ofp.general.flight_number || ''}`;
  const cruisingAltitude = ofp.atc.initial_alt || "";
  const alternate = (ofp.alternate && ofp.alternate.icao_code) ? ofp.alternate.icao_code : "";

  const params = new URLSearchParams({ route, title, rules, cruisingAltitude, alternate });
  return `https://charts.navigraph.com/flights/import?${params.toString()}`;
}

/* ---------- TOP FLIGHT INFO BAR ---------- */
function renderFlightInfoBar(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const general = data.general || {};
  const aircraft = data.aircraft || {};
  const origin = data.origin || {};
  const destination = data.destination || {};
  const times = data.times || {};
  const params = data.params || {};

  const fibFlightnum = document.getElementById('fib-flightnum');
  const fibReg = document.getElementById('fib-reg');
  const fibCallsign = document.getElementById('fib-callsign');
  const fibRoute = document.getElementById('fib-route');
  const fibOfp = document.getElementById('fib-ofp');
  const fibOfpdate = document.getElementById('fib-ofpdate');
  const badge = document.getElementById('fib-status');

  if (fibFlightnum) fibFlightnum.textContent = extractCallsign(data);
  if (fibReg) fibReg.textContent = aircraft.reg || '----';
  if (fibCallsign) fibCallsign.textContent = (data.atc && data.atc.callsign) || '----';

  if (fibRoute) {
    fibRoute.innerHTML = `<strong>${origin.icao_code || '----'}</strong> (${unixToHHMM(times.sched_out)}) - <strong>${destination.icao_code || '----'}</strong> (${unixToHHMM(times.sched_in)})`;
  }

  if (fibOfp) fibOfp.textContent = general.release ? `OFP ${general.release}` : 'OFP --';
  if (fibOfpdate) fibOfpdate.textContent = params.time_generated ? formatObsDateTime(new Date(Number(params.time_generated) * 1000).toISOString()) : '--';

  const isAccepted = flight.state && flight.state.accepted;
  if (badge) {
    badge.textContent = isAccepted ? 'CONFIRMED' : 'NOT ACCEPTED';
    badge.className = isAccepted ? 'status-badge accepted' : 'status-badge not-accepted';
  }
}

/* ---------- MAIN DASHBOARD RENDERING ---------- */
function renderDashboard(flight) {
  try {
    const data = flight.raw;
    const general = data.general || {};
    const origin = data.origin || {};
    const destination = data.destination || {};
    const times = data.times || {};
    const aircraft = data.aircraft || {};

    const calcs = getFuelCalculations(data, flight.state);

    const elActype = document.getElementById('fi-header-actype');
    const elFlightnum = document.getElementById('fi-header-flightnum');
    const elReg = document.getElementById('fi-header-reg');
    const elOrig = document.getElementById('fi-orig');
    const elDest = document.getElementById('fi-dest');
    const elAltn = document.getElementById('fi-altn');
    const elFlighttime = document.getElementById('fi-flighttime');
    const elBlocktime = document.getElementById('fi-blocktime');
    const elRwyDep = document.getElementById('fi-rwy-dep');
    const elSid = document.getElementById('fi-sid');
    const elDate = document.getElementById('fi-date');
    const elStd = document.getElementById('fi-std');
    const elRwyArr = document.getElementById('fi-rwy-arr');
    const elStar = document.getElementById('fi-star');
    const elDateArr = document.getElementById('fi-date-arr');
    const elSta = document.getElementById('fi-sta');

    if (elActype) elActype.textContent = aircraft.icaocode || '----';
    if (elFlightnum) elFlightnum.textContent = extractCallsign(data);
    if (elReg) elReg.textContent = aircraft.reg || '----';
    if (elOrig) elOrig.textContent = origin.icao_code || '----';
    if (elDest) elDest.textContent = destination.icao_code || '----';

    // Alternato sincrono
    if (elAltn) elAltn.textContent = calcs.altnIcao ? `(${calcs.altnIcao})` : '';

    if (elFlighttime) elFlighttime.textContent = formatHHMM(times.est_time_enroute || times.sched_time_enroute);
    if (elBlocktime) elBlocktime.textContent = formatHHMM(times.est_block || times.sched_block);

    if (elRwyDep) elRwyDep.textContent = origin.plan_rwy || '--';
    if (elSid) elSid.textContent = general.sid_ident || 'NONE';
    if (elDate) elDate.textContent = formatDateFromUnix(times.sched_out);
    if (elStd) elStd.textContent = unixToHHMM(times.sched_out);

    const etdEl = document.getElementById('fi-etd');
    const etaEl = document.getElementById('fi-eta');
    const deltaEl = document.getElementById('fi-eta-delta');

    function updateDelta(baseUnixIn, calcUnixIn) {
      if (!baseUnixIn || !deltaEl) return;
      const diffMin = Math.round((calcUnixIn - Number(baseUnixIn)) / 60);
      if (diffMin === 0) {
        deltaEl.textContent = '';
      } else if (diffMin < 0) {
        deltaEl.textContent = `-${String(Math.abs(diffMin)).padStart(2, '0')}m`;
        deltaEl.className = 'fi-delta delta-early';
      } else {
        deltaEl.textContent = `+${String(diffMin).padStart(2, '0')}m`;
        deltaEl.className = 'fi-delta delta-late';
      }
    }

    if (cdmInterval) {
      clearInterval(cdmInterval);
      cdmInterval = null;
    }

    const ctotVal = document.getElementById('fi-ctot');
    if (ctotVal) ctotVal.textContent = '-';

    const stdUnix = Number(times.sched_out);
    const staUnix = Number(times.sched_in);

    function refreshCDM() {
      const callsign = (data.atc && data.atc.callsign) || (data.general && data.general.atc_callsign);
      if (!callsign) return;

      fetchCdmData(callsign).then(cdmDataObj => {
        if (cdmDataObj) {
          const cleanTime = (t) => (t && String(t).trim().length >= 4) ? String(t).trim().substring(0, 4) : "";

          let rawCtot = (cdmDataObj.cdmData && cdmDataObj.cdmData.ctot) ? cdmDataObj.cdmData.ctot : cdmDataObj.ctot;
          let rawTsat = (cdmDataObj.cdmData && cdmDataObj.cdmData.tsat) ? cdmDataObj.cdmData.tsat : cdmDataObj.tsat;
          let rawTobt = (cdmDataObj.cdmData && cdmDataObj.cdmData.tobt) ? cdmDataObj.cdmData.tobt : (cdmDataObj.obt || cdmDataObj.tobt);

          const newTobt = cleanTime(rawTobt);
          const newTsat = cleanTime(rawTsat);
          const newCtot = cleanTime(rawCtot);

          if (isFirstCdmFetch) {
            prevCdmState = { tobt: newTobt, tsat: newTsat, ctot: newCtot };
            isFirstCdmFetch = false;
          } else {
            const fmt = (t) => t ? `${t.substring(0, 2)}:${t.substring(2, 4)}z` : "";

            let reason = cdmDataObj.mostPenalizingAirspace || (cdmDataObj.cdmData && cdmDataObj.cdmData.reason) || "";
            let reasonText = reason ? `\nReason: ${reason}` : "";

            if (newCtot && newCtot !== prevCdmState.ctot) addNotification(`SLOT notification: you have a new CTOT at ${fmt(newCtot)}${reasonText}`);
            if (prevCdmState.ctot && !newCtot) addNotification(`SLOT notification: your CTOT has been cancelled`);
            if (newTsat && newTsat !== prevCdmState.tsat) addNotification(`TSAT notification: new TSAT at ${fmt(newTsat)}`);
            if (newTobt && newTobt !== prevCdmState.tobt) addNotification(`TOBT notification: new TOBT at ${fmt(newTobt)}`);

            prevCdmState = { tobt: newTobt, tsat: newTsat, ctot: newCtot };
          }

          if (ctotVal) {
            if (newCtot) {
              ctotVal.textContent = `${newCtot.substring(0, 2)}:${newCtot.substring(2, 4)}z`;
            } else {
              ctotVal.textContent = '-';
            }
          }

          let effectiveEtdUnix = (times.est_out ? Number(times.est_out) : stdUnix);
          if (newTsat) {
            effectiveEtdUnix = parseHHMM(newTsat, stdUnix);
          } else if (newTobt) {
            effectiveEtdUnix = parseHHMM(newTobt, stdUnix);
          }

          if (etdEl) {
            etdEl.textContent = unixToHHMM(effectiveEtdUnix);
            if (effectiveEtdUnix > stdUnix) {
              etdEl.style.color = "var(--orange-text)";
            } else {
              etdEl.style.color = "";
            }
          }

          const delaySecs = effectiveEtdUnix - stdUnix;
          const newEtaUnix = staUnix + delaySecs;

          if (etaEl) etaEl.textContent = unixToHHMM(newEtaUnix);
          updateDelta(staUnix, newEtaUnix);

          // Salva anche nello state per la card My Flights
          if (currentFlightId) {
            updateFlightState(currentFlightId, {
              ctot: newCtot ? `${newCtot.substring(0, 2)}:${newCtot.substring(2, 4)}z` : 'NA',
              effectiveEtd: effectiveEtdUnix,
              effectiveEta: newEtaUnix
            });
          }
        }
      });
    }

    if (etdEl) etdEl.textContent = unixToHHMM(times.est_out || times.sched_out);
    if (etaEl) etaEl.textContent = unixToHHMM(times.est_in || times.sched_in);
    updateDelta(times.sched_in, (times.est_in || times.sched_in));

    refreshCDM();
    cdmInterval = setInterval(refreshCDM, 60000);

    if (elRwyArr) elRwyArr.textContent = destination.plan_rwy || '--';
    if (elStar) elStar.textContent = general.star_ident || 'NONE';
    if (elDateArr) elDateArr.textContent = formatDateFromUnix(times.sched_in);
    if (elSta) elSta.textContent = unixToHHMM(times.sched_in);

    applyAcceptanceUI(flight.state && flight.state.accepted);

    // ---- WEIGHT REATTIVI ANCHE IN DASHBOARD ----
    const w = data.weights || {};
    const setW = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = (val != null) ? val : '---'; };
    setW('w-dow', w.oew);
    setW('w-load', w.payload);
    setW('w-zfw', w.est_zfw);
    setW('w-zfw-limit', w.max_zfw);
    setW('w-tow', Math.round(calcs.updatedTow));
    setW('w-tow-limit', w.max_tow);
    setW('w-lw', Math.round(calcs.updatedLw));
    setW('w-lw-limit', w.max_ldw);

    // ---- FUEL SULLA DASHBOARD SINCRONIZZATO ----
    const tripSec = Number(times.est_time_enroute) || 0;
    const taxiOutSec = Number(times.taxi_out) || 0;

    setW('f-trip-kg', calcs.tripFuel);
    setW('f-mtow-kg', calcs.tkofFuel);
    setW('f-taxi-kg', calcs.taxiFuel);
    setW('f-block-kg', calcs.actualBlockFuel);

    setW('f-landing-time', calcs.estLndTimeSecs > 0 ? formatHHMM(calcs.estLndTimeSecs) : '--:--');
    setW('f-landing-kg', Math.round(calcs.estimatedLandingFuel));

    const elTripTime = document.getElementById('f-trip-time');
    if (elTripTime) elTripTime.textContent = formatHHMM(tripSec);
    const elMtowTime = document.getElementById('f-mtow-time');
    if (elMtowTime) elMtowTime.textContent = calcs.tkofTime ? formatHHMM(calcs.tkofTime) : '--:--';
    const elTaxiTime = document.getElementById('f-taxi-time');
    if (elTaxiTime) elTaxiTime.textContent = taxiOutSec ? formatHHMM(taxiOutSec) : '--:--';

    setW('f-block-time', '--:--');

    let discTimeMaxSecs = calcs.maxDiscKg > 0 ? Math.round((calcs.maxDiscKg / calcs.holdingFuelFlow) * 3600) : 0;
    setW('f-disc-time', discTimeMaxSecs > 0 ? formatHHMM(discTimeMaxSecs) : '--:--');
    setW('f-disc-kg', `${calcs.maxDiscKg} (${calcs.bottleneckReason})`);

    // ---- WEATHER ----
    const wxAirports = {
      origin,
      destination,
      alternate: (function() {
        const alts = getAlternatesList(data);
        return alts[calcs.altnIdx] || getFirstAlternate(data);
      })()
    };

    const wtabOrig = document.getElementById('wx-tab-origin');
    const wtabDest = document.getElementById('wx-tab-destination');
    if (wtabOrig) wtabOrig.textContent = origin.icao_code || 'ORIG';
    if (wtabDest) wtabDest.textContent = destination.icao_code || 'DEST';
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
    if (typeof renderClassicOfpText === 'function') {
      renderClassicOfpText(data);
    }

    // ---- NAVIGRAPH BUTTON ----
    const navBtn = document.getElementById('navigraph-btn');
    if (navBtn) {
      const newNavBtn = navBtn.cloneNode(true);
      navBtn.parentNode.replaceChild(newNavBtn, navBtn);
      newNavBtn.addEventListener('click', () => {
        const url = buildNavigraphImportUrl(data);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      });
    }

  } catch (err) {
    console.error('Errore nel rendering della Dashboard:', err);
  }
}

/* ---------- WEATHER RENDERING (DASHBOARD) ---------- */
function renderWeather(wxAirports, which) {
  const airport = wxAirports[which] || {};
  const setT = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };

  setT('wx-metar-text', airport.metar || 'METAR non disponibile');
  setT('wx-taf-text', airport.taf || 'TAF non disponibile');
  setT('wx-metar-age', formatObsDateTime(airport.metar_time));
  setT('wx-taf-age', airport.taf_time ? `Issued ${formatObsDateTime(airport.taf_time)}` : '');

  const badge = document.getElementById('wx-vmc-badge');
  if (badge) {
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
}

/* ---------- ROUTE MAP & SUMMARY ---------- */
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
    if (img) img.style.display = 'none';
    if (fallback) {
      fallback.style.display = 'block';
      fallback.innerHTML = 'Mappa rotta non disponibile. Controlla che "Maps" sia attivo tra le opzioni del dispatch su SimBrief.';
    }
    return;
  }

  if (img) {
    img.onload = () => { if (fallback) fallback.style.display = 'none'; };
    img.onerror = () => {
      img.style.display = 'none';
      if (fallback) {
        fallback.style.display = 'block';
        fallback.innerHTML = `Impossibile mostrare la mappa qui dentro. <a href="${url}" target="_blank" rel="noopener">Aprila in una nuova scheda</a>.`;
      }
    };
    img.style.display = 'block';
    img.src = url;
  }
}

function renderRouteSummary(data, origin, destination, general) {
  const el = document.getElementById('route-summary');
  if (!el) return;
  const route = general.route || '';
  const routeArray = route.split(' ');

  if (!data.navlog || !data.navlog.fix) {
    el.innerHTML = `<strong>${origin.icao_code || '----'}</strong>/${origin.plan_rwy || '--'} ${route} <strong>${destination.icao_code || '----'}</strong>/${destination.plan_rwy || '--'}`;
    return;
  }

  let fixes = data.navlog.fix;
  if (!Array.isArray(fixes)) fixes = [fixes];

  const tocIndex = fixes.findIndex((f) => (f.ident || '').toUpperCase().includes('TOC'));
  const todIndex = fixes.findIndex((f) => (f.ident || '').toUpperCase().includes('TOD'));

  let currentFL = 0;
  if (tocIndex !== -1 && fixes[tocIndex].altitude_feet) {
    currentFL = Math.round(parseInt(fixes[tocIndex].altitude_feet, 10) / 100);
  } else if (general.initial_altitude) {
    currentFL = Math.round(general.initial_altitude / 100);
  }

  if (currentFL && routeArray.length > 0) {
    routeArray[0] = `${routeArray[0]} F${currentFL}`;
  }

  if (tocIndex !== -1 && todIndex !== -1 && todIndex > tocIndex) {
    let activeFL = currentFL;
    for (let i = tocIndex + 1; i < todIndex; i++) {
      const fix = fixes[i];
      if (!fix.ident || !fix.altitude_feet) continue;
      const fixFL = Math.round(parseInt(fix.altitude_feet, 10) / 100);
      if (fixFL > 0 && fixFL !== activeFL) {
        const idx = routeArray.indexOf(fix.ident);
        if (idx !== -1) {
          routeArray[idx] = `${fix.ident}/F${fixFL}`;
          activeFL = fixFL;
        }
      }
    }
  }

  const finalRoute = routeArray.join(' ');
  el.innerHTML = `<strong>${origin.icao_code || '----'}</strong>/${origin.plan_rwy || '--'} ${finalRoute} <strong>${destination.icao_code || '----'}</strong>/${destination.plan_rwy || '--'}`;
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
  if (!scroller) return;

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
function initSignaturePad() {
  canvas = document.getElementById('signature-pad');
  if (!canvas) return;
  ctx = canvas.getContext('2d');

  function resizeCanvas() {
    if (!canvas.parentElement) return;
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

  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDrawing);
  canvas.addEventListener('touchcancel', stopDrawing);

  return resizeCanvas;
}

function clearSignature() {
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cb = document.getElementById('acceptance-checkbox');
  if (cb) cb.checked = false;
}

function openSignatureModal() {
  const overlay = document.getElementById('signature-modal-overlay');
  const modal = document.getElementById('signature-modal');
  if (overlay) overlay.classList.add('open');
  if (modal) modal.classList.add('open');
  setTimeout(() => {
    const resize = initSignaturePad();
    if (resize) resize();
  }, 50);
}

function closeSignatureModal() {
  const overlay = document.getElementById('signature-modal-overlay');
  const modal = document.getElementById('signature-modal');
  if (overlay) overlay.classList.remove('open');
  if (modal) modal.classList.remove('open');
}

function setupAcceptanceLogic() {
  const btn = document.getElementById('accept-flight-btn');
  if (btn) btn.addEventListener('click', openSignatureModal);

  const cancelBtn = document.getElementById('sig-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    clearSignature();
    closeSignatureModal();
  });

  const saveBtn = document.getElementById('sig-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', () => {
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
  const submitBtn = document.getElementById('submit-flight-btn');

  if (submitBtn) {
    submitBtn.disabled = !isAccepted;
  }

  if (isAccepted) {
    if (btn) {
      btn.textContent = 'Flight Accepted';
      btn.classList.add('btn-accepted');
    }
    if (badge) {
      badge.textContent = 'CONFIRMED';
      badge.className = 'status-badge accepted';
    }
  } else {
    if (btn) {
      btn.textContent = 'Accept Flight';
      btn.classList.remove('btn-accepted');
    }
    if (badge) {
      badge.textContent = 'NOT ACCEPTED';
      badge.className = 'status-badge not-accepted';
    }
  }
}

/* ---------- SUBMIT FLIGHT LOGIC ---------- */
function initSubmitSignaturePad() {
  submitCanvas = document.getElementById('submit-signature-pad');
  if (!submitCanvas) return;
  submitCtx = submitCanvas.getContext('2d');

  function resizeCanvas() {
    if (!submitCanvas.parentElement) return;
    const rect = submitCanvas.parentElement.getBoundingClientRect();
    submitCanvas.width = rect.width;
    submitCanvas.height = rect.height;
    submitCtx.lineCap = 'round';
    submitCtx.lineJoin = 'round';
    submitCtx.lineWidth = 2;
    submitCtx.strokeStyle = getTheme() === 'dark' ? '#fff' : '#000';
  }

  window.addEventListener('resize', resizeCanvas);

  function getPos(e) {
    const rect = submitCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startDrawing(e) {
    submitIsDrawing = true;
    const pos = getPos(e);
    submitCtx.beginPath();
    submitCtx.moveTo(pos.x, pos.y);
    e.preventDefault();
  }

  function draw(e) {
    if (!submitIsDrawing) return;
    const pos = getPos(e);
    submitCtx.lineTo(pos.x, pos.y);
    submitCtx.stroke();
    e.preventDefault();
  }

  function stopDrawing() { submitIsDrawing = false; }

  submitCanvas.addEventListener('mousedown', startDrawing);
  submitCanvas.addEventListener('mousemove', draw);
  submitCanvas.addEventListener('mouseup', stopDrawing);
  submitCanvas.addEventListener('mouseout', stopDrawing);

  submitCanvas.addEventListener('touchstart', startDrawing, { passive: false });
  submitCanvas.addEventListener('touchmove', draw, { passive: false });
  submitCanvas.addEventListener('touchend', stopDrawing);
  submitCanvas.addEventListener('touchcancel', stopDrawing);

  return resizeCanvas;
}

function openSubmitModal() {
  const overlay = document.getElementById('submit-modal-overlay');
  const modal = document.getElementById('submit-modal');
  if (overlay) overlay.classList.add('open');
  if (modal) modal.classList.add('open');
  setTimeout(() => {
    const resize = initSubmitSignaturePad();
    if (resize) resize();
  }, 50);
}

function closeSubmitModal() {
  const overlay = document.getElementById('submit-modal-overlay');
  const modal = document.getElementById('submit-modal');
  if (overlay) overlay.classList.remove('open');
  if (modal) modal.classList.remove('open');
  const cb = document.getElementById('submit-acceptance-checkbox');
  if (cb) cb.checked = false;
  if (submitCtx && submitCanvas) submitCtx.clearRect(0, 0, submitCanvas.width, submitCanvas.height);
}

function setupSubmitLogic() {
  const submitBtn = document.getElementById('submit-flight-btn');
  if (submitBtn) submitBtn.addEventListener('click', openSubmitModal);

  const cancelBtn = document.getElementById('submit-sig-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeSubmitModal);

  const saveBtn = document.getElementById('submit-sig-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    if (currentFlightId) {
      updateFlightState(currentFlightId, {
        submitted: true,
        submittedAt: Date.now()
      });
      showToast("Volo archiviato con successo in 'Submitted'!");
    }
    closeSubmitModal();
    window.location.hash = '#/home';
  });
}
