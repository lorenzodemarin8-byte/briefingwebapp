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

  let source = String(html);
  let markers = [];
  let match;

  const scanMarkers = value => {
    const found = [];
    const pattern = /<!--BKMK\/\/\/([^]*?)\/\/\/\d+-->/g;
    let item;
    while ((item = pattern.exec(value)) !== null) {
      found.push({ name: item[1].trim(), end: pattern.lastIndex, index: item.index });
    }
    return found;
  };

  markers = scanMarkers(source);
  // Some XML-to-JSON transports leave the HTML entities encoded one extra time.
  if (!markers.length && /&lt;!--BKMK/i.test(source)) {
    const decoder = document.createElement('textarea');
    decoder.innerHTML = source;
    const decoded = decoder.value || decoder.textContent || '';
    if (decoded && decoded !== source) {
      source = decoded;
      markers = scanMarkers(source);
    }
  }

  let sectionHtml = source;
  if (markers.length) {
    const marker = markers.find(item => item.name.toLowerCase() === String(sectionName).toLowerCase());
    if (!marker) return '';
    const next = markers.find(item => item.index > marker.index);
    sectionHtml = source.slice(marker.end, next ? next.index : source.length);
  }

  const holder = document.createElement('div');
  holder.innerHTML = sectionHtml;
  return (holder.textContent || holder.innerText || '').replace(/\r/g, '');
}


function addFirNameToMap(map, code, name) {
  const id = String(code || '').trim().toUpperCase();
  const firName = String(name || '').trim().replace(/\*+$/, '').trim();
  if (/^[A-Z0-9]{4}$/.test(id) && firName && !map[id]) map[id] = firName;
}

function collectFirNamesFromPlanHtml(data, map) {
  const text = getPlanHtmlText(data, 'NOTAM') + '\n' + getPlanHtmlText(data, 'Weather');
  let match;
  const inline = /^([A-Z0-9]{4})\s{2,}(.+?\bFIR(?:\/UIR)?\b.*)$/gim;
  while ((match = inline.exec(text)) !== null) addFirNameToMap(map, match[1], match[2]);

  const namedThenCode = /^([A-Z][A-Z /()-]+?\bFIR(?:\/UIR)?)[* \t]*\n\s*-([A-Z0-9]{4})\b/gim;
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
    [notam.cns_location_id, notam.icao_id, notam.location_icao]
      .some(value => String(value || '').toUpperCase() === code));
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

  const wxNotams = briefingGroupMarkup('Main Airports', 'brf-main-airports', mainAirportItems, true) +
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
  setT('gen-dep-name', origin.name || origin.airport_name || '');
  setT('gen-arr-name', destination.name || destination.airport_name || '');
  setT('gen-ofp-edition', extractOfpEdition(data));
  const releaseDate = data.params && data.params.time_generated
    ? formatObsDateTime(new Date(Number(data.params.time_generated) * 1000).toISOString()) : '—';
  setT('gen-release', releaseDate);
  setT('gen-callsign', atc.callsign || '—');
  setT('gen-std', `${unixToHHMM(times.sched_out)} / ${unixToHHMM(times.sched_off)}`);
  setT('gen-sta', `${unixToHHMM(times.sched_on)} / ${unixToHHMM(times.sched_in)}`);
  setT('gen-actype', aircraft.name || aircraft.icaocode || '—');
  setT('gen-engines', aircraft.engines || '');
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

  const destinationElevation = destination.elevation || destination.elevation_ft || destination.altitude;
  setT('gen-dest-elev', destinationElevation !== undefined && destinationElevation !== null && destinationElevation !== ''
    ? `${destinationElevation} FT` : '—');

  let maxShearText = '—';
  const planHtml = data.text && data.text.plan_html ? String(data.text.plan_html).replace(/<[^>]*>/g, ' ') : '';
  const shearMatch = planHtml.match(/(?:MXSHR|MAX(?:IMUM)?\s+SHEAR(?:\s+RATE)?)\s*[:=]?\s*([+-]?\d+(?:\.\d+)?)\s*(?:AT|@)\s*([A-Z0-9]{2,8})/i);
  if (shearMatch) maxShearText = `${shearMatch[1]} at ${shearMatch[2]}`;
  setT('gen-maxshear', maxShearText);

  if (typeof renderRouteSummary === 'function') renderRouteSummary(data, origin, destination, general, 'gen-route-summary');
  renderGeneralCdmTimes(flight);
  if (typeof renderFuelSection === 'function') renderFuelSection(flight);
}

function renderGeneralCdmTimes(flight, effectiveEtdOverride, ctotOverride) {
  if (!flight) return;
  const data = flight.raw || {};
  const state = flight.state || {};
  if (effectiveEtdOverride) state.effectiveEtd = Number(effectiveEtdOverride);
  const ctot = ctotOverride !== undefined ? ctotOverride : state.ctot;
  const estimates = calculateCdmEstimatedTimes(data, state, ctot);
  const setT = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setT('gen-cdm-etd', estimates.effectiveOut
    ? `${unixToHHMM(estimates.effectiveOut)} / ${unixToHHMM(estimates.estimatedOff)}` : '— / —');
  setT('gen-cdm-eta', estimates.estimatedOn
    ? `${unixToHHMM(estimates.estimatedOn)} / ${unixToHHMM(estimates.estimatedIn)}` : '— / —');

  const hasCtot = Boolean(String(ctot || '').replace(/[^0-9]/g, '').length === 4);
  const ctotRow = document.getElementById('gen-ctot-row');
  if (ctotRow) ctotRow.hidden = !hasCtot;
  setT('gen-ctot', hasCtot ? `${String(ctot).replace(/[^0-9]/g, '').slice(0, 2)}:${String(ctot).replace(/[^0-9]/g, '').slice(2, 4)}z` : '—');
}
function setupWeightLimitCheck(inputId, opId, structId, weightKey) {
  const inp = document.getElementById(inputId);
  if (!inp) return;

  const flight = getFlight(currentFlightId);
  const savedWeights = (flight && flight.state && flight.state.actualWeights) || {};
  if (weightKey && document.activeElement !== inp) {
    inp.value = savedWeights[weightKey] !== undefined ? savedWeights[weightKey] : '';
  }

  const checkLimit = () => {
    inp.classList.remove('limit-exceeded');
    const val = parseFloat(inp.value);
    if (isNaN(val)) return;
    const opEl = opId ? document.getElementById(opId) : null;
    const structEl = structId ? document.getElementById(structId) : null;
    const opLim = opEl ? parseFloat(opEl.textContent) : NaN;
    const strLim = structEl ? parseFloat(structEl.textContent) : NaN;
    if ((!isNaN(opLim) && val > opLim) || (!isNaN(strLim) && val > strLim)) {
      inp.classList.add('limit-exceeded');
    }
  };

  checkLimit();
  if (inp.dataset.weightBound === 'true') return;
  inp.dataset.weightBound = 'true';
  inp.addEventListener('input', (e) => {
    checkLimit();
    const activeFlight = getFlight(currentFlightId);
    if (!weightKey || !activeFlight) return;
    if (!activeFlight.state) activeFlight.state = {};
    if (!activeFlight.state.actualWeights) activeFlight.state.actualWeights = {};
    activeFlight.state.actualWeights[weightKey] = e.target.value;
    const mirrorIds = {
      zfw: ['gen-w-zfw-act', 'fuel-w-zfw-act'],
      tow: ['gen-w-tow-act', 'fuel-w-tow-act'],
      lw: ['gen-w-lw-act', 'fuel-w-lw-act']
    };
    (mirrorIds[weightKey] || []).forEach(id => {
      const mirror = document.getElementById(id);
      if (mirror && mirror !== e.target) mirror.value = e.target.value;
    });
    updateFlightState(currentFlightId, { actualWeights: activeFlight.state.actualWeights });
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

  const weightFieldPairs = [
    ['gen-w-zfw-plan', 'fuel-w-zfw-plan'],
    ['gen-w-tow-plan', 'fuel-w-tow-plan'],
    ['gen-w-lw-plan', 'fuel-w-lw-plan'],
    ['gen-w-zfw-struct', 'fuel-w-zfw-struct'],
    ['gen-w-tow-op', 'fuel-w-tow-op'],
    ['gen-w-tow-struct', 'fuel-w-tow-struct'],
    ['gen-w-lw-op', 'fuel-w-lw-op'],
    ['gen-w-lw-struct', 'fuel-w-lw-struct']
  ];
  weightFieldPairs.forEach(([sourceId, targetId]) => {
    const source = document.getElementById(sourceId);
    const target = document.getElementById(targetId);
    if (source && target) target.textContent = source.textContent;
  });

  const savedWeights = (flight.state && flight.state.actualWeights) || {};
  const loadInp = document.getElementById('gen-w-load-act');
  if (loadInp) {
    if (document.activeElement !== loadInp) loadInp.value = savedWeights.load !== undefined ? savedWeights.load : '';
    if (loadInp.dataset.weightBound !== 'true') {
      loadInp.dataset.weightBound = 'true';
      loadInp.addEventListener('input', (e) => {
        const activeFlight = getFlight(currentFlightId);
        if (!activeFlight) return;
        if (!activeFlight.state) activeFlight.state = {};
        if (!activeFlight.state.actualWeights) activeFlight.state.actualWeights = {};
        activeFlight.state.actualWeights.load = e.target.value;
        updateFlightState(currentFlightId, { actualWeights: activeFlight.state.actualWeights });
      });
    }
  }

  setupWeightLimitCheck('gen-w-zfw-act', null, 'gen-w-zfw-struct', 'zfw');
  setupWeightLimitCheck('gen-w-tow-act', 'gen-w-tow-op', 'gen-w-tow-struct', 'tow');
  setupWeightLimitCheck('gen-w-lw-act', 'gen-w-lw-op', 'gen-w-lw-struct', 'lw');
  setupWeightLimitCheck('fuel-w-zfw-act', null, 'fuel-w-zfw-struct', 'zfw');
  setupWeightLimitCheck('fuel-w-tow-act', 'fuel-w-tow-op', 'fuel-w-tow-struct', 'tow');
  setupWeightLimitCheck('fuel-w-lw-act', 'fuel-w-lw-op', 'fuel-w-lw-struct', 'lw');

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

  const extraBreakdown = document.getElementById('brf-fuel-extra-breakdown');
  if (extraBreakdown) {
    const visibleBuckets = calcs.extraBuckets.filter(bucket => bucket && bucket.label);
    extraBreakdown.innerHTML = visibleBuckets.length
      ? '<div class="brf-fuel-extra-title">Additional SimBrief Fuel</div>' +
        visibleBuckets.map(bucket =>
          '<div class="brf-fuel-extra-row"><span>' + escapeNotamHtml(String(bucket.label || 'EXTRA')) +
          '</span><span>' + Math.round(Number(bucket.fuel) || 0) + ' kg</span></div>'
        ).join('')
      : '';
    extraBreakdown.hidden = visibleBuckets.length === 0;
  }

  const discMaxValue = document.getElementById('brf-f-max-disc');
  if (discMaxValue) discMaxValue.textContent = calcs.maxDiscKg + ' (' + calcs.bottleneckReason + ')';

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
    const discWrapper = document.querySelector('.brf-disc-wrapper');
    const syncDiscWrapperAppearance = () => {
      if (discWrapper) discWrapper.classList.toggle('has-value', newDisc.value.trim() !== '');
    };
    syncDiscWrapperAppearance();

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
      syncDiscWrapperAppearance();
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

function extractCrewMessages(data) {
  // Crew Alert and Crew Bulletin belong to the dedicated Crew Information bookmark,
  // not to the full plan_html document (which also contains Weather/SIGMET pages).
  const text = getPlanHtmlText(data || {}, 'Crew Information');
  if (!text) return { alert: 'NIL', bulletin: 'NIL' };

  const alertMarker = /={3,}\s*CREW ALERT\s*={3,}/i;
  const bulletinMarker = /={3,}\s*CREW BULLETIN\s*={3,}/i;
  const alertMatch = alertMarker.exec(text);
  const bulletinMatch = bulletinMarker.exec(text);
  if (!alertMatch) return { alert: 'NIL', bulletin: 'NIL' };

  const alertStart = alertMatch.index + alertMatch[0].length;
  const alertEnd = bulletinMatch && bulletinMatch.index > alertMatch.index
    ? bulletinMatch.index : text.length;
  const bulletinStart = bulletinMatch
    ? bulletinMatch.index + bulletinMatch[0].length : -1;

  const clean = value => String(value || '')
    .replace(/^\s*\n+/, '')
    .replace(/\n\s*=+\s*$/gm, '')
    .replace(/\n\s*Route\s*(?:\n|$)[\s\S]*$/i, '')
    .replace(/\s+$/, '')
    .trim();

  const alert = clean(text.slice(alertStart, alertEnd));
  let bulletin = bulletinStart >= 0
    ? clean(text.slice(bulletinStart))
    : 'NIL';
  // Some SimBrief layouts append the next page title directly after the literal NIL.
  if (/^NIL\\s+Route[\\s\\S]*$/i.test(bulletin)) bulletin = 'NIL';

  return { alert: alert || 'NIL', bulletin: bulletin || 'NIL' };
}

function renderCrewAlertSection(flight) {
  const data = flight && flight.raw ? flight.raw : {};
  const messages = extractCrewMessages(data);
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
  const airportWeatherContent = document.getElementById('brf-apt-airport-weather-content');
  const firWeatherContent = document.getElementById('brf-fir-weather-content');
  const vmcBadge = document.getElementById('brf-apt-vmc-badge');
  if (airportWeatherContent) airportWeatherContent.style.display = '';
  if (firWeatherContent) firWeatherContent.style.display = 'none';
  if (vmcBadge) vmcBadge.style.display = '';

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
      const category = getSimBriefNotamCategory(notam);
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
    const category = String(notam.notam_qcode_category || decodeQCodeCategory(notam.notam_qcode)).toUpperCase();
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

var classicOfpRenderedFileKey = '';
var classicOfpPdfDocument = null;
var classicOfpPdfPages = [];
var classicOfpPdfObserver = null;
var classicOfpPdfRenderTasks = Object.create(null);
var classicOfpPdfLoadingTask = null;
var classicOfpPdfQueuedPages = new Set();
var classicOfpPdfRenderQueue = Promise.resolve();
var classicOfpPdfPageSize = null;
var classicOfpRenderToken = 0;
var classicOfpResizeBound = false;
var classicOfpPinchState = null;
var classicOfpBaseScale = 1;

function getClassicOfpPdfFile(data) {
  const link = data && data.files && data.files.pdf && data.files.pdf.link;
  if (!link) return null;
  const fileName = String(link).split('/').pop().split('?')[0];
  if (!/^[A-Z0-9_-]+_PDF_[0-9]+\.pdf$/i.test(fileName)) return null;
  const directory = data.files.directory || 'https://www.simbrief.com/ofp/flightplans/';
  let directUrl = fileName;
  try {
    directUrl = new URL(fileName, directory).href;
  } catch (e) {
    directUrl = 'https://www.simbrief.com/ofp/flightplans/' + encodeURIComponent(fileName);
  }
  return {
    proxyUrl: '/api/simbrief-pdf?file=' + encodeURIComponent(fileName),
    directUrl
  };
}

function waitForPdfJs(timeoutMs) {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise(resolve => {
    let finished = false;
    const complete = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener('pdfjs-ready', complete);
      resolve(window.pdfjsLib || null);
    };
    window.addEventListener('pdfjs-ready', complete, { once: true });
    window.setTimeout(complete, timeoutMs || 8000);
  });
}

function renderClassicOfpHtmlFallback(data, reason) {
  const container = document.getElementById('classic-ofp-container');
  if (!container) return;
  const html = data && data.text && data.text.plan_html;
  if (!html) {
    container.innerHTML = '<p class="classic-ofp-empty">OFP PDF and HTML content are not available for this flight.</p>';
    return;
  }

  const normalizedHtml = String(html)
    .replace(/^\s*<div[^>]*>\s*<pre[^>]*>/i, '')
    .replace(/<\/pre>\s*<\/div>\s*$/i, '');
  const pages = normalizedHtml
    .split(/<h2[^>]*page-break-after[^>]*>[\s\S]*?<\/h2>/i)
    .map(page => page.trim())
    .filter(Boolean);

  container.classList.remove('classic-ofp-pdf-mode');
  container.innerHTML = (reason ? '<div class="classic-ofp-error">PDF unavailable — showing the SimBrief HTML version instead.</div>' : '') +
    pages.map((page, index) =>
      '<div class="ofp-page" data-page-index="' + index + '">' +
        '<div class="ofp-page-content"><pre class="ofp-page-text">' + page + '</pre></div>' +
        '<canvas class="ofp-annotation-canvas" data-page-index="' + index + '" aria-label="OFP annotations"></canvas>' +
      '</div>'
    ).join('');
  applyClassicOfpZoom();
  initializeClassicOfpAnnotationCanvases(getFlight(currentFlightId));
}

async function renderClassicOfpText(data) {
  const container = document.getElementById('classic-ofp-container');
  if (!container) return;
  const pdfFile = getClassicOfpPdfFile(data);
  const htmlContent = data && data.text && data.text.plan_html ? String(data.text.plan_html) : '';
  let htmlHash = 2166136261;
  for (let i = 0; i < htmlContent.length; i++) {
    htmlHash ^= htmlContent.charCodeAt(i);
    htmlHash = Math.imul(htmlHash, 16777619);
  }
  const cacheKey = pdfFile
    ? `${extractOfpEdition(data)}|${pdfFile.directUrl}`
    : `HTML|${extractOfpEdition(data)}|${htmlHash >>> 0}`;
  if (classicOfpRenderedFileKey === cacheKey && container.childElementCount > 0) {
    return;
  }
  classicOfpRenderedFileKey = cacheKey;
  const token = ++classicOfpRenderToken;
  classicOfpUndoByPage = Object.create(null);
  classicOfpPdfQueuedPages.clear();
  classicOfpPdfRenderQueue = Promise.resolve();

  if (classicOfpPdfObserver) {
    classicOfpPdfObserver.disconnect();
    classicOfpPdfObserver = null;
  }
  Object.keys(classicOfpPdfRenderTasks).forEach(key => {
    try { classicOfpPdfRenderTasks[key].cancel(); } catch (e) {}
  });
  classicOfpPdfRenderTasks = Object.create(null);
  if (classicOfpPdfDocument && classicOfpPdfDocument.cleanup) {
    try { classicOfpPdfDocument.cleanup(); } catch (e) {}
  }
  if (classicOfpPdfLoadingTask && classicOfpPdfLoadingTask.destroy) {
    try { await classicOfpPdfLoadingTask.destroy(); } catch (e) {}
  }
  classicOfpPdfLoadingTask = null;
  classicOfpPdfDocument = null;
  classicOfpPdfPages = [];
  classicOfpPdfPageSize = null;

  if (!pdfFile) {
    renderClassicOfpHtmlFallback(data, false);
    return;
  }

  container.classList.add('classic-ofp-pdf-mode');
  container.innerHTML = '<div class="classic-ofp-loading">Loading original SimBrief PDF…</div>';
  const pdfjsLib = await waitForPdfJs(8000);
  if (token !== classicOfpRenderToken) return;
  if (!pdfjsLib) {
    renderClassicOfpHtmlFallback(data, true);
    return;
  }

  let pdf = null;
  const urls = [pdfFile.proxyUrl, pdfFile.directUrl];
  for (let i = 0; i < urls.length && !pdf; i++) {
    try {
      classicOfpPdfLoadingTask = pdfjsLib.getDocument({
        url: urls[i],
        withCredentials: false,
        rangeChunkSize: 64 * 1024,
        disableAutoFetch: true,
        disableStream: true
      });
      pdf = await classicOfpPdfLoadingTask.promise;
    } catch (e) {
      pdf = null;
    }
    if (token !== classicOfpRenderToken) return;
  }

  if (!pdf) {
    renderClassicOfpHtmlFallback(data, true);
    return;
  }

  classicOfpPdfDocument = pdf;
  container.innerHTML = '';
  const viewportEl = document.getElementById('classic-ofp-viewport');
  const availableWidth = Math.max(280, (viewportEl ? viewportEl.clientWidth : window.innerWidth) - 24);
  const firstPage = await pdf.getPage(1);
  if (token !== classicOfpRenderToken) return;
  const firstViewport = firstPage.getViewport({ scale: 1 });
  classicOfpPdfPageSize = { width: firstViewport.width, height: firstViewport.height };
  classicOfpPdfPages[0] = firstPage;
  classicOfpBaseScale = Math.max(0.35, Math.min(1.8, availableWidth / firstViewport.width));

  // Allocate only lightweight page shells here. PDF canvases and annotation canvases
  // are allocated lazily as each page approaches the viewport.
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    if (token !== classicOfpRenderToken) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'ofp-pdf-page';
    wrapper.dataset.pageIndex = String(pageNumber - 1);
    wrapper.dataset.baseWidth = String(firstViewport.width * classicOfpBaseScale);
    wrapper.dataset.baseHeight = String(firstViewport.height * classicOfpBaseScale);
    wrapper.dataset.pdfRendered = 'false';

    const pdfCanvas = document.createElement('canvas');
    pdfCanvas.className = 'ofp-pdf-canvas';
    pdfCanvas.setAttribute('aria-label', 'SimBrief OFP page ' + pageNumber);
    pdfCanvas.width = 1;
    pdfCanvas.height = 1;

    const annotationCanvas = document.createElement('canvas');
    annotationCanvas.className = 'ofp-annotation-canvas';
    annotationCanvas.dataset.pageIndex = String(pageNumber - 1);
    annotationCanvas.setAttribute('aria-label', 'OFP annotations');
    annotationCanvas.width = 1;
    annotationCanvas.height = 1;

    wrapper.appendChild(pdfCanvas);
    wrapper.appendChild(annotationCanvas);
    container.appendChild(wrapper);
  }

  applyClassicOfpZoom();

  if ('IntersectionObserver' in window) {
    classicOfpPdfObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const index = Number(entry.target.dataset.pageIndex);
        if (entry.isIntersecting) {
          initializeClassicOfpAnnotationCanvases(getFlight(currentFlightId), index);
          queueClassicOfpPdfPage(index);
        } else {
          releaseClassicOfpPdfPage(index);
        }
      });
    }, {
      root: viewportEl || null,
      rootMargin: '280px 0px'
    });
    container.querySelectorAll('.ofp-pdf-page').forEach(page => classicOfpPdfObserver.observe(page));
  } else {
    queueVisibleClassicOfpPages();
  }

  if (!classicOfpResizeBound) {
    classicOfpResizeBound = true;
    window.addEventListener('resize', () => {
      if (!classicOfpPdfDocument || !classicOfpPdfPageSize) return;
      const viewport = document.getElementById('classic-ofp-viewport');
      if (!viewport) return;
      const width = Math.max(280, viewport.clientWidth - 24);
      classicOfpBaseScale = Math.max(0.35, Math.min(1.8, width / classicOfpPdfPageSize.width));
      document.querySelectorAll('#classic-ofp-container .ofp-pdf-page').forEach(wrapper => {
        wrapper.dataset.baseWidth = String(classicOfpPdfPageSize.width * classicOfpBaseScale);
        wrapper.dataset.baseHeight = String(classicOfpPdfPageSize.height * classicOfpBaseScale);
        wrapper.dataset.renderedScale = '';
        wrapper.dataset.pdfRendered = 'false';
      });
      applyClassicOfpZoom();
    });
  }

  if (viewportEl && !viewportEl.dataset.pdfScrollBound) {
    viewportEl.dataset.pdfScrollBound = 'true';
    viewportEl.addEventListener('scroll', queueVisibleClassicOfpPages, { passive: true });
  }
}

function isClassicOfpPageNearViewport(wrapper) {
  const viewport = document.getElementById('classic-ofp-viewport');
  if (!viewport || !wrapper) return false;
  const rect = wrapper.getBoundingClientRect();
  const view = viewport.getBoundingClientRect();
  const margin = 300;
  return rect.bottom >= view.top - margin && rect.top <= view.bottom + margin;
}

function queueVisibleClassicOfpPages() {
  const container = document.getElementById('classic-ofp-container');
  if (!container || !classicOfpPdfDocument) return;
  container.querySelectorAll('.ofp-pdf-page').forEach(wrapper => {
    const index = Number(wrapper.dataset.pageIndex);
    if (isClassicOfpPageNearViewport(wrapper)) {
      initializeClassicOfpAnnotationCanvases(getFlight(currentFlightId), index);
      queueClassicOfpPdfPage(index);
    } else {
      releaseClassicOfpPdfPage(index);
    }
  });
}

function queueClassicOfpPdfPage(index) {
  if (!classicOfpPdfDocument || classicOfpPdfQueuedPages.has(index)) return;
  const container = document.getElementById('classic-ofp-container');
  const wrapper = container && container.querySelector('.ofp-pdf-page[data-page-index="' + index + '"]');
  if (!wrapper || !isClassicOfpPageNearViewport(wrapper)) return;

  classicOfpPdfQueuedPages.add(index);
  classicOfpPdfRenderQueue = classicOfpPdfRenderQueue
    .then(async () => {
      classicOfpPdfQueuedPages.delete(index);
      if (classicOfpPdfDocument && isClassicOfpPageNearViewport(wrapper)) {
        await renderClassicOfpPdfPage(index);
      }
    })
    .catch(error => console.warn('Classic OFP render queue error', error));
}

function releaseClassicOfpPdfPage(index) {
  const container = document.getElementById('classic-ofp-container');
  const wrapper = container && container.querySelector('.ofp-pdf-page[data-page-index="' + index + '"]');
  if (!wrapper || isClassicOfpPageNearViewport(wrapper)) return;

  const task = classicOfpPdfRenderTasks[index];
  if (task) {
    try { task.cancel(); } catch (e) {}
  }
  const page = classicOfpPdfPages[index];
  if (page && page.cleanup) {
    try { page.cleanup(); } catch (e) {}
  }
  delete classicOfpPdfPages[index];

  const pdfCanvas = wrapper.querySelector('.ofp-pdf-canvas');
  if (pdfCanvas) {
    pdfCanvas.width = 1;
    pdfCanvas.height = 1;
  }
  wrapper.dataset.renderedScale = '';
  wrapper.dataset.pdfRendered = 'false';

  const annotationCanvas = wrapper.querySelector('.ofp-annotation-canvas');
  if (annotationCanvas && !annotationCanvas._ofpDrawing) {
    annotationCanvas.width = 1;
    annotationCanvas.height = 1;
    annotationCanvas.dataset.restoreToken = String((Number(annotationCanvas.dataset.restoreToken) || 0) + 1);
    annotationCanvas.dataset.annotationInitialized = 'false';
  }
}

async function renderClassicOfpPdfPage(index) {
  const pdfDocument = classicOfpPdfDocument;
  if (!pdfDocument) return;
  const container = document.getElementById('classic-ofp-container');
  const wrapper = container && container.querySelector('.ofp-pdf-page[data-page-index="' + index + '"]');
  if (!wrapper || !isClassicOfpPageNearViewport(wrapper)) return;

  const pdfCanvas = wrapper.querySelector('.ofp-pdf-canvas');
  if (!pdfCanvas) return;
  const scale = classicOfpBaseScale * classicOfpZoom;
  const renderKey = String(Math.round(scale * 10000) / 10000);
  if (wrapper.dataset.renderedScale === renderKey) return;

  const oldTask = classicOfpPdfRenderTasks[index];
  if (oldTask) {
    try { oldTask.cancel(); } catch (e) {}
  }

  let activeRenderTask = null;
  try {
    const page = classicOfpPdfPages[index] || await pdfDocument.getPage(index + 1);
    if (pdfDocument !== classicOfpPdfDocument) return;
    if (!isClassicOfpPageNearViewport(wrapper)) {
      if (page.cleanup) page.cleanup();
      delete classicOfpPdfPages[index];
      return;
    }
    classicOfpPdfPages[index] = page;

    const viewport = page.getViewport({ scale });
    const pageBaseViewport = page.getViewport({ scale: 1 });
    const baseWidth = pageBaseViewport.width * classicOfpBaseScale;
    const baseHeight = pageBaseViewport.height * classicOfpBaseScale;
    wrapper.dataset.baseWidth = String(baseWidth);
    wrapper.dataset.baseHeight = String(baseHeight);
    wrapper.style.width = (baseWidth * classicOfpZoom) + 'px';
    wrapper.style.height = (baseHeight * classicOfpZoom) + 'px';

    // Cap the backing-store size as well as DPR to keep landscape iPads within memory limits.
    const maxBackingPixels = 8_000_000;
    const desiredScale = Math.min(window.devicePixelRatio || 1, 1.45);
    const areaScale = Math.sqrt(maxBackingPixels / Math.max(1, viewport.width * viewport.height));
    const outputScale = Math.min(desiredScale, areaScale);
    pdfCanvas.width = Math.max(1, Math.ceil(viewport.width * outputScale));
    pdfCanvas.height = Math.max(1, Math.ceil(viewport.height * outputScale));
    pdfCanvas.style.width = viewport.width + 'px';
    pdfCanvas.style.height = viewport.height + 'px';
    const context = pdfCanvas.getContext('2d', { alpha: false });
    activeRenderTask = page.render({
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
    });
    classicOfpPdfRenderTasks[index] = activeRenderTask;
    await activeRenderTask.promise;
    if (pdfDocument !== classicOfpPdfDocument) return;
    const currentScaleKey = String(Math.round(classicOfpBaseScale * classicOfpZoom * 10000) / 10000);
    if (currentScaleKey !== renderKey) {
      wrapper.dataset.renderedScale = '';
      wrapper.dataset.pdfRendered = 'false';
    } else {
      wrapper.dataset.renderedScale = renderKey;
      wrapper.dataset.pdfRendered = 'true';
      initializeClassicOfpAnnotationCanvases(getFlight(currentFlightId), index);
    }
  } catch (e) {
    if (e && e.name !== 'RenderingCancelledException') {
      console.warn('Classic OFP PDF page render failed', index + 1, e);
    }
  } finally {
    if (classicOfpPdfRenderTasks[index] === activeRenderTask) {
      delete classicOfpPdfRenderTasks[index];
    }
    const currentScaleKey = String(Math.round(classicOfpBaseScale * classicOfpZoom * 10000) / 10000);
    if (pdfDocument === classicOfpPdfDocument &&
        wrapper.dataset.renderedScale !== currentScaleKey &&
        isClassicOfpPageNearViewport(wrapper)) {
      queueClassicOfpPdfPage(index);
    }
  }
}

function applyClassicOfpZoom() {
  const container = document.getElementById('classic-ofp-container');
  const zoomValue = document.getElementById('ofp-zoom-value');
  if (!container) return;

  if (classicOfpPdfDocument) {
    const wrappers = container.querySelectorAll('.ofp-pdf-page');
    wrappers.forEach(wrapper => {
      const width = Number(wrapper.dataset.baseWidth) * classicOfpZoom;
      const height = Number(wrapper.dataset.baseHeight) * classicOfpZoom;
      wrapper.style.width = width + 'px';
      wrapper.style.height = height + 'px';
      const canvas = wrapper.querySelector('.ofp-pdf-canvas');
      if (canvas) {
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
      }
      wrapper.dataset.renderedScale = '';
      wrapper.dataset.pdfRendered = 'false';
    });
    initializeClassicOfpAnnotationCanvases(getFlight(currentFlightId));
    queueVisibleClassicOfpPages();
  } else {
    container.querySelectorAll('.ofp-page').forEach(page => {
      page.style.width = (210 * classicOfpZoom) + 'mm';
      page.style.maxWidth = 'none';
      page.style.zoom = '1';
      page.style.transform = 'none';
    });
    initializeClassicOfpAnnotationCanvases(getFlight(currentFlightId));
  }

  if (zoomValue) zoomValue.textContent = Math.round(classicOfpZoom * 100) + '%';
}

function setClassicOfpZoom(nextZoom, anchorClientX, anchorClientY) {
  const viewport = document.getElementById('classic-ofp-viewport');
  if (!viewport) return;
  const previousZoom = classicOfpZoom;
  const zoom = Math.max(0.55, Math.min(2.6, Number(nextZoom) || 1));
  if (Math.abs(zoom - previousZoom) < 0.005) return;

  const rect = viewport.getBoundingClientRect();
  const localX = Number.isFinite(anchorClientX) ? anchorClientX - rect.left : viewport.clientWidth / 2;
  const localY = Number.isFinite(anchorClientY) ? anchorClientY - rect.top : viewport.clientHeight / 2;
  const contentX = viewport.scrollLeft + localX;
  const contentY = viewport.scrollTop + localY;
  const ratio = zoom / previousZoom;

  classicOfpZoom = zoom;
  applyClassicOfpZoom();

  requestAnimationFrame(() => {
    viewport.scrollLeft = Math.max(0, contentX * ratio - localX);
    viewport.scrollTop = Math.max(0, contentY * ratio - localY);
    queueVisibleClassicOfpPages();
  });
}

function bindClassicOfpPinchZoom() {
  const viewport = document.getElementById('classic-ofp-viewport');
  if (!viewport || viewport.dataset.pinchZoomBound === 'true') return;
  viewport.dataset.pinchZoomBound = 'true';

  const finishPinch = commit => {
    const state = classicOfpPinchState;
    if (!state) return;
    classicOfpPinchState = null;

    const container = document.getElementById('classic-ofp-container');
    if (container) {
      container.classList.remove('is-pinch-preview');
      container.style.removeProperty('--ofp-pinch-scale');
      container.style.removeProperty('--ofp-pinch-origin-x');
      container.style.removeProperty('--ofp-pinch-origin-y');
    }

    if (!commit || Math.abs(state.previewZoom - state.startZoom) < 0.005) {
      const zoomValue = document.getElementById('ofp-zoom-value');
      if (zoomValue) zoomValue.textContent = Math.round(classicOfpZoom * 100) + '%';
      return;
    }

    classicOfpZoom = state.previewZoom;
    applyClassicOfpZoom();
    const ratio = classicOfpZoom / state.startZoom;
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, state.contentX * ratio - state.localX);
      viewport.scrollTop = Math.max(0, state.contentY * ratio - state.localY);
      queueVisibleClassicOfpPages();
    });
  };

  viewport.addEventListener('touchstart', event => {
    if (event.touches.length !== 2) {
      if (classicOfpPinchState) finishPinch(true);
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const a = event.touches[0], b = event.touches[1];
    const midX = (a.clientX + b.clientX) / 2;
    const midY = (a.clientY + b.clientY) / 2;
    const localX = midX - rect.left;
    const localY = midY - rect.top;
    classicOfpPinchState = {
      startDistance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
      startZoom: classicOfpZoom,
      previewZoom: classicOfpZoom,
      contentX: viewport.scrollLeft + localX,
      contentY: viewport.scrollTop + localY,
      localX,
      localY
    };
  }, { passive: true });

  viewport.addEventListener('touchmove', event => {
    const state = classicOfpPinchState;
    if (!state || event.touches.length !== 2) return;
    event.preventDefault();

    const a = event.touches[0], b = event.touches[1];
    const distance = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));
    const nextZoom = Math.max(0.55, Math.min(2.6,
      state.startZoom * distance / state.startDistance));
    const rect = viewport.getBoundingClientRect();
    state.localX = (a.clientX + b.clientX) / 2 - rect.left;
    state.localY = (a.clientY + b.clientY) / 2 - rect.top;
    state.previewZoom = nextZoom;

    const container = document.getElementById('classic-ofp-container');
    if (container) {
      container.classList.add('is-pinch-preview');
      container.style.setProperty('--ofp-pinch-scale', String(nextZoom / state.startZoom));
      container.style.setProperty('--ofp-pinch-origin-x', state.contentX + 'px');
      container.style.setProperty('--ofp-pinch-origin-y', state.contentY + 'px');
    }
    const zoomValue = document.getElementById('ofp-zoom-value');
    if (zoomValue) zoomValue.textContent = Math.round(nextZoom * 100) + '%';
  }, { passive: false });

  viewport.addEventListener('touchend', event => {
    if (event.touches.length < 2) finishPinch(true);
  }, { passive: true });
  viewport.addEventListener('touchcancel', () => finishPinch(false), { passive: true });
}

function restoreClassicOfpCanvas(canvas, dataUrl) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!dataUrl) return;
  const restoreToken = (Number(canvas.dataset.restoreToken) || 0) + 1;
  canvas.dataset.restoreToken = String(restoreToken);
  const image = new Image();
  image.onload = () => {
    if (Number(canvas.dataset.restoreToken) !== restoreToken || canvas.width <= 1) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = rect.width > 0 ? canvas.width / rect.width : 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(image, 0, 0, rect.width, rect.height);
  };
  image.src = dataUrl;
}

function initializeClassicOfpAnnotationCanvases(flight, onlyPageIndex) {
  const annotations = getClassicOfpAnnotations(flight);
  const viewport = document.getElementById('classic-ofp-viewport');
  const viewportRect = viewport ? viewport.getBoundingClientRect() : null;
  const canvases = document.querySelectorAll('#classic-ofp-container .ofp-annotation-canvas');

  canvases.forEach(canvas => {
    const pageIndex = Number(canvas.dataset.pageIndex);
    if (onlyPageIndex !== undefined && onlyPageIndex !== null && pageIndex !== Number(onlyPageIndex)) return;
    const page = canvas.closest('.ofp-page, .ofp-pdf-page');
    if (!page) return;

    const rect = page.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nearViewport = !viewportRect ||
      (rect.bottom >= viewportRect.top - 300 && rect.top <= viewportRect.bottom + 300);

    // The annotation overlay can itself consume tens of MB per page on a Retina iPad.
    // Keep off-screen overlays at 1x1 and restore their saved image only near the viewport.
    if (!nearViewport && !canvas._ofpDrawing) {
      if (canvas.width !== 1 || canvas.height !== 1) {
        canvas.width = 1;
        canvas.height = 1;
      }
      canvas.dataset.annotationInitialized = 'false';
      return;
    }

    const maxAnnotationPixels = 3_000_000;
    const desiredAnnotationDpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const annotationAreaDpr = Math.sqrt(maxAnnotationPixels / Math.max(1, rect.width * rect.height));
    const dpr = Math.min(desiredAnnotationDpr, annotationAreaDpr);
    const targetWidth = Math.max(1, Math.round(rect.width * dpr));
    const targetHeight = Math.max(1, Math.round(rect.height * dpr));
    const resized = canvas.width !== targetWidth || canvas.height !== targetHeight;
    if (resized) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      canvas.dataset.annotationInitialized = 'false';
    }

    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.style.pointerEvents = 'auto';
    canvas.style.touchAction = 'pan-x pan-y';
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

    if (resized || canvas.dataset.annotationInitialized !== 'true') {
      restoreClassicOfpCanvas(canvas, annotations[canvas.dataset.pageIndex] || '');
      canvas.dataset.annotationInitialized = 'true';
    }
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
  bindClassicOfpPinchZoom();
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
        setClassicOfpZoom(classicOfpZoom + 0.1);
      } else if (action === 'zoom-out') {
        setClassicOfpZoom(classicOfpZoom - 0.1);
      } else if (action === 'zoom-fit') {
        setClassicOfpZoom(1);
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

  document.querySelectorAll('#classic-ofp-container .ofp-page, #classic-ofp-container .ofp-pdf-page').forEach(page => {
    page.addEventListener('pointerdown', () => {
      classicOfpCurrentPage = Number(page.dataset.pageIndex) || 0;
    }, { passive: true });
  });
  initializeClassicOfpAnnotationCanvases(flight);
}


function initBriefingInteractions() {
  bindBriefingTabs();
}
