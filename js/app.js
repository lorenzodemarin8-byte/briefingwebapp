/* js/app.js
   Router principale (#/home e #/flight/<id>), inizializzazione globale e listener di topbar/bottombar.
*/

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

function setBriefingSidebarOpen(open) {
  const sidebar = document.getElementById('briefing-sidebar');
  const nav = document.getElementById('topbar-nav');
  const toggle = document.getElementById('briefing-sidebar-toggle');
  if (sidebar) sidebar.classList.toggle('is-collapsed', !open);
  if (nav) nav.classList.toggle('sidebar-open', Boolean(open));
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(Boolean(open)));
    toggle.setAttribute('aria-label', open ? 'Chiudi menu Briefing' : 'Apri menu Briefing');
    toggle.title = open ? 'Chiudi menu Briefing' : 'Apri menu Briefing';
    toggle.innerHTML = open
      ? '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'
      : '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  }
}

function activateBriefingView() {
  document.body.classList.add('briefing-mode');
  const nav = document.getElementById('topbar-nav');
  if (nav) nav.classList.add('briefing-layout');
  const flight = getFlight(currentFlightId);
  const flightNumber = document.getElementById('briefing-flight-number');
  if (flightNumber) {
    const callsign = flight && flight.raw && typeof extractCallsign === 'function'
      ? extractCallsign(flight.raw)
      : '';
    flightNumber.textContent = callsign === '—' ? '' : callsign;
  }
  setBriefingSidebarOpen(true);
  if (typeof openBriefingGeneral === 'function') openBriefingGeneral();
}

function deactivateBriefingView() {
  document.body.classList.remove('briefing-mode');
  const nav = document.getElementById('topbar-nav');
  if (nav) nav.classList.remove('briefing-layout', 'sidebar-open');
  const sidebar = document.getElementById('briefing-sidebar');
  if (sidebar) sidebar.classList.remove('is-collapsed');
}

function showHome() {
  deactivateBriefingView();
  if (cdmInterval) {
    clearInterval(cdmInterval);
    cdmInterval = null;
  }

  const viewHome = document.getElementById('view-home');
  const viewDash = document.getElementById('view-dashboard');
  const viewBrf = document.getElementById('view-briefing');
  const viewNav = document.getElementById('view-navlog');

  if (viewHome) viewHome.style.display = 'flex';
  if (viewDash) viewDash.style.display = 'none';
  if (viewBrf) viewBrf.style.display = 'none';
  if (viewNav) viewNav.style.display = 'none';

  const title = document.getElementById('topbar-title');
  if (title) title.textContent = 'My Flights';

  const homeBtn = document.getElementById('home-nav-btn');
  if (homeBtn) homeBtn.style.visibility = 'hidden';

  const infoBar = document.getElementById('flight-info-bar');
  if (infoBar) infoBar.style.display = 'none';

  const ofpRefreshBtn = document.getElementById('ofp-refresh-btn');
  if (ofpRefreshBtn) ofpRefreshBtn.style.display = 'none';

  const bottomBar = document.querySelector('.bottombar');
  if (bottomBar) bottomBar.style.display = 'none';

  document.body.classList.remove('in-flight');
  renderFlightsList();
}

function showDashboard(id) {
  try {
    deactivateBriefingView();
    activeNotamFilter = 'all';
    prevCdmState = { tobt: "", tsat: "", ctot: "" };
    isFirstCdmFetch = true;

    const flight = getFlight(id);

    const viewHome = document.getElementById('view-home');
    const viewDash = document.getElementById('view-dashboard');
    const viewBrf = document.getElementById('view-briefing');
    const viewNav = document.getElementById('view-navlog');

    if (viewHome) viewHome.style.display = 'none';
    if (viewDash) viewDash.style.display = 'flex';
    if (viewBrf) viewBrf.style.display = 'none';
    if (viewNav) viewNav.style.display = 'none';

    const homeBtn = document.getElementById('home-nav-btn');
    if (homeBtn) homeBtn.style.visibility = 'visible';

    const ofpRefreshBtn = document.getElementById('ofp-refresh-btn');
    if (ofpRefreshBtn) {
      ofpRefreshBtn.style.display = 'flex';
      ofpRefreshBtn.onclick = refreshCurrentFlightOFP;
    }

    const bottomBar = document.querySelector('.bottombar');
    if (bottomBar) bottomBar.style.display = 'flex';

    document.body.classList.add('in-flight');

    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    const dashTab = document.querySelector('.tab-btn[data-tab="dashboard"]');
    if (dashTab) dashTab.classList.add('active');

    if (!flight) {
      const title = document.getElementById('topbar-title');
      if (title) title.textContent = 'Volo non trovato';
      const infoBar = document.getElementById('flight-info-bar');
      if (infoBar) infoBar.style.display = 'none';
      return;
    }

    const title = document.getElementById('topbar-title');
    if (title) title.textContent = 'Dashboard';

    const infoBar = document.getElementById('flight-info-bar');
    if (infoBar) infoBar.style.display = 'flex';

    if (!flight.state) flight.state = {};
    if (!flight.state.flaggedNotams) flight.state.flaggedNotams = [];
    if (!flight.state.navlogActuals) flight.state.navlogActuals = {};
    if (!flight.state.actualWeights) flight.state.actualWeights = {};
    if (!flight.state.fuelState) flight.state.fuelState = {};
    if (!flight.state.journeyLog) flight.state.journeyLog = {};

    navlogActuals = flight.state.navlogActuals;

    extractAirportsData(flight.raw);
    renderBriefingMenu();

    renderFlightInfoBar(flight);
    renderDashboard(flight);
    resetPager();

  } catch (error) {
    console.error('Errore in showDashboard:', error);
  }
}

/* ---------- INTERAZIONI GENERALI (DRAWER, TASTI, BOTTOMBAR) ---------- */
function openDrawer() {
  const sd = document.getElementById('side-drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (sd) sd.classList.add('open');
  if (overlay) overlay.classList.add('open');
}

function closeDrawer() {
  const sd = document.getElementById('side-drawer');
  const nd = document.getElementById('notif-drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (sd) sd.classList.remove('open');
  if (nd) nd.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

function openNotifDrawer() {
  const nd = document.getElementById('notif-drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (nd) nd.classList.add('open');
  if (overlay) overlay.classList.add('open');
}

function initInteractions() {
  const lastId = localStorage.getItem('mbriefing_sb_id');
  const sbUsername = document.getElementById('sb-username');
  if (lastId && sbUsername) sbUsername.value = lastId;

  const menuToggle = document.getElementById('menu-toggle');
  if (menuToggle) menuToggle.addEventListener('click', openDrawer);

  const drawerClose = document.getElementById('drawer-close');
  if (drawerClose) drawerClose.addEventListener('click', closeDrawer);

  const drawerOverlay = document.getElementById('drawer-overlay');
  if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);

  const notifToggle = document.getElementById('notif-toggle');
  if (notifToggle) notifToggle.addEventListener('click', openNotifDrawer);

  const notifClose = document.getElementById('notif-close');
  if (notifClose) notifClose.addEventListener('click', closeDrawer);

  const notifClearBtn = document.getElementById('notif-clear-btn');
  if (notifClearBtn) {
    notifClearBtn.addEventListener('click', () => {
      notificationsList = [];
      updateNotifUI();
    });
  }

  const sbRefresh = document.getElementById('sb-refresh');
  if (sbRefresh) {
    sbRefresh.addEventListener('click', async () => {
      if (sbUsername) localStorage.setItem('mbriefing_sb_id', sbUsername.value.trim());
      await handleRefresh();
    });
  }

  const contentRefresh = document.getElementById('content-refresh-btn');
  if (contentRefresh) {
    contentRefresh.addEventListener('click', async () => {
      const saved = localStorage.getItem('mbriefing_sb_id');
      if (!saved) {
        openDrawer();
        return;
      }
      if (sbUsername) sbUsername.value = saved;
      await handleRefresh();
    });
  }

  const homeBtn = document.getElementById('home-nav-btn');
  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      window.location.hash = '#/home';
    });
  }

  const briefingSidebarToggle = document.getElementById('briefing-sidebar-toggle');
  if (briefingSidebarToggle) {
    briefingSidebarToggle.addEventListener('click', () => {
      const sidebar = document.getElementById('briefing-sidebar');
      const isOpen = sidebar && !sidebar.classList.contains('is-collapsed');
      setBriefingSidebarOpen(!isOpen);
    });
  }

  initPager();
  setupAcceptanceLogic();
  setupSubmitLogic();
  initBriefingInteractions();
  initDeleteConfirmModal();

  // Chiusura automatica tastiera su iPad (blur fuori dai campi input)
  document.addEventListener('touchstart', (e) => {
    if (!['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(e.target.tagName)) {
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        document.activeElement.blur();
      }
    }
  }, { passive: true });

  // Tab di navigazione inferiore (Dashboard, Briefing, NavLog)
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const tab = btn.dataset.tab;

      const viewDash = document.getElementById('view-dashboard');
      const viewBrf = document.getElementById('view-briefing');
      const viewNav = document.getElementById('view-navlog');

      if (viewDash) viewDash.style.display = tab === 'dashboard' ? 'flex' : 'none';
      if (viewBrf) viewBrf.style.display = tab === 'briefing' ? 'flex' : 'none';
      if (viewNav) viewNav.style.display = tab === 'navlog' ? 'flex' : 'none';

      const title = document.getElementById('topbar-title');

      if (tab === 'dashboard') {
        deactivateBriefingView();
        if (title) title.textContent = 'Dashboard';
      } else if (tab === 'briefing') {
        activateBriefingView();
      } else if (tab === 'navlog') {
        deactivateBriefingView();
        if (title) title.textContent = 'NavLog';
        if (currentFlightId) renderNavLog(currentFlightId);
      } else {
        if (title) title.textContent = btn.textContent;
      }
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
