/* app.js — interfaz y lógica de la aplicación. */

(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const fmt = Charts.formatMl;

  /* ============================================================
     1. NFC / parámetros de URL
     Un tag NFC graba una URL como  .../?add=250  o  .../?add=glass
     Al abrirse, registramos y limpiamos el parámetro para que un
     refresco no lo cuente dos veces.
  ============================================================ */
  function handleUrlIntake() {
    const params = new URLSearchParams(location.search);
    const raw = params.get('add');
    if (raw == null) return;

    // Anti–doble conteo: mismo valor tocado hace < 8 s se ignora.
    const sig = `${raw}`;
    const last = sessionStorage.getItem('lastAdd');
    const now = Date.now();
    let amount = 0;

    if (raw === 'glass') amount = Store.settings.glassMl;
    else amount = parseInt(raw, 10);

    // limpia la URL siempre
    history.replaceState(null, '', location.pathname);

    if (!Number.isFinite(amount) || amount <= 0) return;

    if (last) {
      const [lsig, lts] = last.split('|');
      if (lsig === sig && now - Number(lts) < 8000) {
        toast('Ya contado hace un momento 👍');
        return;
      }
    }
    sessionStorage.setItem('lastAdd', `${sig}|${now}`);

    const entry = Store.addEntry(amount);
    if (entry) {
      const total = Store.totalForDay();
      const goal = Store.settings.dailyGoalMl;
      toast(`+${fmt(amount)} · llevas ${fmt(total)} de ${fmt(goal)}`);
      pulseBottle();
    }
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

  function renderToday() {
    const total = Store.totalForDay();
    const goal = Store.settings.dailyGoalMl;
    const pct = goal > 0 ? total / goal : 0;
    const shownPct = Math.round(pct * 100);

    // superficie del agua dentro del clip (30 = arriba, 330 = fondo)
    const clamped = Math.max(0, Math.min(1, pct));
    const surfaceY = 330 - clamped * 300;
    waterWave.setAttribute('d', wavePath(surfaceY));
    waterWaveBack.setAttribute('d', wavePath(surfaceY + 3));

    $('#todayTotal').textContent = fmt(total);
    $('#todayGoal').textContent = `de ${fmt(goal)}`;
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
    const entry = Store.addEntry(ml);
    if (!entry) return;
    renderToday();
    renderHistory();
    pulseBottle();
    toast(`+${fmt(ml)}`);
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
  function syncSettingsInputs() {
    const s = Store.settings;
    $('#setGoal').value = s.dailyGoalMl;
    $('#setQuick').value = s.quickAmounts.join(', ');
    $('#setGlass').value = s.glassMl;
    const base = location.origin + location.pathname.replace(/index\.html$/, '');
    $('#nfcUrlGlass').textContent = `${base}?add=glass`;
    $('#nfcUrlFixed').textContent = `${base}?add=500`;
  }

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

  /* export / import */
  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agua-backup-${Store.dayKey(Date.now())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

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

  handleUrlIntake();
  setDateLabel();
  syncSettingsInputs();
  renderAll();

  // si el día cambia mientras la app está abierta, refresca
  let today = Store.dayKey(Date.now());
  setInterval(() => {
    const now = Store.dayKey(Date.now());
    if (now !== today) { today = now; setDateLabel(); renderAll(); }
  }, 60000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { setDateLabel(); renderAll(); }
  });

  // service worker (PWA offline)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
