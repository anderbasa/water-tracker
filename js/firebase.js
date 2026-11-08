/* firebase.js — conexión a Firestore.
   Es la base de datos COMPARTIDA entre Safari (donde cae la pegatina NFC) y
   la app instalada en la pantalla de inicio: las dos leen y escriben lo
   mismo, así que ya no importa desde dónde abras la app.

   Rellena PEGA_AQUI_* con la configuración de tu proyecto de Firebase
   (Configuración del proyecto → tus apps → config). Ver README, sección
   "Crear la base de datos (Firestore)". */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'PEGA_AQUI_API_KEY',
  authDomain: 'PEGA_AQUI_PROYECTO.firebaseapp.com',
  projectId: 'PEGA_AQUI_PROYECTO',
  storageBucket: 'PEGA_AQUI_PROYECTO.appspot.com',
  messagingSenderId: 'PEGA_AQUI_SENDER_ID',
  appId: 'PEGA_AQUI_APP_ID',
};

export const isConfigured = !firebaseConfig.apiKey.startsWith('PEGA_AQUI');

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  // deja seguir usando la app sin conexión (NFC con mal cobertura, modo
  // avión...): los cambios se guardan en el móvil y se sincronizan solos
  // en cuanto vuelve la red.
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

/* envuelve una llamada a Firestore para que nunca se quede colgada en
   silencio (con credenciales mal puestas, la promesa de Firestore no
   resuelve ni rechaza — se queda esperando para siempre). */
export function conTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore no responde (revisa js/firebase.js)')), ms)),
  ]);
}
