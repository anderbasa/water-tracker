# Mi registro de agua 💧

App web para registrar el agua que bebes **tocando una pegatina NFC** pegada a tu
botella. Cada toque suma una cantidad, y la app te muestra el progreso del día,
si vas bien de ritmo para la hora que es, y el historial por semana, mes y año.
Incluye también un check-in diario de **bienestar** (pensado para la retención
de líquidos) que cruza con el agua bebida para enseñarte si de verdad te está
ayudando.

- **Gratis, sin cuentas de usuario.** Web estática en GitHub Pages + una base de
  datos Firestore (plan gratuito de Firebase) que es tuya.
- **Los mismos datos en todas partes:** toques la pegatina (va a Safari) o abras
  el icono instalado en la pantalla de inicio, es la misma información.
- Funciona también sin conexión (caché local) y se sincroniza sola al volver.
- Pensada para iPhone: splash screens propias, vibración al registrar, modo
  claro/oscuro automático.

---

## 1. Publicarla en GitHub Pages

1. Crea un repositorio en GitHub, por ejemplo `water-tracker`.
2. Sube todo el contenido de esta carpeta a ese repo (rama `main`).
3. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, rama `main`, carpeta `/ (root)`. Guarda.
4. En un minuto tendrás la app en:
   `https://TU_USUARIO.github.io/water-tracker/`

Cada vez que cambies algo y hagas `push`, Pages se actualiza solo en 1-2
minutos — la app instalada siempre coge la versión más nueva en cuanto tiene
conexión (no hace falta tocar nada del service worker).

---

## 2. Crear la base de datos (Firestore)

Sin esto, la app funciona pero **no guarda nada entre sesiones** (verás un
aviso amarillo en Ajustes). Son 10 minutos, todo desde el navegador, sin
instalar nada ni tarjeta de crédito (Firestore es gratis para este uso).

1. Ve a [console.firebase.google.com](https://console.firebase.google.com/) →
   inicia sesión con tu cuenta de Google → **Crear un proyecto**. Nombre, por
   ejemplo, `water-tracker`. Puedes desactivar Google Analytics (no hace falta).
2. En el menú izquierdo: **Compilación → Firestore Database** → **Crear base de
   datos**. Elige una ubicación (cualquiera europea, p. ej. `eur3`) → modo
   **producción** → Crear.
3. Pestaña **Reglas** de Firestore → borra lo que haya → pega el contenido de
   [`firestore.rules`](firestore.rules) (de este mismo proyecto) → **Publicar**.
   (Son reglas abiertas de lectura/escritura con validación básica de forma —
   no hay usuarios ni contraseñas; el riesgo real es que cualquiera con la URL
   de tu app podría, en teoría, escribir datos. Para un registro personal de
   agua es un riesgo asumible; lo importante es no compartir el enlace.)
4. Icono de engranaje (arriba izq.) → **Configuración del proyecto** → pestaña
   **General** → abajo, en "Tus apps", pulsa el icono `</>` (Web) → ponle un
   nombre (p. ej. "water-tracker web") → **Registrar app**. **No** marques
   Firebase Hosting.
5. Te enseña un bloque `firebaseConfig = { apiKey: "...", ... }`. Copia esos 6
   valores.
6. Abre [`js/firebase.js`](js/firebase.js) en este proyecto (GitHub, o tu
   editor) y sustituye los 6 `PEGA_AQUI_*` por esos valores exactos. Guarda,
   haz commit y push.
7. Abre la app (local o ya publicada): el aviso amarillo de Ajustes debe
   desaparecer. Añade un poco de agua de prueba y comprueba en la consola de
   Firebase (**Firestore Database → Datos**) que aparece la colección
   `entries` con tu registro.

---

## 3. Preparar la pegatina NFC

La app registra el agua cuando se abre con un parámetro en la URL:

| URL a abrir | Qué hace |
| --- | --- |
| `https://TU_USUARIO.github.io/water-tracker/?add=glass` | Suma la "cantidad del vaso NFC" de **Ajustes** (250 ml por defecto). |
| `https://TU_USUARIO.github.io/water-tracker/?add=500` | Suma 500 ml fijos (cambia el número). |

Al registrarse se muestra una confirmación grande (cantidad + total del día +
barra de progreso, con una vibración si tu iPhone la soporta) y se limpia el
parámetro de la URL, así que **recargar nunca vuelve a contar**. Un segundo
toque accidental en menos de 8 s también se ignora.

### Opción A — App Atajos (recomendada en iPhone)

Con Atajos la pegatina se queda **en blanco**: no grabas nada en ella, solo la
usas como "disparador".

1. App **Atajos** → pestaña **Automatización** → **+** → **Crear automatización
   personal** → **NFC**.
2. **Escanear** → acerca el iPhone a la pegatina y ponle un nombre (ej. "Agua").
3. Acción: **Abrir URL** (o "Obtener contenido de URL" no; usa **Abrir URLs**).
   Pega: `https://TU_USUARIO.github.io/water-tracker/?add=glass`
4. Siguiente → **desactiva "Preguntar antes de ejecutar"** y confirma. (En iOS
   16.4+ puedes además desactivar "Notificar al ejecutar" para que sea 100%
   silencioso.)
5. Listo. Pega la pegatina en la botella y toca: se abre Safari un instante,
   registra y enseña la confirmación.

> Truco: si quieres elegir cantidad con un solo tag, añade antes de "Abrir URL"
> la acción **Elegir de un menú** (200 / 330 / 500) y construye la URL con la
> opción elegida.

### Opción B — App NFC Tools (graba la URL en el tag)

1. Instala **NFC Tools** (wakdev, gratis) → **Escribir** → **Añadir un
   registro** → **URL/URI**.
2. Pega `https://TU_USUARIO.github.io/water-tracker/?add=glass` → **Escribir** y
   acerca la pegatina.
3. Al tocar el tag, el iPhone muestra una notificación; tócala y se abre la app.

Las URL exactas para tu instalación aparecen también en **Ajustes** (para copiarlas).

### Extra — registrar también en Apple Salud

Si usas la **Opción A (Atajos)**, puedes hacer que el mismo toque quede
también en la app Salud, como respaldo independiente:

1. En el mismo Atajo, añade una acción más **después** de "Abrir URL":
   **Registrar muestra de salud** → tipo **Agua** → cantidad (la misma que uses
   en la URL, ej. 250 ml).
2. Guarda. No requiere tocar el código.

---

## 4. Añadir a la pantalla de inicio

Con Firestore ya configurado (paso 2), esto es seguro: **el icono instalado y
Safari comparten exactamente los mismos datos**, así que puedes usar el que
más te apetezca en cada momento, incluso los dos a la vez.

1. Abre la app en **Safari** (no en Chrome ni otro navegador: "Añadir a
   pantalla de inicio" con icono y pantalla completa solo funciona en Safari).
2. Botón **Compartir** (el cuadrado con la flecha hacia arriba) → **Añadir a
   pantalla de inicio** → **Añadir**.
3. Te aparece el icono de la gota de agua. Al abrirlo verás una pantalla de
   carga a pantalla completa (sin barra de Safari) antes de que cargue la app
   — hecha a medida para tu iPhone, en claro y oscuro.

Si más adelante cambias el icono o las pantallas de carga (`tools/make-icons.js`
/ `tools/make-splash.js`), iOS las cachea por nombre de archivo: borra el icono
de la pantalla de inicio y vuelve a añadirlo para ver el cambio.

---

## 5. Usarla

- **Hoy:** la botella se llena según lo que llevas bebido. Debajo, un aviso de
  **ritmo** te dice si vas bien para la hora que es ("vas 300 ml por debajo de
  tu ritmo", "aún es pronto"…), calculado contra tu horario habitual
  (Ajustes). Botones de cantidades rápidas y "Otra cantidad…" para añadir a
  mano. Cada toma se puede borrar. La primera vez que llegas al objetivo cada
  día, hay confeti de celebración (+ vibración).
- **¿Cómo notas la hinchazón hoy?** Un check-in de 5 segundos, un toque sobre
  una carita. Pensado para la retención de líquidos: en **Historial** verás si
  los días que bebes más agua te sientes mejor que los días que bebes menos —
  necesitas unos 5 días con ambos datos para que aparezca la comparación. No
  es un diagnóstico médico, es tu propio dato reflejado para que veas si el
  esfuerzo está funcionando.
- **Historial:** barras por día (semana/mes) o por mes (año). Verde = día en
  que llegaste al objetivo. Media, días cumplidos, racha actual, y la
  comparación de bienestar.
- **Ajustes:** objetivo diario, cantidades rápidas, cantidad del vaso NFC,
  horario habitual (para el ritmo), sugerencia de objetivo según el tiempo, y
  copia de seguridad (exportar/importar `.json` — en iPhone usa la hoja para
  compartir el archivo). Si pasan 14 días sin exportar, aparece un aviso
  discreto en la pantalla Hoy (se puede posponer 7 días).

### Objetivo más alto si va a hacer calor

Si activas "Sugerir subir el objetivo si hace calor" (activado por defecto),
una vez al día la app consulta con tu ubicación aproximada la temperatura
máxima prevista para hoy, usando [Open-Meteo](https://open-meteo.com/)
(gratis, sin clave ni cuenta). Si se esperan 28°C o más, te propone subir el
objetivo de **hoy** un 10-20%. Si aceptas, solo afecta al día de hoy; si dices
que no, no vuelve a preguntar hasta el día siguiente. Sin permiso de
ubicación o sin red, la app sigue funcionando igual, simplemente no hace la
sugerencia.

---

## 6. Personalizar

- Los valores por defecto (objetivo 2000 ml, cantidades 200/330/500, vaso 250 ml)
  están en [`js/store.js`](js/store.js) → `DEFAULT_SETTINGS`. Cambiarlos ahí
  solo afecta a instalaciones nuevas; lo normal es ajustarlos desde **Ajustes**.
- Colores y estilo: [`css/styles.css`](css/styles.css) (variables al principio,
  con modo claro y oscuro).
- Icono: `node tools/make-icons.js`. Pantallas de carga del iPhone:
  `node tools/make-splash.js`. Ninguno de los dos necesita dependencias.

---

## 7. Desarrollo local

```bash
node tools/serve.js 4173
```

Abre `http://localhost:4173`. Para simular un toque NFC:
`http://localhost:4173/?add=500`. Si `js/firebase.js` todavía tiene los
`PEGA_AQUI_*` sin rellenar, la app funciona igual pero en modo local (nada se
guarda al recargar) — perfecto para probar sin tocar datos reales.

---

## Estructura

```
index.html                 estructura y vistas
css/styles.css              estilos (claro/oscuro)
js/firebase.js               conexión a Firestore (config del proyecto)
js/store.js                  datos: Firestore en tiempo real, agregados, export/import
js/charts.js                 gráfico de barras en SVG
js/app.js                    interfaz, navegación, NFC (?add=…), haptics
firestore.rules              reglas de seguridad para pegar en Firebase
manifest.webmanifest         metadatos PWA
sw.js                        service worker (offline, network-first)
icons/                       icono (svg + png) y pantallas de carga (icons/splash)
tools/make-icons.js          generador del icono PNG
tools/make-splash.js         generador de las pantallas de carga del iPhone
tools/serve.js               servidor estático para desarrollo
```

## Aviso sobre los datos

La base de datos no tiene usuarios ni contraseña (ver paso 2): cualquiera con
la URL de tu app podría, en teoría, leer o escribir en ella. Para un registro
personal de agua es un riesgo que se puede asumir — simplemente no compartas
el enlace. Aun así, haz una copia de vez en cuando desde **Ajustes → Exportar
datos**; la app te avisa si llevas mucho tiempo sin hacerlo.
