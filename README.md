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

El iPhone (XS o posterior) lee tags NFC en segundo plano sin abrir ninguna app:
al acercar el móvil aparece una notificación que abre la URL grabada en el tag.

**Para grabar la URL en la pegatina necesitas una app** (el iPhone lee tags, pero
no los graba de fábrica). Gratis y estándar:

- **NFC Tools** (wakdev) — App Store.

Pasos con NFC Tools:

1. Abre NFC Tools → **Escribir** → **Añadir un registro** → **URL / URI**.
2. Escribe la URL de tu app con el parámetro de cantidad:
   - `https://TU_USUARIO.github.io/water-tracker/?add=glass`
     → suma la "cantidad del vaso NFC" que tengas en Ajustes (250 ml por defecto).
   - `https://TU_USUARIO.github.io/water-tracker/?add=500`
     → suma siempre 500 ml (cambia el número por el tamaño de tu botella/vaso).
3. **Escribir** y acerca la pegatina. Listo.
4. Pega la pegatina en la botella y prueba: acércale el iPhone → toca la
   notificación → se registra el agua y ves el resumen.

Las URL exactas para tu instalación también aparecen en la pantalla **Ajustes**
de la app (puedes copiarlas desde ahí).

> Si un día tocas el tag dos veces sin querer, la app ignora el segundo toque si
> ocurre en los 8 segundos siguientes. Y recargar la página nunca vuelve a
> contar, porque el parámetro se borra de la URL al registrarse.

---

## 3. Usarla

- Abre la app en Safari y pulsa **Compartir → Añadir a pantalla de inicio**. Así
  se abre a pantalla completa y funciona sin conexión.
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

## Aviso

Los datos viven en el navegador de un único dispositivo. Si borras los datos de
Safari, cambias de móvil o desinstalas, se pierden salvo que tengas una copia
exportada. Haz backup de vez en cuando desde **Ajustes → Exportar datos**.
