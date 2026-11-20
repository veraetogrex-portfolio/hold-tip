// Hold to Tip — github.com/veraetogrex-portfolio · zero dependencies
// Press and hold the key: the amber fill grows and the tip counts up from $0, never past $5.
// Let go and the amount stays: the filled part becomes the tip, the rest of the key turns into Confirm.
// Nothing is charged on release. × clears, the $1…$5 scale and the arrow keys change the amount at once.

const MAX = 5, RATE = 2.5;            // dollars; dollars per second while held
const MIN = .5, STEP = .25;           // a shorter hold drains back; a release settles to the nearest 25¢
const FARE = 21.5;
const W = 1216, H = 150, GAP = 16, R = 28;   // the key face, px

const root    = document.querySelector('#tip');
const key     = root.querySelector('.ht-key');
const read    = root.querySelector('.ht-read');
const caps    = ['base', 'fill', 'ok'].map(n => root.querySelector(`.ht-cap--${n}`));
const labels  = [...root.querySelectorAll('.ht-lbl-t')];
const fillLbl = root.querySelector('.ht-lbl--fill');
const chip    = root.querySelector('.ht-chip');
const tipTicks = caps[1].querySelector('.ht-ticks');
const chipV   = root.querySelector('.ht-chip-v');
const dent    = root.querySelector('.ht-dent');
const confirm = root.querySelector('.ht-confirm');
const okText  = root.querySelector('.ht-confirm-t');
const clear   = root.querySelector('.ht-clear');
const hint    = root.querySelector('.ht-hint');
const stops   = [...root.querySelectorAll('.ht-scale button')];
const tipLine = root.querySelector('.ht-tipline');
const totalEl = root.querySelector('.ht-total-v');

const money = v => '$' + v.toFixed(2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const inOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const out = t => 1 - Math.pow(1 - t, 3);
const span = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const spring = u => 1 - Math.exp(-3.5 * u) * Math.cos(9 * u);   // overshoots ~30%, settles by u = 1
const svg = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;

// $1…$4 marks on both the resting key and the fill
root.querySelectorAll('.ht-ticks').forEach(t => {
  t.innerHTML = [1, 2, 3, 4].flatMap(v => [`<i style="left:${v / MAX * W - 1.5}px"></i>`, `<i style="left:${v / MAX * W - 1.5}px"></i>`]).join('');
});

let state = 'idle';          // idle · holding · draining · locked · confirmed
let amount = 0, split = 0;   // tip in dollars; 0 = one key, 1 = tip + Confirm
let push = 0, sink = 0;      // px: Confirm moving off the tip, the tip settling after the cut
let anim = 0, heldFrom = 0, target = 0, rolls = new Map();   // target: the tip a running animation is heading to

// clip a cap (face and side) to the horizontal span [l, r] of the key
function clip(cap, l, r) {
  const c = `inset(0 ${W - r}px 0 ${l}px round ${R}px)`;
  for (const el of cap.children) el.style.clipPath = c;
}

// one frame of the key: how far it is filled, how far it has split, how far Confirm has moved off
function draw() {
  const edge = amount / MAX * W, s = split;
  const cut = lerp(edge, clamp(edge, 400, W - 360), s);     // where the key splits; the tip never gets too narrow to read
  const right = W - GAP * s;                                 // Confirm ends GAP short, then push moves it back flush
  clip(caps[1], 0, cut);                                     // the fill, later the tip
  clip(caps[0], cut, right);                                 // the rest of the key …
  clip(caps[2], cut, lerp(cut, right, inOut(span(s, .1, .85))));   // … turning into linen Confirm, from the cut outwards
  caps[2].style.opacity = s ? 1 : 0;
  caps[0].style.transform = caps[2].style.transform = confirm.style.transform = `translateX(${push}px)`;
  caps[1].style.transform = `translateY(${sink}px)`;
  confirm.style.clipPath = `inset(0 ${W - right}px 0 ${cut}px round ${R}px)`;
  confirm.style.opacity = span(s, .45, 1);                  // "Confirm tip" shows once the old label is gone
  okText.style.transform = `translateX(${(cut + right) / 2 - okText.offsetWidth / 2}px)`;
  clear.style.transform = `translate(${Math.max(cut, 400) - 64 - 28}px, ${(H - 64) / 2 + sink}px) scale(${lerp(.7, 1, s)})`;
  clear.style.opacity = span(s, .4, 1);
  chip.style.opacity = span(s, .3, 1);
  tipTicks.style.opacity = 1 - span(s, 0, .4);               // the locked tip is one amount, not a ruler any more
  fillLbl.style.opacity = 1 - span(s, 0, .2);
  labels[0].parentElement.style.opacity = 1 - span(s, 0, .2);
  read.textContent = money(amount);
  chipV.textContent = money(amount);
  read.setAttribute('aria-label', `Tip ${money(amount)}`);
  root.classList.toggle('has-tip', amount > 0);
}

// tip line and total straight from the amount, every frame of a hold or a drain
function follow() { tipLine.textContent = amount ? money(amount) : 'None'; totalEl.textContent = money(FARE + amount); }

function say(text, warn = false) { hint.textContent = text; hint.classList.toggle('is-warn', warn); }
function setLabel(text) { labels.forEach(l => l.textContent = text); }

// ── hold: the fill grows while the key is down, from wherever the tip is now ──
function press(x) {
  if (state !== 'idle' && state !== 'draining') return;
  anim++;
  state = 'holding';
  heldFrom = performance.now() - amount / RATE * 1000;
  dent.style.left = `${clamp(x, 66, W - 66)}px`; dent.style.top = `${H / 2}px`;
  root.classList.add('is-down');
  setLabel(amount >= MAX ? 'Max $5, let go' : 'Release to stop');
  say('Let go at the amount you want');
  rolls.set(totalEl, null);
  const tick = now => {
    if (state !== 'holding') return;
    amount = Math.min(MAX, (now - heldFrom) / 1000 * RATE);
    if (amount >= MAX) setLabel('Max $5, let go');
    draw(); follow();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ── release: too short drains back; otherwise the amount stays and the key splits ──
function release() {
  if (state !== 'holding') return;
  root.classList.remove('is-down');
  if (amount < MIN) return drain('Hold a little longer to add a tip');
  lock(Math.round(amount / STEP) * STEP);
}

function lock(to, ms = 800) {
  state = 'locked'; target = to;
  root.classList.add('is-locked');
  confirm.tabIndex = clear.tabIndex = 0; key.tabIndex = -1;
  const from = amount, s0 = split;
  say('Not charged until you confirm');
  okText.innerHTML = 'Confirm tip';
  summary(to);
  const fresh = s0 < 1, p0 = push;                          // a fresh cut: seam, settle, spring; a re-lock only re-sizes
  return run(ms, p => {
    amount = lerp(from, to, out(span(p, 0, .4)));
    split = fresh ? lerp(s0, 1, inOut(span(p, .2, .9))) : 1;
    push = fresh ? (p < .2 ? 4 * out(p / .2) : 4 + (GAP - 4) * spring(span(p, .2, 1))) : lerp(p0, GAP, out(p));
    if (p === 1) push = GAP;
    sink = fresh ? 6 * Math.sin(Math.PI * span(p, 0, .45)) : 0;   // the tip settles a few px as the cut opens
    draw();
  });
}

// ── clear: one motion back: the key closes up, then the fill drains to $0 ──
async function drain(msg = 'Let go at the amount you want', ms = 1050) {
  const was = state, from = amount, s0 = split;
  state = 'draining';
  root.classList.remove('is-locked', 'is-down');
  confirm.tabIndex = clear.tabIndex = -1; key.tabIndex = 0;
  if (was === 'locked' || was === 'confirmed') key.focus({ preventScroll: true });
  say(msg, was === 'holding');
  setLabel('Hold to add a tip');
  summary(0, 0);   // the tip line and total then walk back with the fill, frame by frame
  const p0 = push;
  const done = await run(s0 ? ms : 420, p => {
    split = lerp(s0, 0, inOut(span(p, 0, .45))); push = lerp(p0, 0, inOut(span(p, 0, .45)));
    amount = lerp(from, 0, inOut(span(p, s0 ? .3 : 0, 1)));
    draw(); follow();
  });
  if (done) state = 'idle';
}

// quick change: a scale stop or an arrow key sets the amount straight away, no hold needed
function set(v) {
  v = clamp(v, MIN, MAX);
  if (state === 'confirmed') state = 'locked';
  return lock(v, state === 'locked' ? 300 : 800);
}

function confirmTip() {
  if (state !== 'locked') return;
  state = 'confirmed';
  okText.innerHTML = svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>') + 'Confirmed';
  draw();
  say(`${money(target)} tip added for Marta`);
}

// the fare card: tip line and total follow the tip
function summary(tip, ms = 520) {
  tipLine.textContent = tip ? money(tip) : 'None';
  roll(totalEl, FARE + tip, ms);
  stops.forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === tip));
}

// one animation at a time; p goes 0 → 1
function run(ms, step) {
  const id = ++anim;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) ms = 1;
  return new Promise(done => {
    const t0 = performance.now();
    const frame = now => {
      if (id !== anim) return done(false);
      const p = Math.min(1, (now - t0) / ms); step(p);
      p < 1 ? requestAnimationFrame(frame) : done(true);
    };
    requestAnimationFrame(frame);
  });
}

function roll(el, to, ms) {
  const id = {}; rolls.set(el, id);
  const from = parseFloat(el.textContent.replace(/[^0-9.]/g, '')) || 0, t0 = performance.now();
  const step = now => {
    if (rolls.get(el) !== id) return;
    const p = Math.min(1, (now - t0) / ms);
    el.textContent = money(lerp(from, to, out(p)));
    if (p < 1) requestAnimationFrame(step);
  };
  ms ? requestAnimationFrame(step) : (el.textContent = money(to));
}

function reset() {
  anim++; rolls = new Map();
  root.classList.add('is-reset');
  root.classList.remove('is-down', 'is-locked');
  state = 'idle'; amount = 0; split = 0; push = 0; sink = 0;
  setLabel('Hold to add a tip'); say('Let go at the amount you want');
  okText.innerHTML = 'Confirm tip';
  confirm.tabIndex = clear.tabIndex = -1; key.tabIndex = 0;
  tipLine.textContent = 'None'; roll(totalEl, FARE, 0);
  stops.forEach(b => b.setAttribute('aria-pressed', false));
  draw();
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('is-reset')));
}

// pointer: hold anywhere on the key; the hold stays with the pointer until it lifts or is cancelled
key.addEventListener('pointerdown', e => {
  if (e.button) return;
  try { key.setPointerCapture(e.pointerId); } catch (_) {}
  const r = key.getBoundingClientRect();
  press((e.clientX - r.left) / (r.width / W));
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => key.addEventListener(t, release));
key.addEventListener('contextmenu', e => e.preventDefault());

// keyboard: Space or Enter held is the same hold; arrows nudge a locked tip by 25¢; Escape clears
key.addEventListener('keydown', e => {
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(W / 2); }
});
key.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } });
root.addEventListener('keydown', e => {
  const d = { ArrowRight: STEP, ArrowUp: STEP, ArrowLeft: -STEP, ArrowDown: -STEP }[e.key];
  if (d && (state === 'locked' || state === 'confirmed')) { e.preventDefault(); set(target + d); }   // from the amount it is heading to, so a held arrow stays on 25¢ steps
  if (e.key === 'Escape' && state !== 'idle') drain();
});
clear.addEventListener('click', () => drain());
confirm.addEventListener('click', confirmTip);
stops.forEach(b => b.addEventListener('click', () => set(+b.dataset.v)));

reset();
root.tip = { reset, key, clear, confirm, stop: v => stops[v - 1], state: () => state, amount: () => amount,
  at: v => v / MAX * W };   // for scripted demos: x of an amount on the key
