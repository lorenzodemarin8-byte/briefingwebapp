/* js/myflights.js
   Rendering griglia My Flights, gestione tab Listed / Submitted, card voli, menu eliminazione e refresh SimBrief.
*/

var activeHomeTab = 'listed';
var flightToDeleteId = null;

function renderFlightsList() {
  const all = getFlights();
  const ids = Object.keys(all);
  const list = document.getElementById('flights-list');
  const subList = document.getElementById('submitted-list');
  const empty = document.getElementById('empty-state');
  const listedCountEl = document.getElementById('listed-count');
  const subCountEl = document.getElementById('submitted-count');

  if (!list || !subList) return;

  const listedIds = ids.filter(id => !(all[id].state && all[id].state.submitted));
  const submittedIds = ids.filter(id => all[id].state && all[id].state.submitted);

  if (listedCountEl) listedCountEl.textContent = listedIds.length;
  if (subCountEl) subCountEl.textContent = submittedIds.length;

  const listedBtn = document.getElementById('tab-listed-btn');
  const subBtn = document.getElementById('tab-submitted-btn');
  if (listedBtn) {
    listedBtn.classList.toggle('active', activeHomeTab === 'listed');
    listedBtn.onclick = () => { activeHomeTab = 'listed'; renderFlightsList(); };
  }
  if (subBtn) {
    subBtn.classList.toggle('active', activeHomeTab === 'submitted');
    subBtn.onclick = () => { activeHomeTab = 'submitted'; renderFlightsList(); };
  }

  list.innerHTML = '';
  subList.innerHTML = '';

  const currentIds = activeHomeTab === 'listed' ? listedIds : submittedIds;

  if (currentIds.length === 0) {
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = activeHomeTab === 'listed'
        ? 'Nessun volo in lista. Inserisci il tuo username SimBrief e premi "Refresh da SimBrief".'
        : 'Nessun volo archiviato come "Submitted".';
    }
    list.style.display = 'none';
    subList.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';

  if (activeHomeTab === 'listed') {
    list.style.display = 'grid';
    subList.style.display = 'none';

    listedIds
      .sort((a, b) => (all[b].fetchedAt || 0) - (all[a].fetchedAt || 0))
      .forEach((id) => {
        const flight = all[id];
        const data = flight.raw || {};
        const general = data.general || {};
        const orig = data.origin ? (data.origin.icao_code || data.origin.iata_code) : '????';
        const dest = data.destination ? (data.destination.icao_code || data.destination.iata_code) : '????';
        
        // 3. Header Card (<FlightNumber> (<ATCCallsign>))
        const airline = general.icao_airline || general.iata_airline || '';
        const fltNum = general.flight_number || '';
        const flightNumStr = (airline || fltNum) ? `${airline}${fltNum}` : extractCallsign(data);
        const atcCallsign = (data.atc && data.atc.callsign) ? data.atc.callsign : '';
        const headerTitle = atcCallsign && atcCallsign !== flightNumStr
          ? `${flightNumStr} (${atcCallsign})`
          : (atcCallsign ? `${flightNumStr} (${atcCallsign})` : flightNumStr);

        const times = data.times || {};
        const aircraft = data.aircraft || {};
        const crew = data.crew || {};

        // 6. Captain reale (mai PILOT <id>)
        let cptName = '---';
        if (crew.cpt && typeof crew.cpt === 'string' && crew.cpt.trim() && !crew.cpt.includes('.......')) {
          cptName = crew.cpt.trim();
        }

        // Status
        const isSubmitted = flight.state && flight.state.submitted;
        const isAccepted = flight.state && flight.state.accepted;
        let statusText = 'Not Accepted';
        let statusClass = 'fc-status-unconfirmed';
        let statusStyle = 'color: #d97706; font-weight: 700;';
        if (isSubmitted) {
          statusText = 'Submitted';
          statusClass = 'fc-status-confirmed';
          statusStyle = 'color: #16a34a; font-weight: 700;';
        } else if (isAccepted) {
          statusText = 'Confirmed';
          statusClass = 'fc-status-confirmed';
          statusStyle = 'color: #16a34a; font-weight: 700;';
        }

        // 5. Fuel Order Sync
        const isFuelOrdered = flight.state && flight.state.fuelState && flight.state.fuelState.fuelOrdered;
        const fuelOrderStatusHtml = isFuelOrdered
          ? `<span class="fc-info-val" style="color: #16a34a; font-weight: 700;">Ordered</span>`
          : `<span class="fc-info-val">Not Ordered</span>`;

        // 4. Orari STD / STA + ETD / ETA dinamici
        const schedOut = Number(times.sched_out) || 0;
        const schedIn = Number(times.sched_in) || 0;
        
        let etdUnix = flight.state?.effectiveEtd || (times.est_out ? Number(times.est_out) : null);
        let etaUnix = flight.state?.effectiveEta || (times.est_in ? Number(times.est_in) : null);

        let etdHtml = '';
        if (etdUnix && schedOut && Math.round((etdUnix - schedOut) / 60) !== 0) {
          const diffEtdMin = Math.round((etdUnix - schedOut) / 60);
          const etdColor = diffEtdMin > 0 ? '#d97706' : '#16a34a';
          etdHtml = `<span style="color: ${etdColor}; font-weight: 600; font-size: 11.5px; margin-top: 1px;">${unixToHHMM(etdUnix)}</span>`;
        }

        let etaHtml = '';
        if (etaUnix && schedIn && Math.round((etaUnix - schedIn) / 60) !== 0) {
          const diffEtaMin = Math.round((etaUnix - schedIn) / 60);
          const etaColor = diffEtaMin > 0 ? '#d97706' : '#16a34a';
          etaHtml = `<span style="color: ${etaColor}; font-weight: 600; font-size: 11.5px; margin-top: 1px;">${unixToHHMM(etaUnix)}</span>`;
        }

        // 7. Barra Blu Inferiore della Card: release format <release>/0/0
        const releaseNum = general.release || '1';
        const hasNewVersion = flight.hasNewRelease === true;
        const releaseIcon = hasNewVersion
          ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
          : `✓ `;

        const card = document.createElement('div');
        card.className = 'flight-card';
        card.innerHTML = `
          <div class="fc-header-row">
            <span class="fc-callsign">${headerTitle}</span>
            <button class="fc-menu-btn" title="Options" data-flight-id="${id}">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <circle cx="12" cy="5" r="2.2"/>
                <circle cx="12" cy="12" r="2.2"/>
                <circle cx="12" cy="19" r="2.2"/>
              </svg>
            </button>
            <div class="fc-dropdown" id="dropdown-${id}" style="display:none;">
              <button class="fc-dropdown-item fc-delete-btn" data-flight-id="${id}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>Delete</span>
              </button>
            </div>
          </div>
          <div class="fc-route">${orig} → ${dest}</div>
          <div class="fc-times-row">
            <div>
              <span>${formatDateShortFromUnix(times.sched_out)}</span>
              <span class="fc-times-time">${unixToHHMM(times.sched_out)}</span>
              ${etdHtml}
            </div>
            <div>
              <span>${formatDateShortFromUnix(times.sched_in)}</span>
              <span class="fc-times-time">${unixToHHMM(times.sched_in)}</span>
              ${etaHtml}
            </div>
          </div>
          <div class="fc-info-strip">
            <div>
              <span class="fc-info-label">CTOT</span>
              <span class="fc-info-val">${(flight.state && flight.state.ctot) || 'NA'}</span>
            </div>
            <div>
              <span class="fc-info-label">FUEL ORDER</span>
              ${fuelOrderStatusHtml}
            </div>
          </div>
          <div class="fc-ac-row">
            <div class="fc-ac-left">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
              <span>${aircraft.icaocode || 'A/C'}</span>
            </div>
            <span class="fc-ac-right">${aircraft.reg || '----'}</span>
          </div>
          <div class="fc-bottom-row">
            <div>
              <span class="fc-bottom-label">Captain</span>
              <div class="fc-bottom-val">${cptName}</div>
            </div>
            <div style="text-align:right;">
              <span class="fc-bottom-label">Status</span>
              <div class="${statusClass}" style="${statusStyle}">${statusText}</div>
            </div>
          </div>
          <div class="fc-card-footer">
            <span style="display:flex; align-items:center;">${releaseIcon}${releaseNum}/0/0</span>
          </div>
        `;

        card.addEventListener('click', (e) => {
          if (e.target.closest('.fc-menu-btn') || e.target.closest('.fc-dropdown')) {
            return;
          }
          window.location.hash = `#/flight/${id}`;
        });

        const menuBtn = card.querySelector('.fc-menu-btn');
        const dropdown = card.querySelector('.fc-dropdown');
        const deleteBtn = card.querySelector('.fc-delete-btn');

        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('.fc-dropdown').forEach(d => {
            if (d !== dropdown) d.style.display = 'none';
          });
          dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        });

        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.style.display = 'none';
          openConfirmDeleteModal(id);
        });

        list.appendChild(card);
      });
  } else {
    // SUBMITTED LIST VIEW
    list.style.display = 'none';
    subList.style.display = 'flex';

    submittedIds
      .sort((a, b) => ((all[b].state && all[b].state.submittedAt) || 0) - ((all[a].state && all[a].state.submittedAt) || 0))
      .forEach(id => {
        const flight = all[id];
        const data = flight.raw || {};
        const general = data.general || {};
        const orig = data.origin ? (data.origin.icao_code || data.origin.iata_code) : '????';
        const dest = data.destination ? (data.destination.icao_code || data.destination.iata_code) : '????';
        
        const airline = general.icao_airline || general.iata_airline || '';
        const fltNum = general.flight_number || '';
        const flightNumStr = (airline || fltNum) ? `${airline}${fltNum}` : extractCallsign(data);
        const atcCallsign = (data.atc && data.atc.callsign) ? data.atc.callsign : '';
        const headerTitle = atcCallsign && atcCallsign !== flightNumStr
          ? `${flightNumStr} (${atcCallsign})`
          : (atcCallsign ? `${flightNumStr} (${atcCallsign})` : flightNumStr);

        const crew = data.crew || {};
        let cptName = '---';
        if (crew.cpt && typeof crew.cpt === 'string' && crew.cpt.trim() && !crew.cpt.includes('.......')) {
          cptName = crew.cpt.trim();
        }

        const subDate = (flight.state && flight.state.submittedAt)
          ? formatObsDateTime(new Date(flight.state.submittedAt).toISOString())
          : '--';

        const row = document.createElement('div');
        row.className = 'submitted-row';
        row.innerHTML = `
          <div class="sub-route">${orig} → ${dest}</div>
          <div class="sub-meta">${headerTitle}</div>
          <div class="sub-meta">${cptName}</div>
          <div class="sub-date">✓ ${subDate}</div>
          <button class="sub-view-btn" data-flight-id="${id}">View</button>
        `;

        row.querySelector('.sub-view-btn').addEventListener('click', () => {
          window.location.hash = `#/flight/${id}`;
        });

        subList.appendChild(row);
      });
  }
}

function openConfirmDeleteModal(id) {
  flightToDeleteId = id;
  const overlay = document.getElementById('confirm-delete-modal-overlay');
  const modal = document.getElementById('confirm-delete-modal');
  if (overlay) overlay.classList.add('open');
  if (modal) modal.classList.add('open');
}

function closeConfirmDeleteModal() {
  flightToDeleteId = null;
  const overlay = document.getElementById('confirm-delete-modal-overlay');
  const modal = document.getElementById('confirm-delete-modal');
  if (overlay) overlay.classList.remove('open');
  if (modal) modal.classList.remove('open');
}

function initDeleteConfirmModal() {
  const cancelBtn = document.getElementById('confirm-delete-cancel');
  const confirmBtn = document.getElementById('confirm-delete-ok');
  const overlay = document.getElementById('confirm-delete-modal-overlay');

  if (cancelBtn) cancelBtn.addEventListener('click', closeConfirmDeleteModal);
  if (overlay) overlay.addEventListener('click', closeConfirmDeleteModal);

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      if (flightToDeleteId) {
        deleteFlight(flightToDeleteId);
        closeConfirmDeleteModal();
        renderFlightsList();
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.fc-menu-btn') && !e.target.closest('.fc-dropdown')) {
      document.querySelectorAll('.fc-dropdown').forEach(d => d.style.display = 'none');
    }
  });
}

/* ---------- SIMBRIEF REFRESH ---------- */
async function handleRefresh() {
  const input = document.getElementById('sb-username');
  const status = document.getElementById('sb-status');
  if (!input || !status) return;

  const username = input.value.trim();

  if (!username) {
    status.textContent = 'Inserisci prima uno username o Pilot ID SimBrief.';
    return;
  }
  status.textContent = 'Recupero l\'ultimo OFP da SimBrief...';

  try {
    const data = await fetchSimBriefOFP(username);
    const id = extractFlightId(data);
    const existing = getFlight(id);
    saveFlight(id, {
      raw: data,
      fetchedAt: Date.now(),
      state: (existing && existing.state) || {
        accepted: false,
        submitted: false,
        flaggedNotams: [],
        navlogActuals: {},
        actualWeights: {},
        fuelState: {},
        journeyLog: {}
      }
    });
    status.textContent = `Volo importato: ${extractCallsign(data)} (${data.origin ? data.origin.icao_code : '?'} → ${data.destination ? data.destination.icao_code : '?'})`;
    renderFlightsList();
  } catch (err) {
    console.error(err);
    status.textContent = 'Errore: ' + err.message;
  }
}

async function refreshCurrentFlightOFP() {
  if (!currentFlightId) return;
  const flight = getFlight(currentFlightId);
  if (!flight) return;

  const savedUsername = localStorage.getItem('mbriefing_sb_id');
  if (!savedUsername) {
    showToast("Inserisci prima il tuo username SimBrief nel menu.");
    openDrawer();
    return;
  }

  showToast("Controllo aggiornamenti OFP da SimBrief...");
  try {
    const data = await fetchSimBriefOFP(savedUsername);
    const prevRelease = flight.raw?.general?.release;
    const newRelease = data?.general?.release;

    // Aggiorniamo i dati grezzi preservando tutti gli stati operativi
    saveFlight(currentFlightId, {
      raw: data,
      fetchedAt: Date.now()
    });

    const updated = getFlight(currentFlightId);
    if (typeof extractAirportsData === 'function') extractAirportsData(updated.raw);
    if (typeof renderFlightInfoBar === 'function') renderFlightInfoBar(updated);
    if (typeof renderDashboard === 'function') renderDashboard(updated);
    if (typeof renderBriefingMenu === 'function') renderBriefingMenu();

    if (newRelease && prevRelease && String(newRelease) !== String(prevRelease)) {
      addNotification(`Nuovo rilascio OFP: OFP ${newRelease} (prec. ${prevRelease}). NavLog actuals e NOTAMs flaggati sono stati preservati.`);
      showToast(`Nuovo OFP Rilascio ${newRelease} importato!`);
    } else {
      showToast("OFP sincronizzato con successo. Nessun nuovo rilascio.");
    }
  } catch (err) {
    console.error(err);
    showToast("Errore aggiornamento OFP: " + err.message);
  }
}
