// Fully synthesized sound: no audio files. The context starts on the first user gesture (autoplay policy).
let ctx = null, master, noiseBuffer;
let engine, jet, wind, rain, hornNodes;
let muted = false;
const listeners = [];

export const audioState = { started: false, get muted() { return muted; } };
export const onMuteChange = (fn) => listeners.push(fn);

function noise(seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = white * 0.6 + last * 3;
  }
  return b;
}

function loopNoise() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  src.start(0, Math.random() * 1.5);
  return src;
}

function gainNode(v = 0) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function filter(type, frequency, Q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  return f;
}

function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

function osc(type, frequency) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = frequency;
  o.start();
  return o;
}

export function startAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  noiseBuffer = noise();
  const comp = ctx.createDynamicsCompressor();
  master = gainNode(muted ? 0 : 0.8);
  chain(master, comp, ctx.destination);

  // Combustion engine: sawtooth + sub square through a throttle-controlled low-pass.
  const iceOut = gainNode(0);
  const iceLp = filter('lowpass', 400, 2);
  const saw = osc('sawtooth', 40), sub = osc('square', 20);
  const subGain = gainNode(0.5);
  saw.connect(iceLp);
  chain(sub, subGain, iceLp);
  chain(iceLp, iceOut, master);
  const lfo = osc('sine', 9), lfoGain = gainNode(4);
  chain(lfo, lfoGain, saw.frequency);

  // Electric motor: sine whine with a triangle overtone.
  const evOut = gainNode(0);
  const whine = osc('sine', 150), over = osc('triangle', 300);
  const overGain = gainNode(0.25);
  whine.connect(evOut);
  chain(over, overGain, evOut);
  evOut.connect(master);
  engine = { saw, sub, iceLp, iceOut, whine, over, evOut };

  jet = { bp: filter('bandpass', 900, 0.8), out: gainNode(0) };
  chain(loopNoise(), jet.bp, jet.out, master);
  wind = { lp: filter('lowpass', 500), out: gainNode(0) };
  chain(loopNoise(), wind.lp, wind.out, master);
  rain = { out: gainNode(0) };
  chain(loopNoise(), filter('highpass', 900), filter('lowpass', 7000), rain.out, master);

  const hornOut = gainNode(0);
  const h1 = osc('square', 415), h2 = osc('square', 523);
  const hornLp = filter('lowpass', 1800);
  h1.connect(hornLp);
  h2.connect(hornLp);
  chain(hornLp, hornOut, master);
  hornNodes = { out: hornOut };
  audioState.started = true;
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
  listeners.forEach((fn) => fn(m));
}
export const toggleMute = () => setMuted(!muted);

// Called every frame. speed in m/s; throttle 0..1; boost/fly booleans; rainAmount 0..1.
export function updateAudio({ speed, maxSpeed, throttle, electric, flying, boost, rainAmount, horn }) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime, k = 0.08;
  const s = Math.min(1, Math.abs(speed) / maxSpeed);
  if (electric) {
    engine.evOut.gain.setTargetAtTime(0.012 + s * 0.035 + throttle * 0.015, t, k);
    engine.whine.frequency.setTargetAtTime(110 + s * 820, t, k);
    engine.over.frequency.setTargetAtTime(220 + s * 1640, t, k);
    engine.iceOut.gain.setTargetAtTime(0, t, k);
  } else {
    const gear = (s * 4) % 1;
    const rpm = 0.25 + 0.75 * (s < 0.97 ? 0.35 + gear * 0.65 : 1) * Math.min(1, s * 4 + 0.2);
    engine.iceOut.gain.setTargetAtTime(0.05 + throttle * 0.07, t, k);
    engine.saw.frequency.setTargetAtTime(32 + rpm * 115, t, k);
    engine.sub.frequency.setTargetAtTime(16 + rpm * 57, t, k);
    engine.iceLp.frequency.setTargetAtTime(220 + throttle * 900 + rpm * 400, t, k);
    engine.evOut.gain.setTargetAtTime(0, t, k);
  }
  const jetLevel = (flying ? 0.05 + s * 0.05 : 0) + (boost ? 0.08 : 0);
  jet.out.gain.setTargetAtTime(jetLevel, t, 0.15);
  jet.bp.frequency.setTargetAtTime(600 + s * 1400 + (boost ? 600 : 0), t, 0.15);
  wind.out.gain.setTargetAtTime(s * s * (flying ? 0.16 : 0.07), t, 0.2);
  wind.lp.frequency.setTargetAtTime(300 + s * 900, t, 0.2);
  rain.out.gain.setTargetAtTime(rainAmount * 0.11, t, 0.4);
  hornNodes.out.gain.setTargetAtTime(horn ? 0.07 : 0, t, 0.015);
}

function oneShotNoise({ type = 'lowpass', freq = 400, endFreq = freq, q = 0.7, gain = 0.3, attack = 0.01, decay = 1, delay = 0, pan = 0 }) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = filter(type, freq, q);
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + decay);
  const g = gainNode(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (p) p.pan.value = pan;
  chain(src, f, g, ...(p ? [p] : []), master);
  src.start(t, Math.random());
  src.stop(t + attack + decay + 0.1);
}

export function thunder(distance) {
  const delay = Math.min(2.5, distance / 343);
  const near = 1 - Math.min(1, distance / 600);
  oneShotNoise({ type: 'highpass', freq: 1200, endFreq: 300, gain: 0.25 * near, attack: 0.005, decay: 0.35, delay });
  oneShotNoise({ type: 'lowpass', freq: 380, endFreq: 60, q: 1.2, gain: 0.55 * (0.4 + near), attack: 0.06, decay: 3.6 + Math.random() * 1.5, delay: delay + 0.05 });
  oneShotNoise({ type: 'lowpass', freq: 160, endFreq: 40, gain: 0.35, attack: 0.4, decay: 3, delay: delay + 0.6 });
}

export function splash(strength = 1) {
  oneShotNoise({ type: 'bandpass', freq: 1400, endFreq: 500, q: 0.9, gain: 0.18 * strength, attack: 0.01, decay: 0.45 });
}

export function thump(strength = 1) {
  oneShotNoise({ type: 'lowpass', freq: 260, endFreq: 50, q: 1.5, gain: 0.5 * Math.min(1, strength), attack: 0.004, decay: 0.35 });
  oneShotNoise({ type: 'bandpass', freq: 2500, endFreq: 900, q: 1.2, gain: 0.12 * Math.min(1, strength), attack: 0.002, decay: 0.18 });
}

export function chime(ok = true) {
  if (!ctx || ctx.state !== 'running') return;
  const notes = ok ? [659, 880, 1175] : [392, 330];
  notes.forEach((f, i) => {
    const t = ctx.currentTime + i * 0.09;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = gainNode(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    chain(o, g, master);
    o.start(t);
    o.stop(t + 0.4);
  });
}

// Short distant beep from an AI vehicle; pan -1..1, volume 0..1.
export function distantHorn(pan, volume) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const base = 330 + Math.random() * 200;
  const g = gainNode(0);
  const lp = filter('lowpass', 1400);
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (p) p.pan.value = pan;
  chain(lp, g, ...(p ? [p] : []), master);
  const beeps = Math.random() < 0.5 ? 1 : 2;
  for (const f of [base, base * 1.26]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    o.connect(lp);
    o.start(t);
    o.stop(t + beeps * 0.32);
  }
  for (let b = 0; b < beeps; b++) {
    g.gain.setValueAtTime(0, t + b * 0.32);
    g.gain.linearRampToValueAtTime(0.05 * volume, t + b * 0.32 + 0.01);
    g.gain.setValueAtTime(0.05 * volume, t + b * 0.32 + 0.2);
    g.gain.linearRampToValueAtTime(0, t + b * 0.32 + 0.24);
  }
}
