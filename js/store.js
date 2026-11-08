/* store.js — capa de datos sobre Firestore.
   Entradas, ajustes y bienestar viven en la nube: Safari (pegatina NFC) y la
   app instalada en pantalla de inicio leen y escriben lo mismo. Funciona
   también sin conexión (caché local persistente) y se sincroniza solo.

   Si js/firebase.js aún tiene las claves "PEGA_AQUI_*" sin rellenar, la app
   sigue funcionando en modo local (sin guardar nada entre sesiones) para que
   puedas probarla antes de crear el proyecto de Firebase. */

import { db, conTimeout, isConfigured } from './firebase.js';
import {
  collection, doc, addDoc, deleteDoc, setDoc, getDocs, writeBatch, onSnapshot, query, orderBy,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const DEFAULT_SETTINGS = {
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
};

let state = { entries: [], settings: { ...DEFAULT_SETTINGS }, wellbeing: {} };

const listeners = new Set();
function notify() {
  for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } }
}

/* ---- fecha local en formato YYYY-MM-DD ---- */
function dayKey(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const entriesCol = collection(db, 'entries');
const wellbeingCol = collection(db, 'wellbeing');
const settingsRef = doc(db, 'config', 'settings');

/* dispara una escritura en Firestore en segundo plano; en modo local
   (sin configurar) no hace nada — el estado ya se actualizó al vuelo. */
function fsWrite(factory) {
  if (!isConfigured) return Promise.resolve();
  return conTimeout(factory()).catch(err => console.error('Firestore (escritura)', err));
}

/* ---- arranque: escuchas en tiempo real + promesa "listo" con margen ---- */
let readyResolve;
const readyPromise = new Promise(res => { readyResolve = res; });
let gotEntries = !isConfigured, gotSettings = !isConfigured, gotWellbeing = !isConfigured;
function checkReady() { if (gotEntries && gotSettings && gotWellbeing) readyResolve(); }

const pendingEntryWrites = new Map(); // tempId -> { cancelled }

if (isConfigured) {
  onSnapshot(query(entriesCol, orderBy('ts')), snap => {
    state.entries = snap.docs.map(d => ({ id: d.id, ts: d.data().ts, amount: d.data().amount }));
    gotEntries = true; checkReady(); notify();
  }, err => { console.error('Firestore (entries)', err); gotEntries = true; checkReady(); });

  onSnapshot(settingsRef, snap => {
    state.settings = { ...DEFAULT_SETTINGS, ...(snap.exists() ? snap.data() : {}) };
    gotSettings = true; checkReady(); notify();
  }, err => { console.error('Firestore (settings)', err); gotSettings = true; checkReady(); });

  onSnapshot(wellbeingCol, snap => {
    const map = {};
    snap.forEach(d => { map[d.id] = d.data().value; });
    state.wellbeing = map;
    gotWellbeing = true; checkReady(); notify();
  }, err => { console.error('Firestore (wellbeing)', err); gotWellbeing = true; checkReady(); });
} else {
  readyResolve();
}

/* nunca bloquea el arranque más de 5 s, aunque Firestore no responda */
const ready = Promise.race([
  readyPromise,
  new Promise(res => setTimeout(res, 5000)),
]);

/* ---- API ---- */
export const Store = {
  dayKey,
  ready,
  isConfigured,

  /* fn() se llama cada vez que cambian los datos (incluidos cambios que
     llegan de otra pestaña/dispositivo). Devuelve una función para dejar
     de escuchar. */
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  get settings() { return { ...state.settings }; },

  updateSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    notify();
    fsWrite(() => setDoc(settingsRef, patch, { merge: true }));
  },

  addEntry(amount, ts = Date.now()) {
    const amt = Math.round(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) return null;
    const tempId = `tmp-${ts}-${Math.random().toString(36).slice(2, 7)}`;
    const entry = { id: tempId, ts, amount: amt };
    state.entries.push(entry);
    state.entries.sort((a, b) => a.ts - b.ts);
    notify();

    if (isConfigured) {
      const pending = { cancelled: false };
      pendingEntryWrites.set(tempId, pending);
      conTimeout(addDoc(entriesCol, { amount: amt, ts }))
        .then(ref => { if (pending.cancelled) deleteDoc(ref).catch(() => {}); })
        .catch(err => console.error('Firestore (addEntry)', err))
        .finally(() => pendingEntryWrites.delete(tempId));
    }
    return entry;
  },

  removeEntry(id) {
    const before = state.entries.length;
    state.entries = state.entries.filter(e => e.id !== id);
    if (state.entries.length !== before) notify();

    if (id.startsWith('tmp-')) {
      const pending = pendingEntryWrites.get(id);
      if (pending) pending.cancelled = true;
    } else {
      fsWrite(() => deleteDoc(doc(db, 'entries', id)));
    }
  },

  entriesForDay(d = Date.now()) {
    const k = dayKey(d);
    return state.entries.filter(e => dayKey(e.ts) === k).sort((a, b) => a.ts - b.ts);
  },

  totalForDay(d = Date.now()) {
    return this.entriesForDay(d).reduce((s, e) => s + e.amount, 0);
  },

  totalForDayKey(key) {
    return state.entries.filter(e => dayKey(e.ts) === key).reduce((s, e) => s + e.amount, 0);
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
        continue; // hoy aún cuenta: no rompe la racha si todavía no has llegado
      } else {
        break;
      }
    }
    return streak;
  },

  /* ---- bienestar: ¿cómo notas la hinchazón hoy? (1 mucha – 5 nada) ---- */
  setWellbeing(day, value) {
    state.wellbeing = { ...state.wellbeing, [day]: value };
    notify();
    fsWrite(() => setDoc(doc(wellbeingCol, day), { value, ts: Date.now() }));
  },

  getWellbeing(day) { return state.wellbeing[day] ?? null; },

  /* compara el bienestar medio en los días que bebiste más agua (>= mediana)
     frente a los que bebiste menos. null hasta tener suficientes días. */
  wellbeingInsight(minDays = 5) {
    const rows = Object.keys(state.wellbeing)
      .map(day => ({ day, value: state.wellbeing[day], water: this.totalForDayKey(day) }))
      .filter(r => r.water > 0);
    if (rows.length < minDays) return { ready: false, have: rows.length, need: minDays };
    const waters = rows.map(r => r.water).slice().sort((a, b) => a - b);
    const median = waters[Math.floor(waters.length / 2)];
    const high = rows.filter(r => r.water >= median);
    const low = rows.filter(r => r.water < median);
    if (!high.length || !low.length) return { ready: false, have: rows.length, need: minDays };
    const avg = arr => arr.reduce((s, r) => s + r.value, 0) / arr.length;
    return { ready: true, highAvg: avg(high), lowAvg: avg(low), highCount: high.length, lowCount: low.length };
  },

  exportJSON() {
    return JSON.stringify({
      entries: state.entries.map(({ id, ts, amount }) => ({ id, ts, amount })),
      settings: state.settings,
      wellbeing: state.wellbeing,
      exportedAt: new Date().toISOString(),
      app: 'water-tracker',
      version: 2,
    }, null, 2);
  },

  importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.entries)) throw new Error('Archivo no válido');

    const existingIds = new Set(state.entries.map(e => e.id));
    const withId = [];
    const withoutId = [];
    for (const e of parsed.entries) {
      if (!e || !Number.isFinite(Number(e.ts)) || !Number.isFinite(Number(e.amount))) continue;
      const row = { ts: Number(e.ts), amount: Math.round(Number(e.amount)) };
      if (e.id && typeof e.id === 'string' && !existingIds.has(e.id)) withId.push({ ...row, id: e.id });
      else if (!e.id || !existingIds.has(e.id)) withoutId.push(row);
    }

    const newLocal = [
      ...withId,
      ...withoutId.map(e => ({ ...e, id: `tmp-${e.ts}-${Math.random().toString(36).slice(2, 7)}` })),
    ];
    state.entries.push(...newLocal);
    state.entries.sort((a, b) => a.ts - b.ts);
    if (parsed.settings) state.settings = { ...state.settings, ...parsed.settings };
    if (parsed.wellbeing) state.wellbeing = { ...state.wellbeing, ...parsed.wellbeing };
    notify();

    if (!isConfigured) return;
    (async () => {
      try {
        for (const group of chunk(withId, 400)) {
          const batch = writeBatch(db);
          group.forEach(e => batch.set(doc(entriesCol, e.id), { ts: e.ts, amount: e.amount }));
          await conTimeout(batch.commit());
        }
        for (const group of chunk(withoutId, 400)) {
          const batch = writeBatch(db);
          group.forEach(e => batch.set(doc(entriesCol), { ts: e.ts, amount: e.amount }));
          await conTimeout(batch.commit());
        }
        if (parsed.settings) await fsWrite(() => setDoc(settingsRef, parsed.settings, { merge: true }));
        if (parsed.wellbeing) {
          const batch = writeBatch(db);
          for (const [day, value] of Object.entries(parsed.wellbeing)) {
            batch.set(doc(wellbeingCol, day), { value, ts: Date.now() });
          }
          await conTimeout(batch.commit());
        }
      } catch (err) {
        console.error('Firestore (importJSON)', err);
      }
    })();
  },

  async wipe() {
    state = { entries: [], settings: { ...DEFAULT_SETTINGS }, wellbeing: {} };
    notify();
    if (!isConfigured) return;
    try {
      const [entrySnap, wellbeingSnap] = await Promise.all([getDocs(entriesCol), getDocs(wellbeingCol)]);
      const refs = [...entrySnap.docs.map(d => d.ref), ...wellbeingSnap.docs.map(d => d.ref), settingsRef];
      for (const group of chunk(refs, 400)) {
        const batch = writeBatch(db);
        group.forEach(ref => batch.delete(ref));
        await conTimeout(batch.commit());
      }
    } catch (err) {
      console.error('Firestore (wipe)', err);
    }
  },
};
