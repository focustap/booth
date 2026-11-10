// Original, reproducible material-based sound design. No downloaded samples.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const RATE = 22050, OUT = resolve('assets/audio');
await mkdir(OUT, { recursive: true });
let seed = 1;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const noise = () => random() * 2 - 1;
const sine = (hz, t) => Math.sin(2 * Math.PI * hz * t);
const buffer = seconds => new Float32Array(Math.ceil(seconds * RATE));
function lowpass(input, cutoff) {
  const output = new Float32Array(input.length), k = 1 - Math.exp(-2 * Math.PI * cutoff / RATE);
  let v = 0;
  for (let i = 0; i < input.length; i++) output[i] = v += k * (input[i] - v);
  return output;
}
function band(input, lo, hi) {
  const upper = lowpass(input, hi), lower = lowpass(input, lo);
  return upper.map((v, i) => v - lower[i]);
}
function bed(seconds, lo, hi, motion = .2) {
  const raw = buffer(seconds);
  for (let i = 0; i < raw.length; i++) raw[i] = noise();
  const result = band(raw, lo, hi);
  const phase = random() * 6;
  for (let i = 0; i < result.length; i++) {
    const t = i / RATE;
    result[i] *= 1 + motion * sine(.17, t + phase) + motion * .4 * sine(.43, t);
  }
  return result;
}
function add(target, source, at = 0, gain = 1) {
  const start = Math.round(at * RATE);
  for (let i = 0; i < source.length && start + i < target.length; i++) if (start + i >= 0) target[start + i] += source[i] * gain;
}
function envelope(input, attack = .005, decay = .1, tail = .02) {
  return input.map((v, i) => v * Math.min(1, i / (attack * RATE)) * Math.exp(-i / (decay * RATE)) * Math.min(1, (input.length - 1 - i) / (tail * RATE)));
}
function impact(seconds, body = 100, brightness = 1800, decay = .07) {
  const out = envelope(bed(seconds, 300, brightness, .15), .001, decay, .008);
  for (let i = 0; i < out.length; i++) out[i] += .28 * sine(body, i / RATE) * Math.exp(-i / (RATE * decay)) * Math.min(1, i / 30);
  return out;
}
function metal(seconds = .32, base = 2400) {
  const out = buffer(seconds), ratios = [1, 1.46, 1.91, 2.43];
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    for (let m = 0; m < ratios.length; m++) out[i] += .14 / (m + 1) * sine(base * ratios[m], t) * Math.exp(-t / (.12 / (m + 1)));
    out[i] *= Math.min(1, i / 15) * Math.min(1, (out.length - 1 - i) / 100);
  }
  add(out, impact(.018, 340, 6800, .004), 0, .16);
  return out;
}
function paper(seconds = .45) {
  const out = bed(seconds, 650, 6500, .4);
  let grain = .1;
  for (let i = 0; i < out.length; i++) {
    if (i % 110 === 0) grain = .15 + random() ** 2;
    out[i] *= grain * Math.sin(Math.PI * i / out.length) ** 1.4;
  }
  for (let j = 0; j < 8; j++) add(out, impact(.018, 300, 8500, .004), random() * seconds, .15);
  return out;
}
function motor(seconds, hz, roughness = .12) {
  const out = bed(seconds, 90, 1800, .08);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    out[i] = roughness * out[i] + .07 * sine(hz, t) + .025 * sine(hz * 2.01, t) + .018 * sine(hz * 5.03, t);
  }
  return out;
}
function tone(notes, duration = .085) {
  const out = buffer(notes.length * duration + .12);
  notes.forEach((hz, index) => {
    const note = buffer(duration);
    for (let i = 0; i < note.length; i++) note[i] = .25 * (sine(hz, i / RATE) + .13 * sine(hz * 2, i / RATE)) * Math.sin(Math.PI * i / note.length) ** .4;
    add(out, note, index * duration);
  });
  return out;
}
function seamless(input) {
  // Overlap the tail into the head, preserving continuity at both joins.
  const n = Math.round(.45 * RATE), output = new Float32Array(input.length - n);
  for (let i = 0; i < output.length; i++) {
    const w = Math.min(1, i / n);
    output[i] = i < n ? input[input.length - n + i] * (1 - w) + input[i] * w : input[i];
  }
  return output;
}
function wav(samples, loop = false) {
  if (loop) samples = seamless(samples);
  let peak = 0, energy = 0;
  for (const n of samples) { peak = Math.max(peak, Math.abs(n)); energy += n * n; }
  const scale = Math.min(.78 / (peak || 1), .14 / Math.sqrt(energy / samples.length || 1));
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(RATE, 24); out.writeUInt32LE(RATE * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * scale)) * 32767), 44 + i * 2);
  return out;
}
const design = {
  'rain-pavement': () => bed(10.15, 90, 5400, .1),
  'rain-glass': () => {
    const out = bed(11.75, 600, 6800, .16);
    for (let i = 0; i < 190; i++) add(out, impact(.07, 900 + random() * 1100, 7000, .008), random() * 11.7, .08 + random() * .13);
    return out;
  },
  'canopy-wind': () => bed(13.55, 40, 750, .65),
  'traffic-bed': () => bed(12.85, 35, 550, .42),
  'room-tone': () => bed(9.55, 45, 420, .06),
  'ventilation': () => motor(9.35, 91, .32),
  'computer-fan': () => motor(10.55, 285, .8),
  'fluorescent': () => motor(8.15, 120, .08),
  'mechanical-rumble': () => motor(11.35, 39, .3),
  'footstep': () => {
    const out = buffer(.47);
    add(out, impact(.18, 65 + random() * 30, 900, .045));
    add(out, envelope(bed(.28, 800, 5300), .012, .075), .035, .65);
    add(out, envelope(bed(.18, 1200, 7200), .005, .05), .17, .23);
    return out;
  },
  'splash': () => envelope(bed(.4, 650, 6500, .7), .015, .11),
  'cloth': () => envelope(bed(.36, 450, 4700, .65), .035, .11),
  'knock': () => impact(.32, 185 + random() * 25, 1400, .047),
  'counter-place': () => impact(.27, 135, 2300, .04),
  'mouse': () => impact(.055, 650, 4200, .009),
  'key': () => { const a = buffer(.1); add(a, impact(.05, 380, 4200, .009)); add(a, impact(.04, 550, 6000, .005), .05, .5); return a; },
  'scanner': () => tone([1980], .105),
  'keypad': () => tone([860], .05),
  'warning': () => tone([330, 290], .11),
  'approved': () => tone([920, 1380], .10),
  'notification': () => tone([680, 950], .06),
  'card-tap': () => { const a = buffer(.28); add(a, impact(.12, 310, 2700, .02)); add(a, tone([1350], .07), .10, .55); return a; },
  'processing': () => tone([590, 0, 740], .07),
  'drawer-open': () => {
    const a = buffer(.7); add(a, impact(.12, 135, 2800, .04));
    add(a, envelope(bed(.5, 100, 3900), .04, .28), .06, .65);
    add(a, impact(.19, 93, 2400, .055), .46); add(a, metal(.2, 1400), .49, .18); return a;
  },
  'drawer-close': () => { const a = buffer(.4); add(a, envelope(bed(.22, 100, 2600), .01, .13), 0, .6); add(a, impact(.22, 78, 2300, .05), .16); return a; },
  'paper': () => paper(.5),
  'coin': () => { const a = buffer(.46); add(a, metal(.3, 1900 + random() * 450)); add(a, metal(.18, 2450), .115, .28); return a; },
  'receipt': () => {
    const a = buffer(1.15), m = motor(.92, 185, .9);
    for (let i = 0; i < m.length; i++) m[i] *= .55 + .45 * Math.sign(sine(29, i / RATE));
    add(a, envelope(m, .02, 2, .03)); add(a, paper(.24), .88, .7); return a;
  },
  'relay': () => { const a = buffer(.25); add(a, impact(.08, 460, 6500, .01)); add(a, impact(.1, 300, 4000, .02), .08, .7); return a; },
  'pump-start': () => {
    const a = motor(1.5, 88, .4);
    for (let i = 0; i < a.length; i++) a[i] *= Math.min(1, i / (RATE * .45)) * Math.min(1, (a.length - i) / (RATE * .5));
    return a;
  },
  'pendulum': () => metal(.19, 2800),
  'rattle': () => { const a = buffer(.65); for (let i = 0; i < 5; i++) add(a, metal(.15, 1000 + i * 135), i * .055 + random() * .02, .6 - i * .08); return a; },
  'buzz': () => {
    const a = motor(.75, 117, 1.1);
    for (let i = 0; i < a.length; i++) a[i] *= Math.sin(Math.PI * i / a.length) * (sine(23, i / RATE) > -.2 ? 1 : .05);
    return a;
  },
  'intercom': () => envelope(bed(.18, 500, 2900), .004, .035),
  'startup': () => { const a = buffer(1.2); add(a, impact(.1, 450, 2800, .02)); add(a, envelope(motor(.8, 240, .5), .2, 1, .1), .06, .45); add(a, tone([660, 880], .09), .85, .3); return a; },
  'shutdown': () => envelope(motor(.65, 195, .6), .01, .18),
  'car-door': () => { const a = buffer(.7); add(a, impact(.36, 65, 2100, .08)); add(a, metal(.14, 1050), .18, .1); return a; },
  'engine': () => {
    const a = buffer(4.1), air = bed(4.1, 45, 1800, .3); let phase = 0;
    for (let i = 0; i < a.length; i++) { const t = i / RATE; phase += 2 * Math.PI * (t < .75 ? 28 + 12 * sine(7, t) : 43 + 10 * t) / RATE; a[i] = (.12 * Math.sin(phase) + .045 * Math.sin(phase * 3) + air[i] * .3) * Math.min(1, t / .1) * Math.min(1, (4.1 - t) / 1.3); }
    return a;
  },
  'passing-car': () => {
    const a = bed(5.6, 40, 3300, .1);
    for (let i = 0; i < a.length; i++) { const t = i / RATE; a[i] = (a[i] + .03 * sine(90 - t * 6, t)) * Math.sin(Math.PI * t / 5.6) ** 2; }
    return a;
  },
  'thunder': () => {
    const a = bed(5.9, 22, 450, .7);
    for (let i = 0; i < a.length; i++) { const t = i / RATE; a[i] *= (1 - Math.exp(-t / .3)) * Math.exp(-t / 2.2) * Math.min(1, (5.9 - t) / .4); }
    return a;
  }
};
const loops = new Set(['rain-pavement','rain-glass','canopy-wind','traffic-bed','room-tone','ventilation','computer-fan','fluorescent','mechanical-rumble']);
const variants = new Set(['footstep','splash','cloth','knock','mouse','key','paper','coin','pendulum','counter-place']);
const catalogue = {}, packed = {};
let total = 0;
for (const [name, build] of Object.entries(design)) {
  catalogue[name] = [];
  for (let v = 0; v < (variants.has(name) ? 3 : 1); v++) {
    seed = [...name].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 12345 + v * 761);
    const bytes = wav(build(), loops.has(name)), filename = `${name}-${v + 1}.wav`;
    await writeFile(resolve(OUT, filename), bytes);
    catalogue[name].push({ file: filename, duration: (bytes.length - 44) / (RATE * 2), loop: loops.has(name) });
    packed[filename] = bytes.toString('base64'); total += bytes.length;
  }
}
await writeFile(resolve(OUT, 'catalog.js'), 'window.NIGHT_AUDIO_CATALOG='+JSON.stringify(catalogue)+';\n');
// Loaded only for direct file:// play or if a hosted asset cannot be fetched.
await writeFile(resolve(OUT, 'offline.js'), 'window.NIGHT_AUDIO_PACK='+JSON.stringify(packed)+';\n');
await writeFile(resolve(OUT, 'LICENSE.txt'), 'NIGHT WINDOW original procedural audio\n\nAll WAV files in this directory were synthesized by scripts/build-audio.mjs.\nNo field recordings, downloaded samples, voice models, or third-party audio were used.\nThe audio assets are dedicated to the public domain under CC0 1.0.\nThe generator, catalogue, and offline bundle are part of the game source.\n');
console.log(`Built ${Object.keys(packed).length} original WAV assets (${(total / 1024 / 1024).toFixed(2)} MiB) and the file:// fallback bundle.`);
