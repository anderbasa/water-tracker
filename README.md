# Mi registro de agua 💧

App web para registrar el agua que bebes **tocando una pegatina NFC** pegada a tu
botella. Cada toque suma una cantidad, y la app te muestra el progreso del día y
el historial por semana, mes y año, con un objetivo diario configurable.

- **Sin backend, sin cuentas, gratis.** Es una web estática que se publica en
  GitHub Pages.
- **Los datos se guardan solo en tu móvil** (en el navegador). Incluye
  exportar/importar copia de seguridad.
- Funciona sin conexión una vez instalada en la pantalla de inicio (PWA).

---

## 1. Publicarla en GitHub Pages

1. Crea un repositorio en GitHub, por ejemplo `water-tracker`.
2. Sube todo el contenido de esta carpeta a ese repo (rama `main`).
3. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, rama `main`, carpeta `/ (root)`. Guarda.
4. En un minuto tendrás la app en:
   `https://TU_USUARIO.github.io/water-tracker/`

Cada vez que quieras cambiar algo, edita los archivos (aquí o desde github.com) y
haz `commit`; Pages se actualiza solo. **Importante:** al cambiar archivos, sube
también el número de versión en [`sw.js`](sw.js) (`const CACHE = 'agua-v2'`, etc.)
para que el móvil descargue la versión nueva.

---

## 2. Preparar la pegatina NFC

La app registra el agua cuando se abre con un parámetro en la URL:

| URL a abrir | Qué hace |
| --- | --- |
| `https://TU_USUARIO.github.io/water-tracker/?add=glass` | Suma la "cantidad del vaso NFC" de **Ajustes** (250 ml por defecto). |
| `https://TU_USUARIO.github.io/water-tracker/?add=500` | Suma 500 ml fijos (cambia el número). |

Al registrarse se muestra una confirmación grande (cantidad + total del día +
barra de progreso) y se limpia el parámetro de la URL, así que **recargar nunca
vuelve a contar**. Un segundo toque accidental en menos de 8 s también se ignora.

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
5. Listo. Pega la pegatina en la botella y toca: se abre la app, registra y
   enseña la confirmación.

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

---

## 3. Usarla

> **Importante en iPhone:** al tocar la pegatina NFC, la URL **siempre se abre en
> Safari**, nunca en un icono de "pantalla de inicio". Además, en iOS una web
> añadida a la pantalla de inicio guarda sus datos **por separado** de Safari.
> Para que todo cuente en el mismo sitio, **usa la app dentro de Safari**: ábrela
> una vez, añádela a **Favoritos** o dejala fija en un grupo de pestañas. No hace
> falta instalarla. (Si algún día quieres sincronizar entre varios dispositivos,
> habría que añadir un backend; ver más abajo.)

- **Hoy:** la botella se llena según lo que llevas bebido. Botones de cantidades
  rápidas y "Otra cantidad…" para añadir a mano. Cada toma se puede borrar.
- **Historial:** barras por día (semana/mes) o por mes (año). Verde = día en que
  llegaste al objetivo. Media, días cumplidos y racha actual.
- **Ajustes:** objetivo diario, cantidades rápidas, cantidad del vaso NFC, y
  copia de seguridad (exportar/importar `.json`).

---

## 4. Personalizar

- Los valores por defecto (objetivo 2000 ml, cantidades 200/330/500, vaso 250 ml)
  están en [`js/store.js`](js/store.js) → `DEFAULTS`. Cambiarlos ahí solo afecta a
  instalaciones nuevas; lo normal es ajustarlos desde **Ajustes**.
- Colores y estilo: [`css/styles.css`](css/styles.css) (variables al principio,
  con modo claro y oscuro).
- Los iconos se generan con `node tools/make-icons.js` (sin dependencias).

---

## 5. Desarrollo local

```bash
node tools/serve.js 4173
```

Abre `http://localhost:4173`. Para simular un toque NFC:
`http://localhost:4173/?add=500`.

---

## Estructura

```
index.html                 estructura y vistas
css/styles.css              estilos (claro/oscuro)
js/store.js                 datos: localStorage, agregados por día/mes, export/import
js/charts.js                gráfico de barras en SVG
js/app.js                   interfaz, navegación y lógica NFC (?add=…)
manifest.webmanifest        metadatos PWA
sw.js                       service worker (offline)
icons/                      iconos (svg + png generados)
tools/make-icons.js         generador de iconos PNG
tools/serve.js              servidor estático para desarrollo
```

## Aviso sobre los datos

Los datos viven en Safari de un único dispositivo. Si borras los datos de Safari
o cambias de móvil, se pierden salvo que tengas una copia exportada. Haz backup
de vez en cuando desde **Ajustes → Exportar datos**.

### Si más adelante quieres sincronización entre dispositivos

Habría que añadir un backend ligero (por ejemplo Supabase, plan gratuito) y
guardar las tomas ahí en lugar de en `localStorage`. El punto de cambio está
aislado en [`js/store.js`](js/store.js): bastaría con reimplementar `addEntry`,
`removeEntry` y la carga inicial contra una API, sin tocar el resto de la app.
