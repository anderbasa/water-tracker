/* app.js — interfaz y lógica de la aplicación. */

import { Store } from './store.js';
import { Charts } from './charts.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmt = Charts.formatMl;
const DAY_MS = 86400000;

/* ============================================================
   Haptics — vibración real en iPhone (iOS 18+) con el truco del
   <input type="checkbox" switch"> pintado y persistente. Debe llamarse de
   forma SÍNCRONA dentro del gesto de toque, antes de cualquier await.
   En el resto de navegadores (o iOS < 18) no hace nada, sin errores.
============================================================ */
let hapticSwitch = null;
function initHaptics() {
  hapticSwitch = document.createElement('input');
  hapticSwitch.type = 'checkbox';
  hapticSwitch.setAttribute('switch', '');
  hapticSwitch.setAttribute('aria-hidden', 'true');
  hapticSwitch.tabIndex = -1;
  hapticSwitch.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.011;pointer-events:none;';
  document.body.appendChild(hapticSwitch);
}
function vibrar() {
  try {
    if (hapticSwitch) { hapticSwitch.click(); return; }
    if (navigator.vibrate) navigator.vibrate(12);
  } catch { /* silencioso: la app funciona igual sin haptics */ }
}

/* Marca (una vez por día) si toca celebrar por haber cruzado el objetivo
   en este añadido. Solo devuelve true la primera vez que pasa cada día. */
function shouldCelebrateGoal(totalBefore, totalAfter, goal) {
  if (totalBefore >= goal || totalAfter < goal) return false;
  const key = 'water-tracker:celebratedDay';
  const today = Store.dayKey(Date.now());
  if (localStorage.getItem(key) === today) return false;
  localStorage.setItem(key, today);
  return true;
}

/* objetivo de hoy, incluyendo la subida por calor si se aceptó (solo para hoy,
   no cambia el ajuste permanente ni el histórico) */
function getEffectiveGoal() {
  const s = Store.settings;
  const today = Store.dayKey(Date.now());
  if (s.weatherBoost && s.weatherBoost.day === today) {
    return s.dailyGoalMl + s.weatherBoost.extraMl;
  }
  return s.dailyGoalMl;
}

/* pequeña lluvia de confeti dentro de `container` (debe tener position != static) */
function burstConfetti(container, count = 22) {
  const colors = ['#4fb8ff', '#0a84ff', '#35c759', '#ffd60a', '#ff9f0a', '#bf5af2'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'confetti-piece';
    const delay = Math.random() * 0.25;
    const dur = 1 + Math.random() * 0.6;
    p.style.setProperty('--x', `${Math.random() * 100}%`);
    p.style.setProperty('--rot', `${Math.random() * 360}deg`);
    p.style.setProperty('--delay', `${delay}s`);
    p.style.setProperty('--dur', `${dur}s`);
    p.style.background = colors[i % colors.length];
    container.appendChild(p);
    setTimeout(() => p.remove(), (delay + dur + 0.2) * 1000);
  }
}

/* ============================================================
   1. NFC / parámetros de URL
   Un tag NFC (o un Atajo) abre una URL como  .../?add=250  o  .../?add=glass
   Al abrirse, registramos y limpiamos el parámetro para que un
   refresco no lo cuente dos veces.
============================================================ */
function handleUrlIntake() {
  const params = new URLSearchParams(location.search);
  const raw = params.get('add');
  if (raw == null) return null;

  // Anti–doble conteo: mismo valor tocado hace < 8 s se ignora.
  const sig = `${raw}`;
  const last = sessionStorage.getItem('lastAdd');
  const now = Date.now();
  let amount = 0;

  if (raw === 'glass') amount = Store.settings.glassMl;
  else amount = parseInt(raw, 10);

  // limpia la URL siempre
  history.replaceState(null, '', location.pathname);

  if (!Number.isFinite(amount) || amount <= 0) return null;

  if (last) {
    const [lsig, lts] = last.split('|');
    if (lsig === sig && now - Number(lts) < 8000) {
      return { duplicate: true };
    }
  }
  sessionStorage.setItem('lastAdd', `${sig}|${now}`);

  const totalBefore = Store.totalForDay();
  const entry = Store.addEntry(amount);
  if (!entry) return null;
  const total = Store.totalForDay();
  const goal = getEffectiveGoal();
  return { amount, total, goal, celebrate: shouldCelebrateGoal(totalBefore, total, goal) };
}

/* pantalla de confirmación grande tras tocar la pegatina */
function showNfcConfirm(info) {
  const box = $('#nfcConfirm');
  if (info.duplicate) {
    toast('Ya contado hace un momento 👍');
    return;
  }
  vibrar();
  const pct = info.goal > 0 ? Math.round((info.total / info.goal) * 100) : 0;
  $('#ncAmt').textContent = `+${fmt(info.amount)}`;
  $('#ncTotal').textContent = `Hoy llevas ${fmt(info.total)} de ${fmt(info.goal)}`;
  $('#ncBar').style.width = Math.min(100, pct) + '%';
  $('#ncPct').textContent = pct + '%';
  $('#ncCelebrate').hidden = !info.celebrate;
  box.hidden = false;
  requestAnimationFrame(() => box.classList.add('show'));
  pulseBottle();
  if (info.celebrate) { burstConfetti(box, 28); setTimeout(vibrar, 180); }

  const close = () => {
    box.classList.remove('show');
    setTimeout(() => { box.hidden = true; }, 300);
    clearTimeout(box._t);
    box.removeEventListener('click', close);
  };
  box.addEventListener('click', close);
  box._t = setTimeout(close, info.celebrate ? 5000 : 4000);
}

/* ============================================================
   2. Vista HOY
============================================================ */
const bottleReadout = $('.bottle-readout');
const waterWave = $('#waterWave');
const waterWaveBack = $('#waterWaveBack');

function wavePath(surfaceY) {
  // onda seno aproximada con curvas, más ancha que la botella
  const amp = 4, wl = 110, x0 = -140, x1 = 340, bottom = 360;
  let d = `M ${x0} ${surfaceY}`;
  for (let x = x0; x < x1; x += wl) {
    d += ` q ${wl / 4} ${-amp}, ${wl / 2} 0 t ${wl / 2} 0`;
  }
  d += ` L ${x1} ${bottom} L ${x0} ${bottom} Z`;
  return d;
}

/* ritmo del día: compara lo bebido con lo esperable a esta hora,
   según el horario habitual configurado en Ajustes (por defecto 08:00–22:00) */
function timeToMinutes(hhmm) {
  const [h, m] = (hhmm || '').split(':').map(Number);
  return (Number.isFinite(h) ? h : 8) * 60 + (Number.isFinite(m) ? m : 0);
}

function computePacing(total, goal) {
  if (total >= goal) return { state: 'done' };
  const s = Store.settings;
  const startMin = timeToMinutes(s.wakeTime || '08:00');
  const endMin = timeToMinutes(s.sleepTime || '22:00');
  if (endMin <= startMin) return null; // horario inválido, no mostramos nada
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin <= startMin) return { state: 'early' };
  if (nowMin >= endMin) return { state: 'late', diff: goal - total };
  const expected = goal * ((nowMin - startMin) / (endMin - startMin));
  const diff = total - expected;
  if (diff >= 80) return { state: 'ahead', diff: Math.round(diff) };
  if (diff <= -80) return { state: 'behind', diff: Math.round(-diff) };
  return { state: 'ontrack' };
}

function renderPacing(total, goal) {
  const el = $('#pacingNote');
  const p = computePacing(total, goal);
  if (!p) { el.hidden = true; return; }
  el.hidden = false;
  el.className = 'pacing-note';
  const texts = {
    done: ['✓ Objetivo del día cumplido', 'is-good'],
    early: ['Aún es pronto — tienes todo el día por delante', 'is-neutral'],
    late: [`Se acaba el día y te faltan ${fmt(p.diff)}`, 'is-behind'],
    ahead: [`Vas ${fmt(p.diff)} por delante de tu ritmo 👍`, 'is-good'],
    behind: [`Vas ${fmt(p.diff)} por debajo de tu ritmo`, 'is-behind'],
    ontrack: ['Vas al ritmo justo', 'is-neutral'],
  };
  const [text, cls] = texts[p.state];
  el.textContent = text;
  el.classList.add(cls);
}

function renderToday() {
  const total = Store.totalForDay();
  const goal = getEffectiveGoal();
  const boosted = goal !== Store.settings.dailyGoalMl;
  const pct = goal > 0 ? total / goal : 0;
  const shownPct = Math.round(pct * 100);
  renderPacing(total, goal);
  checkBackupReminder();
  renderWellbeing();

  // superficie del agua dentro del clip (30 = arriba, 330 = fondo)
  const clamped = Math.max(0, Math.min(1, pct));
  const surfaceY = 330 - clamped * 300;
  waterWave.setAttribute('d', wavePath(surfaceY));
  waterWaveBack.setAttribute('d', wavePath(surfaceY + 3));

  $('#todayTotal').textContent = fmt(total);
  $('#todayGoal').textContent = `de ${fmt(goal)}` + (boosted ? ' 🌡️' : '');
  $('#todayPct').textContent = `${shownPct}%`;
  bottleReadout.classList.toggle('low', pct < 0.74);

  // lista de tomas
  const entries = Store.entriesForDay().slice().reverse();
  const list = $('#entryList');
  list.innerHTML = '';
  entries.forEach(e => {
    const li = document.createElement('li');
    const t = new Date(e.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    li.innerHTML = `<span class="amt">${fmt(e.amount)}</span><span class="time">${t}</span>`;
    const del = document.createElement('button');
    del.className = 'del';
    del.type = 'button';
    del.setAttribute('aria-label', 'Eliminar');
    del.textContent = '✕';
    del.addEventListener('click', () => {
      vibrar();
      Store.removeEntry(e.id);
      renderToday();
    });
    li.appendChild(del);
    list.appendChild(li);
  });
  $('#entryEmpty').style.display = entries.length ? 'none' : 'block';
}

function pulseBottle() {
  const b = $('.bottle');
  b.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
    { duration: 420, easing: 'ease-out' }
  );
}

function addAmount(ml) {
  vibrar();
  const totalBefore = Store.totalForDay();
  const entry = Store.addEntry(ml);
  if (!entry) return;
  const totalAfter = Store.totalForDay();
  renderToday();
  renderHistory();
  pulseBottle();
  if (shouldCelebrateGoal(totalBefore, totalAfter, getEffectiveGoal())) {
    burstConfetti($('.bottle-wrap'));
    setTimeout(vibrar, 180);
    toast('🎉 ¡Objetivo del día conseguido!');
  } else {
    toast(`+${fmt(ml)}`);
  }
}

/* botones de cantidades rápidas */
function renderQuickAdd() {
  const box = $('#quickAdd');
  box.innerHTML = '';
  Store.settings.quickAmounts.forEach(ml => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `+${ml >= 1000 ? ml / 1000 + ' L' : ml + ' ml'}`;
    btn.addEventListener('click', () => addAmount(ml));
    box.appendChild(btn);
  });
}

/* diálogo cantidad personalizada */
const dlg = $('#customDialog');
$('#customAddBtn').addEventListener('click', () => {
  $('#customAmount').value = '';
  dlg.showModal();
});
$('#customConfirm').addEventListener('click', e => {
  e.preventDefault();
  const v = parseInt($('#customAmount').value, 10);
  dlg.close();
  if (Number.isFinite(v) && v > 0) addAmount(v);
});

/* ============================================================
   2b. Bienestar — "¿cómo notas la hinchazón hoy?"
   Pensado para la retención de líquidos: un check-in diario de 5 segundos
   que, cruzado con el agua bebida, te enseña en Historial si de verdad te
   está ayudando — no es solo "bebe más agua", es "mira si funciona".
============================================================ */
const WELLBEING_FACES = ['😖', '😕', '😐', '🙂', '😄'];

function renderWellbeing() {
  const today = Store.dayKey(Date.now());
  const value = Store.getWellbeing(today);
  const card = $('#wellbeingCard');
  const scale = $('#wellbeingScale');
  const done = $('#wellbeingDone');

  if (value) {
    scale.hidden = true;
    done.hidden = false;
    done.querySelector('.wb-face').textContent = WELLBEING_FACES[value - 1];
    card.classList.add('is-answered');
  } else {
    scale.hidden = false;
    done.hidden = true;
    card.classList.remove('is-answered');
  }
  $$('#wellbeingScale button').forEach(b => b.classList.toggle('is-selected', Number(b.dataset.v) === value));
}

$('#wellbeingScale').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  vibrar();
  Store.setWellbeing(Store.dayKey(Date.now()), Number(btn.dataset.v));
  renderWellbeing();
  renderWellbeingInsight();
  toast('Gracias, apuntado 👍');
});

$('#wellbeingDone').addEventListener('click', () => {
  $('#wellbeingScale').hidden = false;
  $('#wellbeingDone').hidden = true;
});

/* ============================================================
   3. Vista HISTORIAL
============================================================ */
let currentRange = 'week';

function renderHistory() {
  const goal = Store.settings.dailyGoalMl;
  let data, showGoal = goal;

  if (currentRange === 'week') {
    data = Store.dailyTotals(7).map(d => ({
      label: d.date.toLocaleDateString('es-ES', { weekday: 'narrow' }),
      fullLabel: d.date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' }),
      total: d.total, goalMet: d.goalMet,
    }));
  } else if (currentRange === 'month') {
    data = Store.dailyTotals(30).map(d => ({
      label: String(d.date.getDate()),
      fullLabel: d.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
      total: d.total, goalMet: d.goalMet,
    }));
  } else {
    data = Store.monthlyTotals(12).map(m => ({
      label: m.label, fullLabel: m.date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
      total: m.total, goalMet: false,
    }));
    showGoal = null; // el objetivo diario no aplica a barras mensuales
  }

  Charts.renderBars($('#barChart'), $('#chartLabels'), data, showGoal);

  // estadísticas
  if (currentRange === 'year') {
    const totals = Store.monthlyTotals(12).map(m => m.total).filter(t => t > 0);
    const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
    $('#statAvg').textContent = avg ? fmt(Math.round(avg)) : '–';
    $('#statAvg').nextElementSibling.textContent = 'Media / mes';
  } else {
    const days = currentRange === 'week' ? 7 : 30;
    const dt = Store.dailyTotals(days);
    const withData = dt.filter(d => d.total > 0);
    const avg = withData.length ? withData.reduce((s, d) => s + d.total, 0) / withData.length : 0;
    $('#statAvg').textContent = avg ? fmt(Math.round(avg)) : '–';
    $('#statAvg').nextElementSibling.textContent = 'Media / día';
    $('#statGoalDays').textContent = `${dt.filter(d => d.goalMet).length}/${days}`;
  }
  $('#statStreak').textContent = `${Store.currentStreak()} d`;

  renderWellbeingInsight();
}

function renderWellbeingInsight() {
  const card = $('#wellbeingInsightCard');
  const text = $('#wellbeingInsightText');
  if (!card) return;
  const r = Store.wellbeingInsight();
  if (!r.ready) {
    const left = Math.max(0, r.need - r.have);
    text.textContent = left > 0
      ? `Sigue apuntando cómo te sientes cada día (te faltan ${left} días más con dato de agua y bienestar) para ver si beber más te ayuda.`
      : 'Sigue apuntando unos días más para ver el patrón.';
    card.classList.remove('is-ready');
  } else {
    const better = r.highAvg > r.lowAvg;
    const diff = Math.abs(r.highAvg - r.lowAvg).toFixed(1);
    text.textContent = better
      ? `Los días que bebes más, tu bienestar medio es ${r.highAvg.toFixed(1)}/5, frente a ${r.lowAvg.toFixed(1)}/5 los días que bebes menos (+${diff}). Parece que te está ayudando 👍`
      : `De momento no se ve una diferencia clara entre los días que bebes más (${r.highAvg.toFixed(1)}/5) y los que bebes menos (${r.lowAvg.toFixed(1)}/5). Dale unas semanas más.`;
    card.classList.add('is-ready');
  }
}

$('#rangeTabs').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  $$('#rangeTabs button').forEach(b => b.classList.toggle('is-active', b === btn));
  currentRange = btn.dataset.range;
  renderHistory();
});

$('#wipeBtn').addEventListener('click', () => {
  if (confirm('¿Seguro que quieres borrar TODOS los registros y ajustes? No se puede deshacer.')) {
    Store.wipe();
    syncSettingsInputs();
    renderAll();
    toast('Datos borrados');
  }
});

/* ============================================================
   4. Vista AJUSTES
============================================================ */
function setIfNotFocused(el, value) {
  if (document.activeElement !== el) el.value = value;
}

function syncSettingsInputs() {
  const s = Store.settings;
  setIfNotFocused($('#setGoal'), s.dailyGoalMl);
  setIfNotFocused($('#setQuick'), s.quickAmounts.join(', '));
  setIfNotFocused($('#setGlass'), s.glassMl);
  setIfNotFocused($('#setWake'), s.wakeTime || '08:00');
  setIfNotFocused($('#setSleep'), s.sleepTime || '22:00');
  $('#setWeatherEnabled').checked = s.weatherSuggestEnabled !== false;
  const base = location.origin + location.pathname.replace(/index\.html$/, '');
  $('#nfcUrlGlass').textContent = `${base}?add=glass`;
  $('#nfcUrlFixed').textContent = `${base}?add=500`;
  $('#syncStatus').hidden = Store.isConfigured;
}

$('#setWake').addEventListener('change', e => {
  Store.updateSettings({ wakeTime: e.target.value || '08:00' });
  renderToday();
});
$('#setSleep').addEventListener('change', e => {
  Store.updateSettings({ sleepTime: e.target.value || '22:00' });
  renderToday();
});

$('#setGoal').addEventListener('change', e => {
  const v = parseInt(e.target.value, 10);
  if (Number.isFinite(v) && v >= 200) { Store.updateSettings({ dailyGoalMl: v }); renderAll(); }
});

$('#setQuick').addEventListener('change', e => {
  const list = e.target.value.split(',').map(x => parseInt(x.trim(), 10)).filter(x => Number.isFinite(x) && x > 0);
  if (list.length) { Store.updateSettings({ quickAmounts: list.slice(0, 5) }); renderQuickAdd(); }
  syncSettingsInputs();
});

$('#setGlass').addEventListener('change', e => {
  const v = parseInt(e.target.value, 10);
  if (Number.isFinite(v) && v > 0) Store.updateSettings({ glassMl: v });
});

/* ---- sugerencia de objetivo si va a hacer calor (Open-Meteo, sin clave) ---- */
$('#setWeatherEnabled').addEventListener('change', e => {
  Store.updateSettings({ weatherSuggestEnabled: e.target.checked });
  if (!e.target.checked) $('#weatherBanner').hidden = true;
});

function showWeatherBanner(maxTemp, extraMl) {
  $('#weatherBannerText').textContent =
    `Hoy se esperan ${Math.round(maxTemp)}°C. ¿Subimos el objetivo a ${fmt(Store.settings.dailyGoalMl + extraMl)} por hoy?`;
  $('#weatherBanner').hidden = false;
  $('#weatherBanner').dataset.extra = extraMl;
}

$('#weatherBannerAccept').addEventListener('click', () => {
  vibrar();
  const extraMl = Number($('#weatherBanner').dataset.extra) || 0;
  Store.updateSettings({ weatherBoost: { day: Store.dayKey(Date.now()), extraMl } });
  $('#weatherBanner').hidden = true;
  renderToday();
  toast(`Objetivo de hoy subido +${fmt(extraMl)} 🌡️`);
});

$('#weatherBannerDismiss').addEventListener('click', () => {
  Store.updateSettings({ weatherDismissedDay: Store.dayKey(Date.now()) });
  $('#weatherBanner').hidden = true;
});

/* consulta la previsión de hoy una vez al día (con caché) y, si va a hacer
   calor, propone subir el objetivo. Falla en silencio sin ubicación/red. */
async function checkWeatherBoost() {
  const s = Store.settings;
  if (s.weatherSuggestEnabled === false) return;
  const today = Store.dayKey(Date.now());
  if (s.weatherDismissedDay === today) return;
  if (s.weatherBoost && s.weatherBoost.day === today) return; // ya aceptada hoy

  let cache = null;
  try { cache = JSON.parse(localStorage.getItem('water-tracker:weatherCache') || 'null'); } catch { /* ignore */ }

  let maxTemp;
  if (cache && cache.day === today) {
    maxTemp = cache.maxTemp;
  } else {
    if (!('geolocation' in navigator)) return;
    const pos = await new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 8000, maximumAge: 3600000 });
    });
    if (!pos) return;
    try {
      const lat = pos.coords.latitude.toFixed(2), lon = pos.coords.longitude.toFixed(2);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max&forecast_days=1&timezone=auto`;
      const res = await fetch(url);
      const data = await res.json();
      maxTemp = data && data.daily && data.daily.temperature_2m_max && data.daily.temperature_2m_max[0];
      if (typeof maxTemp !== 'number') return;
      localStorage.setItem('water-tracker:weatherCache', JSON.stringify({ day: today, maxTemp }));
    } catch { return; /* sin red o API caída: no molestamos */ }
  }

  if (maxTemp < 28) return;
  const boostFrac = maxTemp >= 32 ? 0.20 : 0.10;
  const extraMl = Math.round((Store.settings.dailyGoalMl * boostFrac) / 50) * 50;
  if (extraMl > 0) showWeatherBanner(maxTemp, extraMl);
}

/* export / import */
function downloadFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function doExport() {
  const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
  const name = `agua-backup-${Store.dayKey(Date.now())}.json`;
  const file = new File([blob], name, { type: 'application/json' });

  let shared = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Copia de seguridad — Mi agua' });
      shared = true;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // el usuario canceló: no es un fallo
      // cualquier otro error: caemos a la descarga normal
    }
  }
  if (!shared) downloadFile(blob, name);

  Store.updateSettings({ lastExportAt: Date.now(), backupSnoozeUntil: null });
  checkBackupReminder();
}
$('#exportBtn').addEventListener('click', doExport);
$('#backupBannerExport').addEventListener('click', doExport);
$('#backupBannerSnooze').addEventListener('click', () => {
  Store.updateSettings({ backupSnoozeUntil: Date.now() + 7 * DAY_MS });
  checkBackupReminder();
});

/* aviso si hace tiempo que no se exporta una copia (o nunca) */
function checkBackupReminder() {
  const s = Store.settings;
  const banner = $('#backupBanner');
  const reference = s.lastExportAt || Store.firstEntryTs();
  if (!reference) { banner.hidden = true; return; }
  const days = Math.floor((Date.now() - reference) / DAY_MS);
  const snoozed = s.backupSnoozeUntil && Date.now() < s.backupSnoozeUntil;
  if (days < 14 || snoozed) { banner.hidden = true; return; }
  $('#backupBannerText').textContent = s.lastExportAt
    ? `Hace ${days} días de tu última copia de seguridad.`
    : `Llevas ${days} días registrando agua sin copia de seguridad.`;
  banner.hidden = false;
}

$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    Store.importJSON(text);
    syncSettingsInputs();
    renderAll();
    toast('Datos importados');
  } catch (err) {
    toast('Archivo no válido');
    console.error(err);
  }
  e.target.value = '';
});

/* ============================================================
   5. Navegación por pestañas
============================================================ */
$('.tabbar').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  vibrar();
  const view = btn.dataset.view;
  $$('.tabbar button').forEach(b => b.classList.toggle('is-active', b === btn));
  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === `view-${view}`));
  if (view === 'history') renderHistory();
  window.scrollTo(0, 0);
});

/* ============================================================
   6. Toast
============================================================ */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ============================================================
   7. Arranque
============================================================ */
function renderAll() {
  renderQuickAdd();
  renderToday();
  renderHistory();
}

function setDateLabel() {
  $('#dateLabel').textContent = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

async function boot() {
  initHaptics();
  setDateLabel();
  await Store.ready; // datos de Firestore (o por defecto, si aún no está configurado)
  const intake = handleUrlIntake();
  syncSettingsInputs();
  renderAll();
  if (intake) showNfcConfirm(intake);
  checkWeatherBoost();

  // reacciona a cambios que lleguen de otra pestaña/dispositivo (Safari <-> icono instalado)
  Store.onChange(() => { syncSettingsInputs(); renderAll(); });

  // si el día cambia mientras la app está abierta, refresca
  let today = Store.dayKey(Date.now());
  setInterval(() => {
    const now = Store.dayKey(Date.now());
    if (now !== today) { today = now; setDateLabel(); renderAll(); }
    else { renderToday(); }
  }, 60000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { setDateLabel(); renderAll(); }
  });

  // service worker (PWA offline)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
