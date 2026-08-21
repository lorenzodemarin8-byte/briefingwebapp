/* storage.js
   Wrapper attorno a localStorage. Se in futuro vorrai passare a un backend
   (Firebase/Supabase) per sincronizzare tra più dispositivi, ti basterà
   riscrivere queste funzioni: il resto dell'app non cambia.
*/

const FLIGHTS_KEY = 'mbriefing_flights';
const THEME_KEY = 'mbriefing_theme';

function getFlights() {
  try {
    return JSON.parse(localStorage.getItem(FLIGHTS_KEY)) || {};
  } catch (e) {
    console.error('Errore lettura flights da localStorage', e);
    return {};
  }
}

function getFlight(id) {
  return getFlights()[id] || null;
}

function saveFlight(id, flightData) {
  const all = getFlights();
  // preserva lo stato interattivo (accepted, fuelOrdered) se il volo esiste già
  const existing = all[id] || {};
  all[id] = Object.assign({}, existing, flightData);
  localStorage.setItem(FLIGHTS_KEY, JSON.stringify(all));
}

function updateFlightState(id, partialState) {
  const all = getFlights();
  if (!all[id]) return;
  all[id].state = Object.assign({}, all[id].state, partialState);
  localStorage.setItem(FLIGHTS_KEY, JSON.stringify(all));
}

function deleteFlight(id) {
  const all = getFlights();
  delete all[id];
  localStorage.setItem(FLIGHTS_KEY, JSON.stringify(all));
}

function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'light';
}

function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}
