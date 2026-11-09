/* spring.js — animador de muelle minimalista, sin dependencias.
   Sigue la guía de Apple (Designing Fluid Interfaces): se piensa en
   "amortiguación" (rebote) + "respuesta" (rapidez), nunca en duraciones
   fijas, y siempre se anima desde el valor que hay AHORA en pantalla —
   nunca desde el valor lógico — para poder interrumpir en cualquier
   momento sin saltos. Se usa para el nivel de agua, la hoja de "otra
   cantidad" y el deslizar para borrar. */

export function prefersReducedMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

/* anima un número desde `from` hasta `to`, con la velocidad inicial que
   traiga el gesto (si la hay). onUpdate(valor) se llama en cada frame.
   Devuelve una función para cancelar — llamarla antes de re-arrancar la
   animación con un nuevo objetivo, así siempre se parte del valor real
   que se ve en pantalla. */
export function animateSpring({ from, to, velocity = 0, damping = 1, response = 0.35, onUpdate, onDone }) {
  if (prefersReducedMotion()) {
    onUpdate(to);
    if (onDone) onDone();
    return () => {};
  }
  const w0 = (2 * Math.PI) / response;
  const stiffness = w0 * w0;
  const dampingCoef = 2 * damping * w0;
  let pos = from, vel = velocity;
  let raf = null, lastT = null, stopped = false;

  function frame(t) {
    if (stopped) return;
    if (lastT == null) lastT = t;
    let dt = (t - lastT) / 1000;
    lastT = t;
    dt = Math.min(dt, 1 / 30); // evita saltos si la pestaña estuvo en pausa

    const accel = -stiffness * (pos - to) - dampingCoef * vel;
    vel += accel * dt;
    pos += vel * dt;

    const settled = Math.abs(pos - to) < 0.4 && Math.abs(vel) < 20;
    if (settled) {
      onUpdate(to);
      if (onDone) onDone();
      return;
    }
    onUpdate(pos);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => { stopped = true; if (raf) cancelAnimationFrame(raf); };
}

/* proyecta dónde "iría a parar" un gesto lanzado con velocidad v (px/s),
   como la deceleración de scroll de iOS — para animar HACIA donde va el
   gesto, no solo desde donde se soltó. */
export function project(v, decelerationRate = 0.998) {
  return (v / 1000) * decelerationRate / (1 - decelerationRate);
}

/* resistencia progresiva al pasarse de un límite (en vez de parar en seco) */
export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
