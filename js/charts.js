/* charts.js — gráfico de barras en SVG, sin dependencias. */

const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 320, H = 180, PAD_B = 4, PAD_T = 10;

  function el(name, attrs) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* data: [{ label, total, goalMet }]  goalMl: number|null */
  function renderBars(svg, labelsEl, data, goalMl) {
    svg.innerHTML = '';
    labelsEl.innerHTML = '';
    if (!data.length) return;

    const maxVal = Math.max(goalMl || 0, ...data.map(d => d.total), 1);
    const plotH = H - PAD_B - PAD_T;
    const n = data.length;
    const slot = W / n;
    const barW = Math.min(slot * 0.6, 26);

    // línea de objetivo
    if (goalMl) {
      const gy = PAD_T + plotH - (goalMl / maxVal) * plotH;
      svg.appendChild(el('line', { class: 'goal-line', x1: 0, y1: gy, x2: W, y2: gy }));
    }

    data.forEach((d, i) => {
      const h = (d.total / maxVal) * plotH;
      const x = i * slot + (slot - barW) / 2;
      const y = PAD_T + plotH - h;
      const rect = el('rect', {
        class: 'bar' + (goalMl && d.goalMet ? ' goal-met' : ''),
        x, y, width: barW, height: Math.max(h, d.total > 0 ? 2 : 0),
        rx: Math.min(barW / 2, 5),
      });
      rect.appendChild(el('title', {}));
      rect.querySelector('title').textContent =
        `${d.fullLabel || d.label}: ${formatMl(d.total)}`;
      svg.appendChild(rect);
    });

    // etiquetas (máx ~8 visibles para no amontonar)
    const step = Math.ceil(n / 8);
    data.forEach((d, i) => {
      const span = document.createElement('span');
      span.textContent = (i % step === 0 || i === n - 1) ? d.label : '';
      span.style.flex = '1';
      span.style.textAlign = 'center';
      labelsEl.appendChild(span);
    });
  }

  function formatMl(ml) {
    return ml >= 1000 ? (ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1) + ' L' : ml + ' ml';
  }

  return { renderBars, formatMl };
})();
