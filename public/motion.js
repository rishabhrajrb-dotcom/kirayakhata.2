// Scroll motion: IntersectionObserver + CSS transitions + Web Animations. No scroll hijacking,
// no snapping, transforms/opacity only. Everything degrades to static content.
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const desktop = () => window.matchMedia('(min-width: 961px)').matches;

export function initReveals(root = document) {
  const els = root.querySelectorAll('.reveal, .reveal-scale, .wordmark-xl, .sheet-stack');
  if (reducedMotion() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}

/** Hero demonstration: equation rows appear in order once, then the match chip. */
export function heroSequence() {
  const card = document.getElementById('hero-card');
  if (!card || reducedMotion() || !card.animate) return;
  const parts = [...card.querySelectorAll('[data-step]')];
  parts.forEach((p, i) => p.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 650 + i * 230, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
}

/** Small, differently paced parallax for hero layers as the hero leaves the viewport. */
export function initParallax() {
  const layers = [...document.querySelectorAll('[data-parallax]')];
  if (!layers.length || reducedMotion()) return;
  let ticking = false;
  const update = () => {
    ticking = false;
    if (!desktop()) { layers.forEach((l) => { l.style.transform = ''; }); return; }
    const y = Math.min(window.scrollY, window.innerHeight);
    for (const l of layers) {
      const k = Number(l.dataset.parallax);
      const scale = l.classList.contains('hero-art') ? 1 - Math.min(y / window.innerHeight, 1) * 0.03 : 1;
      l.style.transform = `translate3d(0, ${(y * k).toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
    }
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', update);
  update();
}

/** 01 routine: the step crossing the viewport centre updates the sticky preview. */
export function initRoutine() {
  const steps = [...document.querySelectorAll('.step')];
  const panes = [...document.querySelectorAll('.stage-pane')];
  const bars = [...document.querySelectorAll('.stage-progress span')];
  if (!steps.length) return;
  const show = (i) => {
    steps.forEach((s, j) => s.classList.toggle('is-current', j === i));
    panes.forEach((p, j) => p.classList.toggle('is-active', j === i));
    bars.forEach((b, j) => b.classList.toggle('on', j <= i));
  };
  show(0);
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) show(Number(e.target.dataset.step));
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
  steps.forEach((s) => io.observe(s));
}

/** 02 feature rows: tablist with sliding highlight; click, keyboard, touch and (desktop) scroll. */
export function initFeatureRows(onSelect) {
  const list = document.getElementById('feature-rows');
  if (!list) return;
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const hl = list.querySelector('.row-highlight');
  let current = 0; let userPicked = 0;
  const place = () => {
    const tab = tabs[current];
    hl.style.opacity = '1';
    hl.style.transform = `translateY(${tab.offsetTop}px)`;
    hl.style.height = `${tab.offsetHeight}px`;
  };
  const select = (i, { focus = false, fromScroll = false } = {}) => {
    if (i === current && !focus && hl.style.opacity === '1') return;
    current = i;
    tabs.forEach((t, j) => { t.setAttribute('aria-selected', String(j === i)); t.tabIndex = j === i ? 0 : -1; });
    document.querySelectorAll('.preview-stage [role="tabpanel"]').forEach((p, j) => {
      const was = !p.hidden; p.hidden = j !== i;
      if (j === i && !was) { p.classList.remove('entering'); void p.offsetWidth; p.classList.add('entering'); }
    });
    document.querySelectorAll('.inline-preview').forEach((p) => { p.hidden = Number(p.dataset.inline) !== i; });
    if (focus) tabs[i].focus();
    place();
    if (!fromScroll) userPicked = Date.now();
    onSelect && onSelect(i);
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i));
    t.addEventListener('keydown', (e) => {
      const k = e.key;
      if (['ArrowDown', 'ArrowRight'].includes(k)) { e.preventDefault(); select((current + 1) % tabs.length, { focus: true }); }
      if (['ArrowUp', 'ArrowLeft'].includes(k)) { e.preventDefault(); select((current - 1 + tabs.length) % tabs.length, { focus: true }); }
      if (k === 'Home') { e.preventDefault(); select(0, { focus: true }); }
      if (k === 'End') { e.preventDefault(); select(tabs.length - 1, { focus: true }); }
    });
  });
  window.addEventListener('resize', place);
  document.addEventListener('kk:lang', () => requestAnimationFrame(place));
  // Fonts and the italic accent change row heights after first paint: re-measure.
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(() => place()); tabs.forEach((t) => ro.observe(t)); }
  document.fonts?.ready.then(place);
  select(0, { fromScroll: true });
  // Desktop: scrolling past a row selects it, unless the user just chose one.
  if ('IntersectionObserver' in window && !reducedMotion()) {
    const io = new IntersectionObserver((entries) => {
      if (!desktop() || Date.now() - userPicked < 2500) return;
      for (const e of entries) if (e.isIntersecting) select(tabs.indexOf(e.target), { fromScroll: true });
    }, { rootMargin: '-48% 0px -48% 0px' });
    tabs.forEach((t) => io.observe(t));
  }
}

/** Reveal rows of a table in order (reconciliation). */
export function revealRows(container) {
  const rows = [...container.querySelectorAll('.reveal-row')];
  if (reducedMotion()) { rows.forEach((r) => r.classList.add('shown')); return; }
  rows.forEach((r, i) => setTimeout(() => r.classList.add('shown'), 90 + i * 140));
}

/** FAQ: measured-height open/close. */
export function initFAQ() {
  document.querySelectorAll('.faq-item').forEach((d) => {
    const summary = d.querySelector('summary');
    const body = d.querySelector('.faq-body');
    summary.addEventListener('click', (e) => {
      if (reducedMotion() || !body.animate) return;
      e.preventDefault();
      if (d.open) {
        const h = body.offsetHeight;
        body.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 260, easing: 'ease-in' }).onfinish = () => { d.open = false; };
      } else {
        d.open = true;
        const h = body.offsetHeight;
        body.animate([{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }], { duration: 340, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
    });
  });
}
