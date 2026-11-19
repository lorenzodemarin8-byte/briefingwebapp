/* js/briefing.js
   Navigazione sidebar Briefing, General, Fuel UI, MEL/CDL, Crew Alert/Bulletins, ATC, Dispatch, WX/RAIM/NOTAM, Classic OFP.
*/

function normalizeSimBriefList(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function extractAirportsData(data) {
  currentAirportsData = [];
  if (!data) return;

  const allNotams = normalizeSimBriefList(data.notams && data.notams.notamdrec);

  function getAptNotams(icao) {
    if (!icao) return [];
    return allNotams.filter(n =>
      n && (n.cns_location_id === icao || n.icao_id === icao || n.location_icao === icao)
    );
  }

  function addAirportRecord(apt, type, runways) {
    if (!apt || !apt.icao_code) return;
    currentAirportsData.push({
      type,
      icao: apt.icao_code,
      iata: apt.iata_code,
      icao_code: apt.icao_code,
      plan_rwy: apt.plan_rwy,
      name: apt.name,
      metar_ceiling: apt.metar_ceiling,
      metar_visibility: apt.metar_visibility,
      metar: apt.metar,
      metar_time: apt.metar_time,
      metar_category: apt.metar_category,
      taf: apt.taf,
      taf_time: apt.taf_time,
      runways: runways || null,
      notams: getAptNotams(apt.icao_code)
    });
  }

  if (data.origin) {
    addAirportRecord(data.origin, 'Departure',
      data.tlr && data.tlr.takeoff ? data.tlr.takeoff.runway : null);
  }
  if (data.destination) {
    addAirportRecord(data.destination, 'Arrival',
      data.tlr && data.tlr.landing ? data.tlr.landing.runway : null);
  }

  normalizeSimBriefList(data.alternate).forEach(alt =>
    addAirportRecord(alt, 'Arrival Alternate'));
  normalizeSimBriefList(data.takeoff_altn).forEach(alt =>
    addAirportRecord(alt, 'Takeoff Alternate'));
  normalizeSimBriefList(data.enroute_altn).forEach(alt =>
    addAirportRecord(alt, 'Enroute Alternate'));
  normalizeSimBriefList(data.enroute_station).forEach(station =>
    addAirportRecord(station, 'Enroute Station'));
}

function getBriefingVisitedPages() {
  const flight = getFlight(currentFlightId);
  const pages = flight && flight.state && flight.state.briefingVisitedPages;
  return Array.isArray(pages) ? pages : [];
}

function markBriefingPageVisited(pageKey, item) {
  if (!pageKey) return;
  const flight = getFlight(currentFlightId);
  if (!flight) return;
  const pages = getBriefingVisitedPages();
  if (!pages.includes(pageKey)) {
    pages.push(pageKey);
    updateFlightState(currentFlightId, { briefingVisitedPages: pages });
  }
  if (item) item.classList.remove('unread');
}

function briefingPageButton(label, pageKey, attributes, extraClass) {
  const visited = getBriefingVisitedPages().includes(pageKey);
  return '<button type="button" class="briefing-page-item ' + (visited ? 'visited' : 'unread') +
    ' ' + (extraClass || '') + '" data-page-key="' + escapeNotamHtml(pageKey) + '" ' +
    (attributes || '') + '>' + label + '</button>';
}

function briefingAirportButton(apt, index) {
  const code = [apt.icao || '????', apt.iata].filter(Boolean).join('/');
  const pageKey = 'airport:' + (apt.icao || index);
  const visited = getBriefingVisitedPages().includes(pageKey);
  return '<button type="button" class="briefing-page-item briefing-airport-item ' +
    (visited ? 'visited' : 'unread') + '" data-page-key="' + escapeNotamHtml(pageKey) +
    '" data-apt-index="' + index + '">' +
    '<span class="briefing-airport-code">' + escapeNotamHtml(code) + '</span>' +
    '<span class="briefing-airport-type">' + escapeNotamHtml(apt.type || '') + '</span></button>';
}

function briefingGroupMarkup(title, key, innerHtml, expanded) {
  return '<div class="briefing-subsection">' +
    '<button type="button" class="briefing-subsection-toggle" data-menu-target="' + key +
    '" aria-expanded="' + String(Boolean(expanded)) + '">' +
    '<span>' + title + '</span>' +
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' +
    '</button><div class="briefing-subsection-content" id="' + key + '" ' +
    (expanded ? '' : 'hidden') + '>' + innerHtml + '</div></div>';
}

function briefingSectionMarkup(title, key, innerHtml, expanded) {
  return '<section class="briefing-section">' +
    '<button type="button" class="briefing-section-toggle" data-menu-target="' + key +
    '" aria-expanded="' + String(Boolean(expanded)) + '">' +
    '<span>' + title + '</span>' +
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' +
    '</button><div class="briefing-section-content" id="' + key + '" ' +
    (expanded ? '' : 'hidden') + '>' + innerHtml + '</div></section>';
}

function getPlanHtmlText(data, sectionName) {
  const html = data && data.text && data.text.plan_html;
  if (!html) return '';
  let sectionHtml = String(html);
  const markerPattern = /<!--BKMK\/\/\/([^]*?)\/\/\/\d+-->/g;
  const markers = [];
  let match;
  while ((match = markerPattern.exec(sectionHtml)) !== null) {
    markers.push({ name: match[1].trim(), end: markerPattern.lastIndex, index: match.index });
  }
  const marker = markers.find(x => x.name.toLowerCase() === String(sectionName).toLowerCase());
  if (marker) {
    const next = markers.find(x => x.index > marker.index);
    sectionHtml = sectionHtml.slice(marker.end, next ? next.index : sectionHtml.length);
  }
  const holder = document.createElement('div');
  holder.innerHTML = sectionHtml;
  return (holder.textContent || holder.innerText || '').replace(/\r/g, '');
}

function addFirNameToMap(map, code, name) {
  const id = String(code || '').trim().toUpperCase();
  const firName = String(name || '').trim().replace(/\*+$/, '').trim();
  if (/^[A-Z0-9]{4}$/.test(id) && firName) map[id] = firName;
}

function collectFirNamesFromPlanHtml(data, map) {
  const text = getPlanHtmlText(data, 'NOTAM') + '\n' + getPlanHtmlText(data, 'Weather');
  let match;
  const inline = /^([A-Z0-9]{4})\s{2,}(.+?\bFIR(?:\/UIR)?\b.*)$/gim;
  while ((match = inline.exec(text)) !== null) addFirNameToMap(map, match[1], match[2]);

  const namedThenCode = /^([A-Z][A-Z /()-]+?\bFIR(?:\/UIR)?)[* \t]*\n\s*-?([A-Z0-9]{4})\b/gim;
  while ((match = namedThenCode.exec(text)) !== null) addFirNameToMap(map, match[2], match[1]);
}

function getFlightFirEntries(data) {
  const fixes = normalizeSimBriefList(data && data.navlog && data.navlog.fix);
  const names = Object.create(null);
  const orderedCodes = [];
  const seen = new Set();

  fixes.forEach(fix => {
    const crossings = normalizeSimBriefList(fix && fix.fir_crossing && fix.fir_crossing.fir);
    crossings.forEach(crossing => {
      if (!crossing || typeof crossing !== 'object') return;
      addFirNameToMap(names, crossing.fir_icao || crossing.icao || crossing.code,
        crossing.fir_name || crossing.name);
    });

    const rawFir = fix && fix.fir;
    const code = typeof rawFir === 'string' ? rawFir.trim().toUpperCase()
      : rawFir && typeof rawFir === 'object'
        ? String(rawFir.fir_icao || rawFir.icao || rawFir.code || '').trim().toUpperCase()
        : '';
    if (code && /^[A-Z0-9]{4}$/.test(code) && !seen.has(code)) {
      seen.add(code);
      orderedCodes.push(code);
    }

    crossings.forEach(crossing => {
      const crossingCode = String(crossing && (crossing.fir_icao || crossing.icao || crossing.code) || '').trim().toUpperCase();
      if (crossingCode && /^[A-Z0-9]{4}$/.test(crossingCode) && !seen.has(crossingCode)) {
        seen.add(crossingCode);
        orderedCodes.push(crossingCode);
      }
    });
  });

  // ATC's filed enroute FIRs are a fallback for layouts without FIR tags on navlog fixes.
  if (!orderedCodes.length && data && data.atc) {
    normalizeSimBriefList(data.atc.fir_enroute).forEach(value => {
      const code = String(value || '').trim().toUpperCase();
      if (/^[A-Z0-9]{4}$/.test(code) && !seen.has(code)) {
        seen.add(code);
        orderedCodes.push(code);
      }
    });
  }

  collectFirNamesFromPlanHtml(data, names);
  normalizeSimBriefList(data && data.sigmets && data.sigmets.sigmet).forEach(sigmet => {
    if (sigmet) addFirNameToMap(names, sigmet.fir, sigmet.fir_name);
  });

  return orderedCodes.map(code => ({ code, name: names[code] || '' }));
}

function getFirNotams(data, firCode) {
  const records = normalizeSimBriefList(data && data.notams && data.notams.notamdrec);
  const code = String(firCode || '').toUpperCase();
  return records.filter(notam => notam &&
    String(notam.cns_location_id || notam.icao_id || '').toUpperCase() === code);
}

function getFirEntriesForCurrentFlight() {
  const flight = getFlight(currentFlightId);
  return getFlightFirEntries(flight && flight.raw ? flight.raw : {});
}

function renderBriefingMenu() {
  const menuEl = document.getElementById('briefing-menu');
  if (!menuEl) return;
  const flight = getFlight(currentFlightId);
  const data = flight && flight.raw ? flight.raw : {};
  const mainAirports = currentAirportsData.map((apt, index) => ({ apt, index }))
    .filter(x => ['Departure', 'Arrival', 'Arrival Alternate'].includes(x.apt.type));
  const enrouteAirports = currentAirportsData.map((apt, index) => ({ apt, index }))
    .filter(x => ['Enroute Alternate', 'Enroute Station'].includes(x.apt.type));
  const firs = getFlightFirEntries(data);

  const flightPlanDefs = [
    ['General', 'section:general'], ['Fuel', 'section:fuel'],
    ['MEL/CDL Information', 'section:mel'], ['ATC', 'section:atc'],
    ['Dispatch Info', 'section:dispatch'], ['Crew Alert and Bulletin', 'section:crew'],
    ['Classic OFP', 'section:classic-ofp'], ['TLR', 'section:tlr']
  ];
  const flightPlan = flightPlanDefs.map(def =>
    briefingPageButton(def[0], def[1], 'data-section="' + def[0] + '"')).join('');

  const journeyDefs = [
    ['Flight Times and Fuel', 'section:journey-times', 'Flight Times and Fuel'],
    ['Duty Assignments', 'section:duty-assignments', 'Duty Assignment & Delays']
  ];
  const journeyLog = journeyDefs.map(def =>
    briefingPageButton(def[0], def[1], 'data-section="' + def[2] + '"')).join('');

  const mainAirportItems = mainAirports.map(x => briefingAirportButton(x.apt, x.index)).join('') ||
    '<div class="briefing-airport-empty">No main airports available</div>';
  const enrouteItems = enrouteAirports.map(x => briefingAirportButton(x.apt, x.index)).join('') ||
    '<div class="briefing-airport-empty">No enroute airports available</div>';
  const firItems = firs.map(fir => {
    const code = escapeNotamHtml(fir.code);
    const name = escapeNotamHtml(fir.name || 'Flight Information Region');
    const label = '<span class="briefing-airport-code">' + code + '</span>' +
      '<span class="briefing-airport-type">' + name + '</span>';
    const attrs = 'data-fir-code="' + code + '" data-fir-name="' + name + '"';
    return briefingPageButton(label, 'fir:' + fir.code, attrs, 'briefing-airport-item briefing-fir-item');
  }).join('') || '<div class="briefing-airport-empty">No FIR data available</div>';

  const wxNotams = '<div class="briefing-global-filter notam-segmented" role="group" aria-label="Filter airports and FIRs">' +
    '<button type="button" class="notam-filter-btn ' + (activeNotamFilter === 'all' ? 'active' : '') + '" data-notam-filter="all">All</button>' +
    '<button type="button" class="notam-filter-btn ' + (activeNotamFilter === 'flagged' ? 'active' : '') + '" data-notam-filter="flagged">Flagged</button>' +
    '</div>' +
    briefingGroupMarkup('Main Airports', 'brf-main-airports', mainAirportItems, true) +
    briefingGroupMarkup('Enroute Airports', 'brf-enroute-airports', enrouteItems, true) +
    briefingGroupMarkup('FIRs', 'brf-firs', firItems, false);

  const chartLabels = ['UAD', 'SIGWX with Route', 'VAA/TCA', 'CDA', 'SIGWX',
    'Satellite Maps', 'Radar', 'Surface Fronts', 'Dispatcher Maps', 'Vertical Profile'];
  const charts = chartLabels.map(label => briefingPageButton(label, 'chart:' + label,
    'data-placeholder-title="' + escapeNotamHtml(label) + '"')).join('');

  menuEl.innerHTML =
    briefingSectionMarkup('Flight Plan', 'brf-flight-plan', flightPlan, true) +
    briefingSectionMarkup('Journey Log', 'brf-journey-log', journeyLog, true) +
    briefingSectionMarkup('WX / RAIM / NOTAM', 'brf-wx-raim-notam', wxNotams, true) +
    briefingSectionMarkup('Charts', 'brf-charts', charts, false) +
    '<section class="briefing-section briefing-empty-section"><div class="briefing-section-title">Added Contents</div></section>' +
    '<section class="briefing-section briefing-empty-section"><div class="briefing-section-title">Other Documents</div></section>' +
    '<section class="briefing-section briefing-empty-section"><div class="briefing-section-title">Attachments</div></section>';

  menuEl.querySelectorAll('[data-menu-target]').forEach(button => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.menuTarget);
      if (!target) return;
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      target.hidden = expanded;
    });
  });

  bindNotamFilterControls();
  applyBriefingAirportMenuFilter();
  bindBriefingTabs();
}

function applyBriefingAirportMenuFilter() {
  const flaggedIds = getFlaggedNotamIds();
  const flight = getFlight(currentFlightId);
  const data = flight && flight.raw ? flight.raw : {};
  document.querySelectorAll('#briefing-menu .briefing-airport-item').forEach(item => {
    let hasFlagged = false;
    if (item.dataset.firCode) {
      hasFlagged = getFirNotams(data, item.dataset.firCode)
        .some(notam => flaggedIds.includes(String(notam.notam_id || 'UNKNOWN')));
    } else {
      const apt = currentAirportsData[Number(item.dataset.aptIndex)];
      hasFlagged = Boolean(apt && Array.isArray(apt.notams) &&
        apt.notams.some(notam => flaggedIds.includes(String(notam.notam_id || 'UNKNOWN'))));
    }
    item.style.display = activeNotamFilter === 'flagged' && !hasFlagged ? 'none' : '';
  });
}

function hideAllBriefingPages() {
  const ids = [
    'briefing-general-container', 'briefing-fuel-container', 'briefing-atc-container',
    'briefing-dispatch-container', 'briefing-airport-container', 'briefing-mel-container',
    'briefing-crew-alert-container', 'briefing-journey-times-container',
    'briefing-journey-delays-container', 'classic-ofp-tools', 'classic-ofp-viewport',
    'briefing-placeholder'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function selectBriefingPage(item) {
  if (!item) return;
  document.querySelectorAll('.briefing-page-item.active').forEach(el => el.classList.remove('active'));
  item.classList.add('active');
  markBriefingPageVisited(item.dataset.pageKey, item);
  hideAllBriefingPages();

  const title = document.getElementById('topbar-title');
  const flight = getFlight(currentFlightId);
  const section = item.dataset.section;
  const aptIndex = item.dataset.aptIndex;
  const firCode = item.dataset.firCode;
  const placeholderTitle = item.dataset.placeholderTitle;

  if (firCode) {
    const fir = getFlightFirEntries(flight && flight.raw ? flight.raw : {}).find(x => x.code === firCode);
    const firName = (fir && fir.name) || item.dataset.firName || 'Flight Information Region';
    if (title) title.textContent = firCode + ' - ' + firName;
    const airportContainer = document.getElementById('briefing-airport-container');
    if (airportContainer) airportContainer.style.display = 'flex';
    renderFirSection(firCode, firName);
    return;
  }

  if (aptIndex !== undefined) {
    const apt = currentAirportsData[Number(aptIndex)];
    if (!apt) return;
    const titleText = (apt.icao || '????') + (apt.iata ? '/' + apt.iata : '') +
      (apt.name ? ' - ' + apt.name : '');
    if (title) title.textContent = titleText;
    const airportContainer = document.getElementById('briefing-airport-container');
    if (airportContainer) airportContainer.style.display = 'flex';
    renderAirportSection(Number(aptIndex));
    return;
  }

  if (title) title.textContent = placeholderTitle || section || item.textContent.trim();
  if (section === 'General') {
    const el = document.getElementById('briefing-general-container');
    if (el) el.style.display = 'flex';
    renderGeneralSection(flight);
  } else if (section === 'Fuel') {
    const el = document.getElementById('briefing-fuel-container');
    if (el) el.style.display = 'flex';
    renderFuelSection(flight);
  } else if (section === 'MEL/CDL Information') {
    const el = document.getElementById('briefing-mel-container');
    if (el) el.style.display = 'flex';
  } else if (section === 'ATC') {
    const el = document.getElementById('briefing-atc-container');
    if (el) el.style.display = 'flex';
    renderAtcSection(flight);
  } else if (section === 'Dispatch Info') {
    const el = document.getElementById('briefing-dispatch-container');
    if (el) el.style.display = 'flex';
    renderDispatchSection(flight);
  } else if (section === 'Crew Alert and Bulletin') {
    const el = document.getElementById('briefing-crew-alert-container');
    if (el) el.style.display = 'flex';
    renderCrewAlertSection(flight);
  } else if (section === 'Flight Times and Fuel') {
    const el = document.getElementById('briefing-journey-times-container');
    if (el) el.style.display = 'flex';
    if (typeof renderJourneyTimes === 'function') renderJourneyTimes(flight);
  } else if (section === 'Duty Assignment & Delays') {
    const el = document.getElementById('briefing-journey-delays-container');
    if (el) el.style.display = 'flex';
    if (typeof renderJourneyDelays === 'function') renderJourneyDelays(flight);
  } else if (section === 'Classic OFP') {
    const tools = document.getElementById('classic-ofp-tools');
    const viewport = document.getElementById('classic-ofp-viewport');
    if (tools) tools.style.display = 'flex';
    if (viewport) viewport.style.display = 'block';
    renderClassicOfpText(flight && flight.raw);
    initClassicOfpAnnotationTools(flight);
  } else {
    const placeholder = document.getElementById('briefing-placeholder');
    if (placeholder) placeholder.style.display = 'block';
  }
}

function bindBriefingTabs() {
  const menu = document.getElementById('briefing-menu');
  if (!menu || menu.dataset.pageNavigationBound === 'true') return;

  // Delegate clicks from the stable menu container so regenerated page buttons remain interactive.
  menu.dataset.pageNavigationBound = 'true';
  menu.addEventListener('click', event => {
    const target = event.target && event.target.closest
      ? event.target.closest('.briefing-page-item')
      : null;
    if (!target || !menu.contains(target)) return;
    selectBriefingPage(target);
  });
}

function openBriefingGeneral() {
  const generalItem = document.querySelector('#briefing-menu .briefing-page-item[data-section="General"]');
  if (generalItem) selectBriefingPage(generalItem);
}


function renderGeneralSection(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const general = data.general || {};
  const aircraft = data.aircraft || {};
  const origin = data.origin || {};
  const destination = data.destination || {};
  const times = data.times || {};
  const fuel = data.fuel || {};
  const atc = data.atc || {};
  const toc = findTocFix(data);

  const setT = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };

  setT('gen-dep', origin.iata_code ? `${origin.icao_code}/${origin.iata_code}` : (origin.icao_code || '----'));
  setT('gen-arr', destination.iata_code ? `${destination.icao_code}/${destination.iata_code}` : (destination.icao_code || '----'));
  setT('gen-callsign', atc.callsign || '—');
  const depL = origin.timezone !== undefined ? ` (${formatLocalTime(times.sched_out, origin.timezone)})` : '';
  const arrL = destination.timezone !== undefined ? ` (${formatLocalTime(times.sched_in, destination.timezone)})` : '';
  setT('gen-std', `${unixToHHMM(times.sched_out)}z${depL}`);
  setT('gen-sta', `${unixToHHMM(times.sched_in)}z${arrL}`);
  setT('gen-actype', aircraft.name || aircraft.icaocode || '—');
  setT('gen-reg', aircraft.reg || '—');
  const machStr = general.cruise_mach ? `M${general.cruise_mach}` : '';
  const ciStr = general.costindex ? `CI ${general.costindex}` : '';
  setT('gen-crzsys', [machStr, ciStr].filter(Boolean).join(' / ') || general.cruise_profile || '—');
  setT('gen-gnddist', general.route_distance ? `${general.route_distance}NM` : '—');
  setT('gen-airdist', general.air_distance ? `${general.air_distance}NM` : '—');
  setT('gen-tocwind', toc ? `${toc.wind_dir}°/${toc.wind_spd}KT` : '—');

  let avgWindStr = '—';
  if (general.avg_wind_dir && general.avg_wind_spd) {
    avgWindStr = `${general.avg_wind_dir}°/${parseInt(general.avg_wind_spd, 10)}KT`;
  }
  setT('gen-avgwind', avgWindStr);

  let avgWcStr = '—';
  if (general.avg_wind_comp) {
    let wcStr = String(general.avg_wind_comp).toUpperCase();
    let isNegative = wcStr.includes('M') || wcStr.includes('-');
    let num = Math.abs(parseInt(wcStr.replace(/[^\d]/g, ''), 10));
    if (!isNaN(num)) {
      avgWcStr = (isNegative ? 'M ' : 'P ') + num.toString().padStart(3, '0');
    }
  }
  setT('gen-avgwc', avgWcStr);

  let initialAltStr = '—';
  if (general.initial_altitude) {
    let m = String(general.initial_altitude).match(/\d+/);
    if (m) {
      let n = parseInt(m[0], 10);
      if (n >= 1000) n = Math.round(n / 100);
      initialAltStr = n.toString();
    }
  }
  setT('gen-alt', initialAltStr);

  if (toc && toc.oat_isa_dev !== undefined) {
    const isa = Number(toc.oat_isa_dev);
    const sign = isa >= 0 ? 'P ' : 'M ';
    const val = Math.abs(isa).toString().padStart(3, '0');
    setT('gen-tocisa', `${sign}${val}`);
  } else {
    setT('gen-tocisa', '—');
  }

  setT('gen-avgff', fuel.avg_fuel_flow ? `${fuel.avg_fuel_flow}` : '—');

  if (aircraft.fuelfactor) {
    const bias = (Number(aircraft.fuelfactor) - 1) * 100;
    const sign = bias >= 0 ? 'P ' : 'M ';
    setT('gen-fuelbias', `${sign}${Math.abs(bias).toFixed(1)}`);
  } else {
    setT('gen-fuelbias', '—');
  }

  setT('gen-tkofaltn', (data.takeoff_altn && data.takeoff_altn.icao_code) || '-');
}

function setupWeightLimitCheck(inputId, opId, structId, weightKey) {
  const inp = document.getElementById(inputId);
  if (!inp) return;

  const flight = getFlight(currentFlightId);
  const savedWeights = (flight && flight.state && flight.state.actualWeights) || {};

  const newInp = inp.cloneNode(true);
  inp.parentNode.replaceChild(newInp, inp);

  if (weightKey && savedWeights[weightKey]) {
    newInp.value = savedWeights[weightKey];
  }

  const checkLimit = () => {
    newInp.classList.remove('limit-exceeded');
    const val = parseFloat(newInp.value);
    if (isNaN(val)) return;

    let opLim = opId ? parseFloat(document.getElementById(opId).textContent) : NaN;
    let strLim = structId ? parseFloat(document.getElementById(structId).textContent) : NaN;

    if ((!isNaN(opLim) && val > opLim) || (!isNaN(strLim) && val > strLim)) {
      newInp.classList.add('limit-exceeded');
    }
  };

  checkLimit();

  newInp.addEventListener('input', (e) => {
    checkLimit();
    if (weightKey && flight) {
      if (!flight.state) flight.state = {};
      if (!flight.state.actualWeights) flight.state.actualWeights = {};
      flight.state.actualWeights[weightKey] = e.target.value;
      updateFlightState(currentFlightId, { actualWeights: flight.state.actualWeights });

      renderFuelSection(flight);
    }
  });
}

function renderFuelSection(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const dest = data.destination || {};
  const orig = data.origin || {};
  const alternates = getAlternatesList(data);

  const savedFuel = (flight.state && flight.state.fuelState) || {};
  const setT = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };

  const calcs = getFuelCalculations(data, flight.state);

  // Pesi aggiornati reattivamente
  setT('gen-w-dow-plan', data.weights.oew || '—');
  setT('gen-w-load-plan', data.weights.payload || '—');
  setT('gen-w-zfw-plan', data.weights.est_zfw || '—');
  setT('gen-w-tow-plan', Math.round(calcs.updatedTow));
  setT('gen-w-lw-plan', Math.round(calcs.updatedLw));
  setT('gen-w-zfw-struct', data.weights.max_zfw || '—');
  setT('gen-w-tow-struct', data.weights.max_tow_struct || data.weights.max_tow || '—');
  setT('gen-w-lw-struct', data.weights.max_ldw || '—');

  let opTow = '—';
  if (data.tlr && data.tlr.takeoff && data.tlr.takeoff.runway) {
    let rwyList = Array.isArray(data.tlr.takeoff.runway) ? data.tlr.takeoff.runway : [data.tlr.takeoff.runway];
    let rwy = rwyList.find(r => String(r.identifier).padStart(2, '0') === String(data.origin && data.origin.plan_rwy).padStart(2, '0'));
    if (rwy && rwy.max_weight) opTow = rwy.max_weight;
  }
  setT('gen-w-tow-op', opTow);

  let opLw = '—';
  if (data.tlr && data.tlr.landing && data.tlr.landing.runway) {
    let rwyList = Array.isArray(data.tlr.landing.runway) ? data.tlr.landing.runway : [data.tlr.landing.runway];
    let rwy = rwyList.find(r => String(r.identifier).padStart(2, '0') === String(data.destination && data.destination.plan_rwy).padStart(2, '0'));
    if (rwy) {
      let cond = data.tlr.landing.conditions && data.tlr.landing.conditions.surface_condition;
      if (cond === 'wet' && rwy.max_weight_wet) opLw = rwy.max_weight_wet;
      else if (rwy.max_weight_dry) opLw = rwy.max_weight_dry;
      else if (rwy.max_weight) opLw = rwy.max_weight;
    }
  }
  setT('gen-w-lw-op', opLw);

  const savedWeights = (flight.state && flight.state.actualWeights) || {};
  const loadInp = document.getElementById('gen-w-load-act');
  if (loadInp) {
    const newLoadInp = loadInp.cloneNode(true);
    loadInp.parentNode.replaceChild(newLoadInp, loadInp);
    newLoadInp.value = savedWeights.load || '';
    newLoadInp.addEventListener('input', (e) => {
      if (!flight.state) flight.state = {};
      if (!flight.state.actualWeights) flight.state.actualWeights = {};
      flight.state.actualWeights.load = e.target.value;
      updateFlightState(currentFlightId, { actualWeights: flight.state.actualWeights });
    });
  }

  setupWeightLimitCheck('gen-w-zfw-act', null, 'gen-w-zfw-struct', 'zfw');
  setupWeightLimitCheck('gen-w-tow-act', 'gen-w-tow-op', 'gen-w-tow-struct', 'tow');
  setupWeightLimitCheck('gen-w-lw-act', 'gen-w-lw-op', 'gen-w-lw-struct', 'lw');

  // Dati Carburante
  setT('brf-f-dest', dest.icao_code || '');
  setT('brf-f-orig', orig.icao_code || '');

  setT('brf-f-trip-fuel', calcs.tripFuel);
  setT('brf-f-trip-time', formatHHMM(calcs.tripTime));
  setT('brf-f-cont-fuel', calcs.contFuel);
  setT('brf-f-cont-time', formatHHMM(calcs.contTime));
  setT('brf-f-finres-fuel', calcs.finresFuel);
  setT('brf-f-finres-time', formatHHMM(calcs.finresTime));
  setT('brf-f-taxi-fuel', calcs.taxiFuel);
  setT('brf-f-taxi-time', formatHHMM(calcs.taxiTime));

  const discInfoContainer = document.getElementById('brf-f-max-disc-container');
  if (discInfoContainer) {
    discInfoContainer.innerHTML = `Maximum Discretionary: <strong>${calcs.maxDiscKg} kg</strong>, <strong>${calcs.bottleneckReason}</strong>`;
  }

  const sel = document.getElementById('brf-f-altn-select');
  if (sel) {
    sel.innerHTML = '';
    if (alternates.length > 0) {
      alternates.forEach((alt, idx) => {
        let opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = alt.icao_code || `ALT${idx + 1}`;
        sel.appendChild(opt);
      });
    } else {
      let opt = document.createElement('option');
      opt.value = '-1';
      opt.textContent = 'NONE';
      sel.appendChild(opt);
    }
    if (savedFuel.altnIndex !== undefined) {
      sel.value = savedFuel.altnIndex;
    }
  }

  const blockInput = document.getElementById('brf-block-input');
  const orderBtn = document.getElementById('brf-order-btn');
  const discInput = document.getElementById('brf-disc-fuel-input');
  const discTimeVal = document.getElementById('brf-disc-time-val');
  const discReason = document.getElementById('brf-disc-reason-input');

  let isBlockFuelManual = savedFuel.blockFuelManual !== undefined
    ? savedFuel.blockFuelManual === true
    : (savedFuel.blockFuel !== undefined && savedFuel.blockFuel !== "");

  function saveCurrentFuelState(isOrdered) {
    const f = getFlight(currentFlightId);
    if (!f) return;
    if (!f.state) f.state = {};
    if (!f.state.fuelState) f.state.fuelState = {};

    if (isOrdered !== undefined) {
      f.state.fuelState.fuelOrdered = isOrdered;
    }
    const bInp = document.getElementById('brf-block-input');
    const dInp = document.getElementById('brf-disc-fuel-input');
    const rInp = document.getElementById('brf-disc-reason-input');
    const aSel = document.getElementById('brf-f-altn-select');

    if (bInp) f.state.fuelState.blockFuel = bInp.value;
    f.state.fuelState.blockFuelManual = isBlockFuelManual;
    if (dInp) f.state.fuelState.discFuel = dInp.value;
    if (rInp) f.state.fuelState.discReason = rInp.value;
    if (aSel) f.state.fuelState.altnIndex = aSel.value;
    updateFlightState(currentFlightId, { fuelState: f.state.fuelState });

    renderDashboard(f);
  }

  function updateFuelCalcs() {
    const currentCalcs = getFuelCalculations(data, flight.state);

    setT('brf-f-altn-fuel', currentCalcs.altnFuel);
    setT('brf-f-altn-time', formatHHMM(currentCalcs.altnTime));
    setT('brf-f-tkof-fuel', currentCalcs.tkofFuel);
    setT('brf-f-tkof-time', formatHHMM(currentCalcs.tkofTime));
    setT('brf-f-minblock-fuel', Math.round(currentCalcs.minBlockFuel));

    const blockInputEl = document.getElementById('brf-block-input');
    if (!isBlockFuelManual && blockInputEl) {
      blockInputEl.value = currentCalcs.actualBlockFuel;
    }

    setT('brf-f-estlnd-fuel', Math.round(currentCalcs.estimatedLandingFuel));
    const estLndTimeEl = document.getElementById('brf-f-estlnd-time');
    if (estLndTimeEl) {
      estLndTimeEl.textContent = `(${formatHHMM(currentCalcs.estLndTimeSecs)})`;
    }

    setT('brf-f-totfinres-fuel', Math.round(currentCalcs.totalReserveFuel));
    setT('brf-f-totfinres-time', '(' + formatHHMM(currentCalcs.totalReserveTime) + ')');

    setT('gen-w-tow-plan', Math.round(currentCalcs.updatedTow));
    setT('gen-w-lw-plan', Math.round(currentCalcs.updatedLw));

    const orderBtnEl = document.getElementById('brf-order-btn');
    const wasOrdered = flight.state && flight.state.fuelState && flight.state.fuelState.fuelOrdered;
    if (orderBtnEl) {
      if (wasOrdered) {
        orderBtnEl.classList.add('btn-ordered');
        orderBtnEl.textContent = 'ORDER SENT';
      } else {
        orderBtnEl.classList.remove('btn-ordered');
        orderBtnEl.textContent = 'ORDER';
      }
    }

    checkFuelLimits(data, flight.state);
  }

  if (sel) {
    const newSel = sel.cloneNode(true);
    sel.parentNode.replaceChild(newSel, sel);
    newSel.addEventListener('change', () => {
      isBlockFuelManual = false;
      if (!flight.state) flight.state = {};
      if (!flight.state.fuelState) flight.state.fuelState = {};
      flight.state.fuelState.blockFuel = '';
      flight.state.fuelState.blockFuelManual = false;
      flight.state.fuelState.altnIndex = newSel.value;
      updateFuelCalcs();
      saveCurrentFuelState();
    });
  }

  if (discInput) {
    const newDisc = discInput.cloneNode(true);
    discInput.parentNode.replaceChild(newDisc, discInput);
    newDisc.value = savedFuel.discFuel || '';

    if (calcs.discTimeSecs > 0) {
      if (discTimeVal) discTimeVal.textContent = formatHHMM(calcs.discTimeSecs);
    } else {
      if (discTimeVal) discTimeVal.textContent = '--:--';
    }

    newDisc.addEventListener('input', () => {
      let val = Number(newDisc.value);
      if (val > 0 && calcs.holdingFuelFlow > 0) {
        let secs = Math.round((val / calcs.holdingFuelFlow) * 3600);
        if (discTimeVal) discTimeVal.textContent = formatHHMM(secs);
      } else {
        if (discTimeVal) discTimeVal.textContent = '--:--';
      }
      isBlockFuelManual = false;
      if (!flight.state) flight.state = {};
      if (!flight.state.fuelState) flight.state.fuelState = {};
      // Discard stale manual block fuel so the engine recomputes the new total.
      flight.state.fuelState.blockFuel = '';
      flight.state.fuelState.blockFuelManual = false;
      flight.state.fuelState.discFuel = newDisc.value;
      updateFuelCalcs();
      saveCurrentFuelState();
    });
  }

  if (discReason) {
    const newReason = discReason.cloneNode(true);
    discReason.parentNode.replaceChild(newReason, discReason);
    newReason.value = savedFuel.discReason || '';
    newReason.addEventListener('input', () => {
      checkFuelLimits(data, flight.state);
      saveCurrentFuelState();
    });
  }

  if (blockInput) {
    const newBlockInput = blockInput.cloneNode(true);
    blockInput.parentNode.replaceChild(newBlockInput, blockInput);
    if (isBlockFuelManual && savedFuel.blockFuel !== undefined && savedFuel.blockFuel !== '') {
      newBlockInput.value = savedFuel.blockFuel;
    } else {
      newBlockInput.value = calcs.actualBlockFuel;
    }
    newBlockInput.addEventListener('input', () => {
      isBlockFuelManual = true;
      if (!flight.state) flight.state = {};
      if (!flight.state.fuelState) flight.state.fuelState = {};
      flight.state.fuelState.blockFuel = newBlockInput.value;
      flight.state.fuelState.blockFuelManual = true;
      updateFuelCalcs();
      saveCurrentFuelState();
    });
  }

  if (orderBtn) {
    const newOrderBtn = orderBtn.cloneNode(true);
    orderBtn.parentNode.replaceChild(newOrderBtn, orderBtn);
    if (savedFuel.fuelOrdered) {
      newOrderBtn.classList.add('btn-ordered');
      newOrderBtn.textContent = 'ORDER SENT';
    }
    newOrderBtn.addEventListener('click', () => {
      if (!checkFuelLimits(data, flight.state)) {
        showToast("Fuel limits check failed. Please adjust values before ordering.");
        return;
      }
      newOrderBtn.classList.add('btn-ordered');
      newOrderBtn.textContent = 'ORDER SENT';
      saveCurrentFuelState(true);
      showToast("Fuel Order inviato con successo!");
    });
  }

  // Tasto Reset in Fuel
  const resetBtn = document.getElementById('brf-fuel-reset-btn');
  if (resetBtn) {
    const newResetBtn = resetBtn.cloneNode(true);
    resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
    newResetBtn.addEventListener('click', () => {
      if (!flight.state) flight.state = {};
      flight.state.fuelState = {
        altnIndex: 0,
        discFuel: '',
        discReason: '',
        blockFuel: '',
        blockFuelManual: false,
        fuelOrdered: false
      };
      isBlockFuelManual = false;
      updateFlightState(currentFlightId, { fuelState: flight.state.fuelState });
      renderFuelSection(flight);
      renderDashboard(flight);
      showToast("Fuel values reset to original OFP dispatch.");
    });
  }

  // Operational Impacts strip & popup modal
  const impacts = data.impacts || {};
  const wUp = impacts.zfw_plus_1000 || impacts.plus_1000 || impacts.weight_up || null;
  const wDn = impacts.zfw_minus_1000 || impacts.minus_1000 || impacts.weight_down || null;
  const fUp = impacts.plus_2000ft || impacts.plus_2000 || impacts.level_up || null;
  const fDn = impacts.minus_2000ft || impacts.minus_2000 || impacts.level_down || null;
  const sDn = impacts.lower_ci || impacts.speed_down || impacts.m54 || null;
  const sUp = impacts.higher_ci || impacts.speed_up || impacts.p54 || null;

  const fmtUp = formatImpact(wUp);
  const fmtDn = formatImpact(wDn);

  const summaryText = document.getElementById('brf-impacts-summary-text');
  if (summaryText) {
    summaryText.textContent = `ZFW INCR 1000 KG TKOF ${fmtUp.burn} KG / ZFW DECR 1000 KG TKOF ${fmtDn.burn} KG`;
  }

  function rowHtml(col1, col2, imp) {
    const fmt = formatImpact(imp);
    return `<tr>
      <td class="imp-bold">${col1}</td>
      <td>${col2}</td>
      <td>TRIP ${fmt.burn} kgs</td>
      <td>TIME ${fmt.time}</td>
    </tr>`;
  }

  let impHtml = '';
  impHtml += rowHtml('WEIGHT CHANGE', 'UP 1.0', wUp);
  impHtml += rowHtml('', 'DN 1.0', wDn);
  impHtml += '<tr class="brf-row-separator"><td colspan="4"></td></tr>';
  impHtml += rowHtml('FL CHANGE', '2000 ABOVE', fUp);
  impHtml += rowHtml('', '2000 BELOW', fDn);
  impHtml += '<tr class="brf-row-separator"><td colspan="4"></td></tr>';
  impHtml += rowHtml('SPEED CHANGE', 'CI 0', sDn);
  impHtml += rowHtml('', 'CI 100', sUp);

  const tBody = document.getElementById('brf-impacts-tbody');
  if (tBody) tBody.innerHTML = impHtml;

  const openModalBtn = document.getElementById('brf-open-impacts-modal-btn');
  const closeModalBtn = document.getElementById('impacts-modal-close');
  const impactsModal = document.getElementById('impacts-modal');
  const impactsOverlay = document.getElementById('impacts-modal-overlay');

  if (openModalBtn) {
    openModalBtn.onclick = () => {
      if (impactsModal && impactsOverlay) {
        impactsModal.classList.add('open');
        impactsOverlay.classList.add('open');
      }
    };
  }
  if (closeModalBtn) {
    closeModalBtn.onclick = () => {
      if (impactsModal && impactsOverlay) {
        impactsModal.classList.remove('open');
        impactsOverlay.classList.remove('open');
      }
    };
  }
  if (impactsOverlay) {
    impactsOverlay.onclick = () => {
      if (impactsModal) impactsModal.classList.remove('open');
      impactsOverlay.classList.remove('open');
    };
  }

  updateFuelCalcs();
}

function renderAtcSection(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const atc = data.atc || {};
  const atcText = atc.flightplan_text || 'ATC Flight Plan non disponibile.';
  const atcEl = document.getElementById('brf-atc-text');
  if (atcEl) atcEl.textContent = atcText.trim();
}

function renderDispatchSection(flight) {
  if (!flight) return;
  const data = flight.raw || {};
  const general = data.general || {};
  const rmk = (general.dx_rmk && general.dx_rmk.trim() !== '') ? general.dx_rmk : 'NONE';
  const dxEl = document.getElementById('brf-dispatch-text');
  if (dxEl) dxEl.textContent = rmk;
}

function extractCrewMessages(planHtml) {
  if (!planHtml) return { alert: 'NIL', bulletin: 'NIL' };
  const holder = document.createElement('div');
  holder.innerHTML = planHtml;
  const pre = holder.querySelector('pre');
  // Read the whole plan document: SimBrief page-break headings can close the original PRE element.
  const text = holder.textContent || (pre ? pre.textContent : '');
  const alertMarker = /={3,}\s*CREW ALERT\s*={3,}/i;
  const bulletinMarker = /={3,}\s*CREW BULLETIN\s*={3,}/i;
  const alertMatch = alertMarker.exec(text);
  const bulletinMatch = bulletinMarker.exec(text);
  if (!alertMatch || !bulletinMatch || bulletinMatch.index <= alertMatch.index) {
    return { alert: 'NIL', bulletin: 'NIL' };
  }
  const alertStart = alertMatch.index + alertMatch[0].length;
  const bulletinStart = bulletinMatch.index + bulletinMatch[0].length;
  const afterBulletin = text.slice(bulletinStart);
  const routeIndex = afterBulletin.search(/\n\s*Route\s*(?:\n|$)/i);
  let alert = text.slice(alertStart, bulletinMatch.index);
  let bulletin = routeIndex >= 0 ? afterBulletin.slice(0, routeIndex) : afterBulletin;
  const clean = value => value
    .replace(/^\s*\n+/, '')
    .replace(/\n\s*=+\s*$/gm, '')
    .replace(/\s+$/, '')
    .trim();
  alert = clean(alert);
  bulletin = clean(bulletin);
  return { alert: alert || 'NIL', bulletin: bulletin || 'NIL' };
}

function renderCrewAlertSection(flight) {
  const data = flight && flight.raw ? flight.raw : {};
  const planHtml = data.text && data.text.plan_html;
  const messages = extractCrewMessages(planHtml);
  const alertEl = document.getElementById('brf-crew-alert-text');
  const bulletinEl = document.getElementById('brf-crew-bulletin-text');
  if (alertEl) alertEl.textContent = messages.alert;
  if (bulletinEl) bulletinEl.textContent = messages.bulletin;
}

function renderAirportSection(index) {
  const flight = getFlight(currentFlightId);
  if (!flight) return;
  if (!flight.state.flaggedNotams) flight.state.flaggedNotams = [];

  const apt = currentAirportsData[index];
  if (!apt) return;

  const setT = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  const weatherType = apt.type === 'Departure' ? 'origin'
    : apt.type === 'Arrival' ? 'destination' : 'alternate';
  const metrics = getAirportWeatherMetrics(flight.raw || {}, weatherType, apt);

  setT('brf-apt-param-ceiling', metrics.ceiling);
  setT('brf-apt-param-vis', metrics.visibility);
  setT('brf-apt-param-hwc', metrics.hwc);
  setT('brf-apt-param-cwc', metrics.cwc);
  setT('brf-apt-metar-text', apt.metar || 'METAR non disponibile');
  setT('brf-apt-taf-text', apt.taf || 'TAF non disponibile');
  setT('brf-apt-metar-age', formatObsDateTime(apt.metar_time));
  setT('brf-apt-taf-age', apt.taf_time ? `Issued ${formatObsDateTime(apt.taf_time)}` : '');

  setVmcBadge(document.getElementById('brf-apt-vmc-badge'), metrics);

  // Runway widget: collapsed by default, with a user-controlled disclosure button.
  const rwyWidget = document.getElementById('brf-apt-rwy-widget');
  const rwyTbody = document.getElementById('brf-apt-rwy-tbody');
  const rwyContent = document.getElementById('brf-apt-rwy-content');
  const rwyToggle = document.getElementById('brf-apt-rwy-toggle');
  if (rwyWidget && rwyContent && rwyToggle) {
    if ((apt.type === 'Departure' || apt.type === 'Arrival') && apt.runways) {
      rwyWidget.style.display = 'flex';
      rwyContent.style.display = 'none';
      rwyToggle.setAttribute('aria-expanded', 'false');
      rwyToggle.title = 'Mostra piste';
      rwyToggle.onclick = () => {
        const expanded = rwyToggle.getAttribute('aria-expanded') === 'true';
        rwyToggle.setAttribute('aria-expanded', String(!expanded));
        rwyContent.style.display = expanded ? 'none' : 'block';
        rwyToggle.title = expanded ? 'Mostra piste' : 'Nascondi piste';
      };
      if (rwyTbody) {
        rwyTbody.innerHTML = '';
        const rwyList = Array.isArray(apt.runways) ? apt.runways : [apt.runways];
        rwyList.forEach(r => {
          const rName = r.identifier ? 'RW' + String(r.identifier).padStart(2, '0') : '---';
          const rLenFt = parseFloat(r.length || r.length_tora || r.length_lda);
          const rLen = !isNaN(rLenFt) ? Math.round(rLenFt * 0.3048) + ' m' : '---';
          const rElev = r.elevation ? r.elevation + ' ft' : '---';
          const rMag = r.magnetic_course || '---';
          const rTrue = r.true_course || '---';
          const windComps = computeRunwayWind(r, apt.metar);
          const hwRaw = windComps.hw;
          let hwVal = '---', hwClass = 'wind-green', hwArrow = '';
          if (!isNaN(hwRaw)) {
            if (hwRaw < 0) {
              hwArrow = '↑'; hwVal = Math.abs(hwRaw);
              hwClass = hwVal > 10 ? 'wind-red' : 'wind-amber';
            } else {
              hwArrow = '↓'; hwVal = hwRaw; hwClass = 'wind-green';
            }
          }
          const xwRaw = windComps.xw;
          const xwVal = !isNaN(xwRaw) ? Math.abs(xwRaw) : '---';
          const xwClass = !isNaN(xwRaw) && xwVal > 10 ? 'wind-amber' : 'wind-green';
          const row = document.createElement('tr');
          row.innerHTML = '<td>' + rName + '</td><td>' + rLen + '</td><td>' + rElev + '</td>' +
            '<td>' + rMag + '</td><td>' + rTrue + '</td><td><div class="wind-comp-cell">' +
            '<div class="wind-box ' + hwClass + '"><span>' + hwArrow + '</span><span>' + hwVal + '</span></div>' +
            '<div class="wind-box ' + xwClass + '"><span>' + xwVal + '</span></div></div></td>';
          rwyTbody.appendChild(row);
        });
      }
    } else {
      rwyWidget.style.display = 'none';
    }
  }

  // NOTAMs: local All / Flagged selector is specific to this airport.
  const notamWidget = document.getElementById('brf-apt-notam-widget');
  const notamBody = document.getElementById('brf-apt-notam-body');

  if (apt.notams && apt.notams.length > 0 && notamWidget && notamBody) {
    notamWidget.style.display = 'flex';
    notamBody.dataset.airportIcao = apt.icao || '';
    const selectedFilter = getAirportNotamFilter(apt.icao);
    const grouped = {};
    apt.notams.forEach(notam => {
      const category = decodeQCodeCategory(notam.notam_qcode);
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(notam);
    });
    const catOrder = { RUNWAY: 1, SID: 2, STAR: 3, 'APPROACH PROCEDURES': 4, AIRPORT: 5 };
    const sortedCats = Object.keys(grouped).sort((a,b) => (catOrder[a] || 99) - (catOrder[b] || 99));
    let notamHtml = '';

    sortedCats.forEach((category, categoryIndex) => {
      const firstCategory = categoryIndex === 0;
      if (firstCategory) {
        notamHtml += '<div class="notam-category-heading-row"><div class="notam-category-title">' +
          escapeNotamHtml(category) + '</div>' +
          '<label class="notam-airport-filter"><span class="notam-airport-filter-label">Show:</span>' +
          '<select class="brf-select notam-airport-filter-select" data-airport-notam-filter data-icao="' +
          escapeNotamHtml(apt.icao || '') + '" aria-label="Show all or flagged NOTAMs">' +
          '<option value="all"' + (selectedFilter === 'all' ? ' selected' : '') + '>All</option>' +
          '<option value="flagged"' + (selectedFilter === 'flagged' ? ' selected' : '') + '>Flagged</option>' +
          '</select></label></div>';
        notamHtml += '<div class="notam-category-wrapper">';
      } else {
        notamHtml += '<div class="notam-category-wrapper"><div class="notam-category-title">' +
          escapeNotamHtml(category) + '</div>';
      }

      grouped[category].forEach(notam => {
        const notamId = String(notam.notam_id || 'UNKNOWN');
        const safeId = escapeNotamHtml(notamId);
        const start = formatNotamDate(notam.notam_effective_dtg || notam.notam_created_dtg);
        const end = formatNotamDate(notam.notam_expire_dtg || notam.notam_expire_dtg_estimated);
        const isFlagged = getFlaggedNotamIds().includes(notamId);
        notamHtml += '<div class="notam-box" data-notam-id="' + safeId + '">' +
          '<div class="notam-top-row"><div class="notam-badge">' + escapeNotamHtml(category) + '</div>' +
          '<button type="button" class="notam-flag' + (isFlagged ? ' flagged' : '') +
          '" aria-label="Flag NOTAM" aria-pressed="' + isFlagged + '">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg></button></div>' +
          '<div class="notam-header">' + safeId + ' - ' + escapeNotamHtml(start) + ' - ' + escapeNotamHtml(end) + '</div>' +
          '<div class="notam-body">' + formatNotamText(notam.notam_report || notam.notam_text || '') + '</div></div>';
      });
      notamHtml += '</div>';
    });

        notamBody.innerHTML = notamHtml;
    notamBody.querySelectorAll('.notam-flag').forEach(button => {
      button.addEventListener('click', () => {
        const card = button.closest('.notam-box');
        if (card) toggleNotamFlag(card.dataset.notamId);
      });
    });
    bindAirportNotamFilterControls(notamBody);
    applyBriefingNotamFilter();
  } else if (notamWidget) {
    notamWidget.style.display = 'none';
    if (notamBody) notamBody.innerHTML = '';
  }
}

var classicOfpZoom = 1;
var classicOfpTool = 'pen';
var classicOfpCurrentPage = 0;
var classicOfpUndoByPage = Object.create(null);

function getClassicOfpAnnotations(flight) {
  const annotations = flight && flight.state && flight.state.classicOfpAnnotations;
  return annotations && typeof annotations === 'object' ? annotations : {};
}

function escapeRegexText(value) {
  return String(value || '').replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

function extractFirWeatherTextForCategory(weatherText, firCode, firName, heading) {
  if (!weatherText) return 'NIL';
  const lines = String(weatherText).split(/\r?\n/);
  let start = -1;
  const code = String(firCode || '').toUpperCase();
  const name = String(firName || '').toUpperCase();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toUpperCase();
    if (line.includes(code) && (line.includes('FIR') || (name && line.includes(name)))) {
      start = i;
      break;
    }
  }

  let scoped = '';
  if (start >= 0) {
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\s*[A-Z0-9]{4}\s{2,}.*\bFIR(?:\/UIR)?\b/i.test(lines[i]) ||
          /^\s*(DEPARTURE AIRPORT|DESTINATION AIRPORT|DESTINATION ALTERNATE|FUEL ENROUTE AIRPORT)\s*:/i.test(lines[i])) {
        end = i;
        break;
      }
    }
    scoped = lines.slice(start, end).join('\n');
  } else {
    const upper = String(weatherText).toUpperCase();
    if (upper.includes(code) || (name && upper.includes(name))) scoped = String(weatherText);
  }

  if (!scoped) return 'NIL';
  const categoryPattern = new RegExp('(?:^|\\n)\\s*' + escapeRegexText(heading) +
    '\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:AIRMETs|SIGMETs|Tropical Cyclone SIGMETs|Volcanic Ash SIGMETs)\\s*:|$)', 'i');
  const match = categoryPattern.exec(scoped);
  if (!match) return 'NIL';
  const value = match[1].trim();
  if (!value || /^(?:NIL|NO WX DATA AVAILABLE|NO DATA AVAILABLE)$/i.test(value)) return 'NIL';
  return value;
}

function getFirWeatherMessages(data, firCode, firName) {
  const records = normalizeSimBriefList(data && data.sigmets && data.sigmets.sigmet);
  const buckets = { WA: [], WS: [], WC: [], WV: [] };
  records.forEach(record => {
    if (!record) return;
    const code = String(record.fir || record.fir_icao || '').trim().toUpperCase();
    if (code !== String(firCode).toUpperCase()) return;
    const type = String(record.type || '').trim().toUpperCase();
    if (!buckets[type]) return;
    const message = String(record.text || record.title || record.message || '').trim();
    if (message) buckets[type].push(message);
  });

  const weatherText = getPlanHtmlText(data, 'Weather');
  return {
    airmets: buckets.WA.length ? buckets.WA.join('\n\n') : extractFirWeatherTextForCategory(weatherText, firCode, firName, 'AIRMETs'),
    sigmets: buckets.WS.length ? buckets.WS.join('\n\n') : extractFirWeatherTextForCategory(weatherText, firCode, firName, 'SIGMETs'),
    tropical: buckets.WC.length ? buckets.WC.join('\n\n') : extractFirWeatherTextForCategory(weatherText, firCode, firName, 'Tropical Cyclone SIGMETs'),
    volcanic: buckets.WV.length ? buckets.WV.join('\n\n') : extractFirWeatherTextForCategory(weatherText, firCode, firName, 'Volcanic Ash SIGMETs')
  };
}

function renderFirSection(firCode, firName) {
  const flight = getFlight(currentFlightId);
  if (!flight || !flight.raw) return;
  if (!flight.state) flight.state = {};
  if (!Array.isArray(flight.state.flaggedNotams)) flight.state.flaggedNotams = [];

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value || 'NIL';
  };

  const airportWeatherContent = document.getElementById('brf-apt-airport-weather-content');
  const firWeatherContent = document.getElementById('brf-fir-weather-content');
  const vmcBadge = document.getElementById('brf-apt-vmc-badge');
  if (airportWeatherContent) airportWeatherContent.style.display = 'none';
  if (firWeatherContent) firWeatherContent.style.display = 'flex';
  if (vmcBadge) vmcBadge.style.display = 'none';

  const weather = getFirWeatherMessages(flight.raw, firCode, firName);
  setText('brf-fir-airmets', weather.airmets);
  setText('brf-fir-sigmets', weather.sigmets);
  setText('brf-fir-tropical-sigmets', weather.tropical);
  setText('brf-fir-volcanic-sigmets', weather.volcanic);

  const runwayWidget = document.getElementById('brf-apt-rwy-widget');
  if (runwayWidget) runwayWidget.style.display = 'none';

  const notamWidget = document.getElementById('brf-apt-notam-widget');
  const notamBody = document.getElementById('brf-apt-notam-body');
  if (!notamWidget || !notamBody) return;

  const notams = getFirNotams(flight.raw, firCode);
  notamWidget.style.display = 'flex';
  notamBody.dataset.airportIcao = firCode;

  if (!notams.length) {
    notamBody.innerHTML = '<div class="briefing-airport-empty">NIL — no FIR NOTAMs available for ' +
      escapeNotamHtml(firCode) + '</div>';
    return;
  }

  const grouped = {};
  notams.forEach(notam => {
    const category = notam.notam_qcode_category || decodeQCodeCategory(notam.notam_qcode);
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(notam);
  });
  const catOrder = { RUNWAY: 1, SID: 2, STAR: 3, 'APPROACH PROCEDURES': 4, AIRPORT: 5 };
  const categories = Object.keys(grouped).sort((a, b) => (catOrder[a] || 99) - (catOrder[b] || 99));
  const selectedFilter = getAirportNotamFilter(firCode);
  let html = '';

  categories.forEach((category, categoryIndex) => {
    if (categoryIndex === 0) {
      html += '<div class="notam-category-heading-row"><div class="notam-category-title">' +
        escapeNotamHtml(category) + '</div>' +
        '<label class="notam-airport-filter"><span class="notam-airport-filter-label">Show:</span>' +
        '<select class="brf-select notam-airport-filter-select" data-airport-notam-filter data-icao="' +
        escapeNotamHtml(firCode) + '" aria-label="Show all or flagged FIR NOTAMs">' +
        '<option value="all"' + (selectedFilter === 'all' ? ' selected' : '') + '>All</option>' +
        '<option value="flagged"' + (selectedFilter === 'flagged' ? ' selected' : '') + '>Flagged</option>' +
        '</select></label></div><div class="notam-category-wrapper">';
    } else {
      html += '<div class="notam-category-wrapper"><div class="notam-category-title">' +
        escapeNotamHtml(category) + '</div>';
    }

    grouped[category].forEach(notam => {
      const notamId = String(notam.notam_id || 'UNKNOWN');
      const isFlagged = getFlaggedNotamIds().includes(notamId);
      const startDate = formatNotamDate(notam.notam_effective_dtg || notam.notam_created_dtg);
      const endDate = formatNotamDate(notam.notam_expire_dtg || notam.notam_expire_dtg_estimated);
      html += '<div class="notam-box" data-notam-id="' + escapeNotamHtml(notamId) + '">' +
        '<div class="notam-top-row"><div class="notam-badge">' + escapeNotamHtml(category) + '</div>' +
        '<button type="button" class="notam-flag' + (isFlagged ? ' flagged' : '') +
        '" aria-label="Flag NOTAM" aria-pressed="' + isFlagged + '">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg></button></div>' +
        '<div class="notam-header">' + escapeNotamHtml(notamId) + ' - ' +
        escapeNotamHtml(startDate) + ' - ' + escapeNotamHtml(endDate) + '</div>' +
        '<div class="notam-body">' + formatNotamText(notam.notam_report || notam.notam_text || '') + '</div></div>';
    });
    html += '</div>';
  });

  notamBody.innerHTML = html;
  notamBody.querySelectorAll('.notam-flag').forEach(button => {
    button.addEventListener('click', () => {
      const card = button.closest('.notam-box');
      if (card) toggleNotamFlag(card.dataset.notamId);
    });
  });
  bindAirportNotamFilterControls(notamBody);
  applyBriefingNotamFilter();
}

function renderClassicOfpText(data) {
  const container = document.getElementById('classic-ofp-container');
  if (!container) return;
  const html = data && data.text && data.text.plan_html;
  if (!html) {
    container.innerHTML = '<p class="classic-ofp-empty">Testo OFP non disponibile per questo volo.</p>';
    return;
  }

  // Remove SimBrief's single outer DIV/PRE wrapper before splitting into individual pages.
  const normalizedHtml = html
    .replace(/^\s*<div[^>]*>\s*<pre[^>]*>/i, '')
    .replace(/<\/pre>\s*<\/div>\s*$/i, '');
  const pages = normalizedHtml
    .split(/<h2[^>]*page-break-after[^>]*>[\s\S]*?<\/h2>/i)
    .map(page => page.trim())
    .filter(Boolean);

  container.innerHTML = pages.map((page, index) =>
    '<div class="ofp-page" data-page-index="' + index + '">' +
      '<div class="ofp-page-content"><pre class="ofp-page-text">' + page + '</pre></div>' +
      '<canvas class="ofp-annotation-canvas" data-page-index="' + index + '" aria-label="OFP annotations"></canvas>' +
    '</div>'
  ).join('');
  applyClassicOfpZoom();
  initializeClassicOfpAnnotationCanvases(getFlight(currentFlightId));
}


function applyClassicOfpZoom() {
  const container = document.getElementById('classic-ofp-container');
  const zoomValue = document.getElementById('ofp-zoom-value');
  if (container) {
    if ('zoom' in container.style) {
      container.style.zoom = String(classicOfpZoom);
      container.style.transform = '';
      container.style.width = '';
    } else {
      container.style.zoom = '';
      container.style.transform = 'scale(' + classicOfpZoom + ')';
      container.style.width = (100 / classicOfpZoom) + '%';
    }
  }
  if (zoomValue) zoomValue.textContent = Math.round(classicOfpZoom * 100) + '%';
}

function restoreClassicOfpCanvas(canvas, dataUrl) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!dataUrl) return;
  const image = new Image();
  image.onload = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(image, 0, 0, rect.width, rect.height);
  };
  image.src = dataUrl;
}

function initializeClassicOfpAnnotationCanvases(flight) {
  const annotations = getClassicOfpAnnotations(flight);
  const canvases = document.querySelectorAll('#classic-ofp-container .ofp-annotation-canvas');
  canvases.forEach(canvas => {
    const page = canvas.closest('.ofp-page');
    if (!page) return;
    const rect = page.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.style.pointerEvents = 'auto';
    canvas.style.touchAction = 'pan-y';
    canvas.classList.add('drawing-enabled');

    if (!canvas.dataset.annotationBound) {
      canvas.dataset.annotationBound = '1';
      canvas.addEventListener('pointerdown', event => {
        if (event.pointerType === 'touch') return;
        const activeFlight = getFlight(currentFlightId);
        if (!activeFlight) return;
        event.preventDefault();
        classicOfpCurrentPage = Number(canvas.dataset.pageIndex) || 0;
        if (!classicOfpUndoByPage[classicOfpCurrentPage]) classicOfpUndoByPage[classicOfpCurrentPage] = [];
        classicOfpUndoByPage[classicOfpCurrentPage].push(canvas.toDataURL('image/png'));
        canvas._ofpDrawing = true;
        canvas._ofpLastPoint = null;
        if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
        const bounds = canvas.getBoundingClientRect();
        const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        canvas._ofpLastPoint = point;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.save();
        context.globalCompositeOperation = classicOfpTool === 'eraser' ? 'destination-out' : 'source-over';
        context.globalAlpha = classicOfpTool === 'highlight' ? 0.28 : 1;
        context.strokeStyle = classicOfpTool === 'eraser'
          ? 'rgba(0,0,0,1)'
          : (document.getElementById('ofp-annotation-color') || {}).value || '#1f5fbf';
        context.fillStyle = context.strokeStyle;
        context.lineWidth = classicOfpTool === 'eraser' ? 22 : classicOfpTool === 'highlight' ? 18 : 2.6;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
        context.fill();
        context.restore();
      });

      canvas.addEventListener('pointermove', event => {
        if (!canvas._ofpDrawing || !canvas._ofpLastPoint) return;
        event.preventDefault();
        const bounds = canvas.getBoundingClientRect();
        const next = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        const context = canvas.getContext('2d');
        if (!context) return;
        context.save();
        context.globalCompositeOperation = classicOfpTool === 'eraser' ? 'destination-out' : 'source-over';
        context.globalAlpha = classicOfpTool === 'highlight' ? 0.28 : 1;
        context.strokeStyle = classicOfpTool === 'eraser'
          ? 'rgba(0,0,0,1)'
          : (document.getElementById('ofp-annotation-color') || {}).value || '#1f5fbf';
        context.lineWidth = classicOfpTool === 'eraser' ? 22 : classicOfpTool === 'highlight' ? 18 : 2.6;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        context.moveTo(canvas._ofpLastPoint.x, canvas._ofpLastPoint.y);
        context.lineTo(next.x, next.y);
        context.stroke();
        context.restore();
        canvas._ofpLastPoint = next;
      });

      const finishStroke = () => {
        if (!canvas._ofpDrawing) return;
        canvas._ofpDrawing = false;
        canvas._ofpLastPoint = null;
        const current = getFlight(currentFlightId);
        if (!current) return;
        if (!current.state) current.state = {};
        const saved = getClassicOfpAnnotations(current);
        saved[canvas.dataset.pageIndex] = canvas.toDataURL('image/png');
        updateFlightState(currentFlightId, { classicOfpAnnotations: saved });
      };
      canvas.addEventListener('pointerup', finishStroke);
      canvas.addEventListener('pointercancel', finishStroke);
      canvas.addEventListener('lostpointercapture', finishStroke);
    }

    restoreClassicOfpCanvas(canvas, annotations[canvas.dataset.pageIndex] || '');
  });

  containerImagesReload();
}

function containerImagesReload() {
  const container = document.getElementById('classic-ofp-container');
  if (!container) return;
  container.querySelectorAll('img').forEach(image => {
    if (image.dataset.ofpResizeBound) return;
    image.dataset.ofpResizeBound = '1';
    image.addEventListener('load', () => initializeClassicOfpAnnotationCanvases(getFlight(currentFlightId)));
  });
}

function saveClassicOfpCanvas(canvas, dataUrl) {
  const flight = getFlight(currentFlightId);
  if (!flight) return;
  const annotations = getClassicOfpAnnotations(flight);
  annotations[canvas.dataset.pageIndex] = dataUrl;
  updateFlightState(currentFlightId, { classicOfpAnnotations: annotations });
}

function initClassicOfpAnnotationTools(flight) {
  const toolbar = document.getElementById('classic-ofp-tools');
  if (!toolbar) return;
  toolbar.querySelectorAll('[data-ofp-tool]').forEach(button => {
    button.onclick = () => {
      classicOfpTool = button.dataset.ofpTool;
      toolbar.querySelectorAll('[data-ofp-tool]').forEach(b => b.classList.toggle('active', b === button));
    };
  });
  toolbar.querySelectorAll('[data-ofp-action]').forEach(button => {
    button.onclick = () => {
      const action = button.dataset.ofpAction;
      if (action === 'zoom-in') {
        classicOfpZoom = Math.min(1.8, Math.round((classicOfpZoom + 0.1) * 10) / 10);
        applyClassicOfpZoom();
      } else if (action === 'zoom-out') {
        classicOfpZoom = Math.max(0.6, Math.round((classicOfpZoom - 0.1) * 10) / 10);
        applyClassicOfpZoom();
      } else {
        const canvas = document.querySelector('#classic-ofp-container .ofp-annotation-canvas[data-page-index="' + classicOfpCurrentPage + '"]');
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        const undo = classicOfpUndoByPage[classicOfpCurrentPage] || [];
        if (action === 'undo' && undo.length) {
          const previous = undo.pop();
          restoreClassicOfpCanvas(canvas, previous);
          saveClassicOfpCanvas(canvas, previous);
        } else if (action === 'clear') {
          undo.push(canvas.toDataURL('image/png'));
          context.clearRect(0, 0, canvas.width, canvas.height);
          saveClassicOfpCanvas(canvas, canvas.toDataURL('image/png'));
        }
      }
    };
  });

  document.querySelectorAll('#classic-ofp-container .ofp-page').forEach(page => {
    page.addEventListener('pointerdown', () => {
      classicOfpCurrentPage = Number(page.dataset.pageIndex) || 0;
    }, { passive: true });
  });
  initializeClassicOfpAnnotationCanvases(flight);
}


function initBriefingInteractions() {
  bindBriefingTabs();
}
