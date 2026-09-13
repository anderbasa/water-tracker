/* store.js — capa de datos sobre localStorage.
   Todo se guarda en el navegador de este dispositivo. */

const Store = (() => {
  const KEY = 'water-tracker:v1';

  const DEFAULTS = {
    entries: [],                 // [{ id, ts (epoch ms), amount (ml) }]
    settings: {
      dailyGoalMl: 2000,
      quickAmounts: [200, 330, 500],
      glassMl: 250,
      wakeTime: '08:00',
      sleepTime: '22:00',
      lastExportAt: null,
      backupSnoozeUntil: null,
      weatherSuggestEnabled: true,
      weatherBoost: null,          // { day: 'YYYY-MM-DD', extraMl } tras aceptar la sugerencia
      weatherDismissedDay: null,   // 'YYYY-MM-DD' si hoy se dijo "no, gracias"
    },
  };

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const parsed = JSON.parse(raw);
      return {
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
      };
    } catch (e) {
      console.warn('No se pudieron leer los datos, empezando de cero', e);
      return structuredClone(DEFAULTS);
    }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error('No se pudieron guardar los datos', e);
    }
  }

  /* ---- fecha local en formato YYYY-MM-DD ---- */
  function dayKey(d) {
    const x = new Date(d);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /* ---- API ---- */
  return {
    dayKey,

    get settings() { return { ...state.settings }; },

    updateSettings(patch) {
      state.settings = { ...state.settings, ...patch };
      persist();
    },

    addEntry(amount, ts = Date.now()) {
      const amt = Math.round(Number(amount));
      if (!Number.isFinite(amt) || amt <= 0) return null;
      const entry = { id: `${ts}-${Math.random().toString(36).slice(2, 7)}`, ts, amount: amt };
      state.entries.push(entry);
      state.entries.sort((a, b) => a.ts - b.ts);
      persist();
      return entry;
    },

    removeEntry(id) {
      const before = state.entries.length;
      state.entries = state.entries.filter(e => e.id !== id);
      if (state.entries.length !== before) persist();
    },

    entriesForDay(d = Date.now()) {
      const k = dayKey(d);
      return state.entries.filter(e => dayKey(e.ts) === k).sort((a, b) => a.ts - b.ts);
    },

    totalForDay(d = Date.now()) {
      return this.entriesForDay(d).reduce((s, e) => s + e.amount, 0);
    },

    /* epoch ms del primer registro guardado, o null si no hay ninguno */
    firstEntryTs() {
      return state.entries.length ? state.entries[0].ts : null;
    },

    /* Devuelve [{ key, date, total, goalMet }] para los últimos n días (incluye hoy) */
    dailyTotals(nDays) {
      const goal = state.settings.dailyGoalMl;
      const out = [];
      const now = new Date();
      for (let i = nDays - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const total = this.totalForDay(d);
        out.push({ key: dayKey(d), date: d, total, goalMet: total >= goal });
      }
      return out;
    },

    /* Agrupa por mes: [{ label, total, days }] para los últimos n meses */
    monthlyTotals(nMonths) {
      const now = new Date();
      const out = [];
      for (let i = nMonths - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear(), m = d.getMonth();
        const total = state.entries
          .filter(e => { const x = new Date(e.ts); return x.getFullYear() === y && x.getMonth() === m; })
          .reduce((s, e) => s + e.amount, 0);
        out.push({ label: d.toLocaleDateString('es-ES', { month: 'short' }), date: d, total });
      }
      return out;
    },

    currentStreak() {
      const goal = state.settings.dailyGoalMl;
      let streak = 0;
      const now = new Date();
      for (let i = 0; i < 3650; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const total = this.totalForDay(d);
        if (total >= goal) {
          streak++;
        } else if (i === 0) {
          // hoy aún cuenta: no rompe la racha si todavía no has llegado
          continue;
        } else {
          break;
        }
      }
      return streak;
    },

    exportJSON() {
      return JSON.stringify({ ...state, exportedAt: new Date().toISOString(), app: 'water-tracker', version: 1 }, null, 2);
    },

    importJSON(text) {
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.entries)) throw new Error('Archivo no válido');
      const cleanEntries = parsed.entries
        .filter(e => e && Number.isFinite(Number(e.ts)) && Number.isFinite(Number(e.amount)))
        .map(e => ({
          id: e.id || `${e.ts}-${Math.random().toString(36).slice(2, 7)}`,
          ts: Number(e.ts),
          amount: Math.round(Number(e.amount)),
        }));
      // fusiona sin duplicar por id
      const seen = new Set(state.entries.map(e => e.id));
      for (const e of cleanEntries) if (!seen.has(e.id)) { state.entries.push(e); seen.add(e.id); }
      state.entries.sort((a, b) => a.ts - b.ts);
      if (parsed.settings) state.settings = { ...state.settings, ...parsed.settings };
      persist();
    },

    wipe() {
      state = structuredClone(DEFAULTS);
      persist();
    },
  };
})();
