/* NIGHT WINDOW's sample mixer. Physical sounds use original generated WAVs. */
(() => {
  'use strict';
  const DEFAULTS = { master: .8, ambience: .58, effects: .76, muted: false };
  const LAYERS = {
    'rain-pavement': { level: .42, outside: true, pan: -.1 },
    'rain-glass': { level: .17, outside: true, pan: .12, cutoff: 3100 },
    'canopy-wind': { level: .16, outside: true, pan: -.35 },
    'traffic-bed': { level: .12, outside: true, pan: .25 },
    'room-tone': { level: .14, pan: 0 },
    ventilation: { level: .10, pan: -.65 },
    'computer-fan': { level: .055, pan: .6 },
    fluorescent: { level: .075, pan: .1 },
    'mechanical-rumble': { level: 0, pan: -.25 }
  };
  const clamp = n => Math.max(0, Math.min(1, n));
  const random = (a, b) => a + Math.random() * (b - a);
  const storageKey = 'night-window.audio.v1';

  class NightAudio {
    constructor() {
      this.settings = { ...DEFAULTS };
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
        for (const key of ['master', 'ambience', 'effects']) if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) this.settings[key] = clamp(saved[key]);
        if (typeof saved.muted === 'boolean') this.settings.muted = saved.muted;
      } catch { /* Private browsing and denied storage are supported. */ }
      this.ctx = null;
      this.available = !!(window.AudioContext || window.webkitAudioContext);
      this.unlocked = false;
      this.disposed = false;
      this.scene = 'intro';
      this.shift = 0;
      this.generation = 0;
      this.buffers = new Map();
      this.loading = new Map();
      this.loopLoading = new Set();
      this.loops = new Map();
      this.voices = new Set();
      this.timers = new Map();
      this.groupVersions = new Map();
      this.lastPlayed = new Map();
      this.events = [];
      this.failures = new Set();
      this.change = () => {};
      this.hidden = document.hidden;
      this.visibilityHandler = () => this.setHidden(document.hidden);
      document.addEventListener('visibilitychange', this.visibilityHandler);
      this.pageHideHandler = e => e.persisted ? this.setHidden(true) : this.dispose();
      this.pageShowHandler = () => this.setHidden(false);
      window.addEventListener('pagehide', this.pageHideHandler);
      window.addEventListener('pageshow', this.pageShowHandler);
      this.gestureHandler = () => {
        if (this.unlocked && !this.hidden && this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
      };
      document.addEventListener('pointerdown', this.gestureHandler, { passive: true });
      document.addEventListener('keydown', this.gestureHandler);
    }

    async unlock() {
      if (this.disposed || !this.available) return false;
      try {
        if (!this.ctx) {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
          this.buildGraph();
          this.ctx.onstatechange = () => {
            if (this.disposed) return;
            if (this.ctx.state === 'running' && this.unlocked) {
              this.ensureLoops(); this.scheduleWorld();
            }
            this.change();
          };
        }
        // resume() is invoked in the originating click handler, before any I/O.
        const resumed = this.ctx.resume();
        this.unlocked = true;
        await resumed;
        if (this.disposed) return false;
        this.applySettings();
        this.ensureLoops();
        this.scheduleWorld();
        this.change();
        return true;
      } catch {
        this.available = !!this.ctx;
        this.change();
        return false;
      }
    }

    buildGraph() {
      const c = this.ctx;
      this.master = c.createGain();
      this.ambience = c.createGain();
      this.effects = c.createGain();
      this.sceneGain = c.createGain();
      this.duck = c.createGain();
      this.limiter = c.createDynamicsCompressor();
      this.limiter.threshold.value = -9;
      this.limiter.knee.value = 9;
      this.limiter.ratio.value = 6;
      this.limiter.attack.value = .005;
      this.limiter.release.value = .25;
      this.analyser = c.createAnalyser();
      this.analyser.fftSize = 2048;
      this.ambience.connect(this.sceneGain).connect(this.duck).connect(this.master);
      this.effects.connect(this.master);
      this.master.connect(this.limiter).connect(this.analyser).connect(c.destination);
      this.reverb = c.createConvolver();
      const impulse = c.createBuffer(2, Math.ceil(c.sampleRate * .24), c.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * .045)) * .14;
      }
      this.reverb.buffer = impulse;
      this.reverbGain = c.createGain();
      this.reverbGain.gain.value = .055;
      this.reverb.connect(this.reverbGain).connect(this.effects);
      this.master.gain.value = 0;
      this.applySettings();
    }

    ramp(param, target, seconds = .12) {
      if (!this.ctx || !param) return;
      const now = this.ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(target, now, Math.max(.005, seconds / 3));
    }

    setSetting(key, value) {
      if (!(key in DEFAULTS)) return;
      this.settings[key] = key === 'muted' ? !!value : clamp(Number(value) || 0);
      try { localStorage.setItem(storageKey, JSON.stringify(this.settings)); } catch {}
      this.applySettings();
      if (this.settings.muted) {
        for (const voice of [...this.voices]) if (!voice.loop) this.stopVoice(voice);
      }
      this.change();
    }

    applySettings() {
      if (!this.ctx) return;
      this.ramp(this.master.gain, this.settings.muted ? 0 : this.settings.master);
      this.ramp(this.ambience.gain, this.settings.ambience);
      this.ramp(this.effects.gain, this.settings.effects);
      this.ramp(this.sceneGain.gain, this.scene === 'working' || this.scene === 'result' ? 1 : this.scene === 'brief' ? .42 : 0, .8);
    }

    async loadOfflinePack() {
      if (window.NIGHT_AUDIO_PACK) return window.NIGHT_AUDIO_PACK;
      if (!this.packPromise) this.packPromise = new Promise(resolve => {
        const script = document.createElement('script');
        script.src = 'assets/audio/offline.js';
        script.onload = () => resolve(window.NIGHT_AUDIO_PACK || {});
        script.onerror = () => resolve({});
        document.head.append(script);
      });
      return this.packPromise;
    }

    async load(file) {
      if (this.buffers.has(file)) return this.buffers.get(file);
      if (this.loading.has(file)) return this.loading.get(file);
      const promise = (async () => {
        try {
          let bytes;
          if (location.protocol !== 'file:') {
            try {
              const response = await fetch('assets/audio/' + file);
              if (!response.ok) throw new Error('Missing asset');
              bytes = await response.arrayBuffer();
            } catch { /* Use the offline pack when hosting is incomplete. */ }
          }
          if (!bytes) {
            const pack = await this.loadOfflinePack();
            if (!pack[file]) throw new Error('No bundled asset');
            bytes = Uint8Array.from(atob(pack[file]), c => c.charCodeAt(0)).buffer;
          }
          if (this.disposed) return null;
          const buffer = await this.ctx.decodeAudioData(bytes);
          if (this.disposed) return null;
          this.buffers.set(file, buffer);
          return buffer;
        } catch {
          if (this.disposed) return null;
          this.failures.add(file);
          const buffer = this.fallback(file);
          this.buffers.set(file, buffer);
          return buffer;
        } finally {
          this.loading.delete(file);
        }
      })();
      this.loading.set(file, promise);
      return promise;
    }

    fallback(file) {
      // A missing sample never becomes a gameplay dependency. Keep a quiet,
      // noise-based substitute, with material-specific decay and bandwidth.
      const ambient = Object.keys(LAYERS).some(name => file.startsWith(name));
      const tonal = /scanner|keypad|approved|warning|notification/.test(file);
      const length = ambient ? 2.8 : /receipt|engine|thunder/.test(file) ? .8 : .18;
      const out = this.ctx.createBuffer(1, Math.ceil(length * this.ctx.sampleRate), this.ctx.sampleRate);
      const data = out.getChannelData(0);
      let low = 0;
      for (let i = 0; i < data.length; i++) {
        low += .15 * (Math.random() * 2 - 1 - low);
        const envelope = ambient ? 1 : Math.min(1, i / 50) * Math.exp(-i / (data.length * .16));
        data[i] = (tonal ? Math.sin(i / this.ctx.sampleRate * 2 * Math.PI * 1100) * .12 : low * .22) * envelope;
      }
      return out;
    }

    catalogue(name) {
      return window.NIGHT_AUDIO_CATALOG?.[name] || [{ file: name + '-1.wav', duration: .3 }];
    }

    async play(name, options = {}) {
      if (!this.canPlay() || this.settings.muted) return null;
      const group = options.group || 'action', generation = this.generation, version = this.groupVersions.get(group) || 0;
      const entries = this.catalogue(name), entry = entries[Math.floor(Math.random() * entries.length)];
      const stamp = this.ctx.currentTime, last = this.lastPlayed.get(name) ?? -100;
      if (stamp - last < (options.cooldown ?? .055)) return null;
      this.lastPlayed.set(name, stamp);
      const buffer = await this.load(entry.file);
      if (!buffer || !this.canPlay() || this.settings.muted || (group !== 'world' && generation !== this.generation) || version !== (this.groupVersions.get(group) || 0)) return null;
      if ([...this.voices].filter(v => !v.loop && v.name === name).length >= 3 || this.voices.size >= 40) return null;
      return this.voice(name, buffer, { ...options, group, rate: options.rate ?? random(.95, 1.05) });
    }

    voice(name, buffer, options = {}) {
      const c = this.ctx, source = c.createBufferSource(), gain = c.createGain();
      const pan = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
      const filter = c.createBiquadFilter();
      source.buffer = buffer;
      source.loop = !!options.loop;
      source.playbackRate.value = options.rate ?? 1;
      filter.type = 'lowpass';
      filter.frequency.value = options.cutoff || (options.outside ? 1450 : 10000);
      filter.Q.value = .45;
      if (pan.pan) pan.pan.value = Math.max(-1, Math.min(1, options.pan || 0));
      gain.gain.value = options.loop ? 0 : options.gain ?? .5;
      source.connect(filter).connect(pan).connect(gain).connect(options.loop ? this.ambience : this.effects);
      if (!options.loop && !options.outside) gain.connect(this.reverb);
      const voice = { name, source, gain, filter, pan, group: options.group || 'action', loop: !!options.loop, stopped: false };
      source.onended = () => this.releaseVoice(voice);
      this.voices.add(voice);
      const when = c.currentTime;
      if (options.panTo !== undefined && pan.pan) pan.pan.linearRampToValueAtTime(options.panTo, when + buffer.duration / source.playbackRate.value);
      source.start(when, options.loop ? Math.random() * buffer.duration : 0);
      if (!options.loop) {
        const end = when + buffer.duration / source.playbackRate.value;
        gain.gain.setValueAtTime(gain.gain.value, Math.max(when, end - .018));
        gain.gain.linearRampToValueAtTime(0, end);
      }
      this.events.push({ name, group: voice.group, pan: options.pan || 0, outside: !!options.outside, time: when, generation: this.generation });
      if (this.events.length > 200) this.events.shift();
      return voice;
    }

    releaseVoice(voice) {
      voice.source.onended = null;
      for (const node of [voice.source, voice.filter, voice.pan, voice.gain]) { try { node.disconnect(); } catch {} }
      this.voices.delete(voice);
    }

    stopVoice(voice, fade = .045) {
      if (voice.stopped) return;
      voice.stopped = true;
      this.ramp(voice.gain.gain, 0, fade);
      try { voice.source.stop(this.ctx.currentTime + fade); } catch { this.releaseVoice(voice); }
    }

    later(seconds, fn, group = 'encounter') {
      if (!this.canPlay()) return;
      const generation = this.generation, version = this.groupVersions.get(group) || 0;
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (this.canPlay() && (group === 'world' || generation === this.generation) && version === (this.groupVersions.get(group) || 0)) fn();
      }, Math.max(0, seconds * 1000));
      this.timers.set(timer, group);
      return timer;
    }

    cancel(group, fade = .045) {
      this.groupVersions.set(group, (this.groupVersions.get(group) || 0) + 1);
      for (const [timer, owner] of this.timers) if (owner === group) { clearTimeout(timer); this.timers.delete(timer); }
      for (const voice of [...this.voices]) if (voice.group === group) this.stopVoice(voice, fade);
    }

    canPlay() {
      return this.unlocked && !this.disposed && !this.hidden && this.ctx?.state === 'running';
    }

    ensureLoops() {
      if (!this.canPlay() || this.scene === 'intro' || this.scene === 'end') return;
      for (const [name, config] of Object.entries(LAYERS)) {
        if (this.loops.has(name) || this.loopLoading.has(name)) continue;
        this.loopLoading.add(name);
        this.load(this.catalogue(name)[0].file).then(buffer => {
          this.loopLoading.delete(name);
          if (!buffer || !this.canPlay() || this.scene === 'intro' || this.scene === 'end' || this.loops.has(name)) return;
          const voice = this.voice(name, buffer, { ...config, loop: true, group: 'bed', rate: random(.975, 1.025) });
          this.loops.set(name, voice);
          this.mixLayers();
        });
      }
    }

    mixLayers() {
      if (!this.ctx) return;
      for (const [name, voice] of this.loops) {
        const config = LAYERS[name];
        let level = config.level;
        if (name.startsWith('rain-')) level *= 1 + this.shift * .16;
        if (name === 'mechanical-rumble') level = this.shift === 2 ? .045 : 0;
        const movement = name === 'fluorescent' ? 1 : 1 + .09 * Math.sin(this.ctx.currentTime * (.07 + name.length * .002) + name.length);
        this.ramp(voice.gain.gain, level * movement, 2.8);
      }
    }

    stopLoops() {
      for (const voice of this.loops.values()) this.stopVoice(voice, .3);
      this.loops.clear();
    }

    setScene(scene, shift = this.shift) {
      const active = value => ['working', 'result'].includes(value);
      const continuingWorld = active(this.scene) && active(scene) && this.shift === shift;
      this.generation++;
      for (const group of ['encounter', 'story', 'action']) this.cancel(group);
      if (!continuingWorld) this.cancel('world');
      this.scene = scene;
      this.shift = shift;
      if (this.duck) this.ramp(this.duck.gain, 1, .25);
      if (this.loops.has('fluorescent')) this.ramp(this.loops.get('fluorescent').source.playbackRate, 1, 2);
      if (scene === 'intro' || scene === 'end') this.stopLoops();
      this.applySettings();
      this.ensureLoops();
      this.mixLayers();
      if (!continuingWorld) this.scheduleWorld();
      this.change();
    }

    scheduleWorld() {
      this.cancel('world');
      if (!this.canPlay() || !['working', 'result'].includes(this.scene)) return;
      const recur = (delay, task) => {
        const run = () => { task(); this.later(random(...delay), run, 'world'); };
        this.later(random(...delay), run, 'world');
      };
      recur([16, 37], () => this.play('passing-car', { group: 'world', outside: true, gain: .24, pan: -.8, panTo: .8, rate: random(.85, 1.07) }));
      recur([38, 67], () => this.play('rattle', { group: 'world', gain: .075, pan: -.65 }));
      if (this.shift > 0) {
        recur([47, 79], () => this.play('thunder', { group: 'world', outside: true, cutoff: 600, gain: .22, pan: random(-.6, .6) }));
        recur([29, 54], () => this.play('buzz', { group: 'world', gain: .09, pan: .45 }));
      }
      recur([2.3, 3.1], () => this.mixLayers());
    }

    customerApproach({ duration, index }) {
      this.cancel('encounter');
      const side = index % 2 ? .7 : -.7;
      const count = Math.max(1, Math.floor(duration / .48));
      for (let i = 0; i < count; i++) {
        const u = count === 1 ? .8 : i / (count - 1);
        this.later(i * duration / count, () => {
          this.play('footstep', { group: 'encounter', outside: true, gain: .14 + .28 * u, pan: side * (1 - u), cutoff: 700 + u * 1300, rate: .9 + index % 3 * .07 });
          if (i % 3 === 1) this.play('splash', { group: 'encounter', outside: true, gain: .12 + .1 * u, pan: side * (1 - u) });
        });
      }
      this.later(Math.max(.01, duration - .2), () => this.play('cloth', { group: 'encounter', outside: true, gain: .18, pan: -.05 }));
    }

    customerAtWindow(customer, index) {
      this.play('knock', { group: 'encounter', outside: true, gain: .24, pan: -.15 });
      this.later(.38, () => this.play('counter-place', { group: 'encounter', gain: .25, pan: -.2 }));
      this.storyEncounter(customer, index);
    }

    customerDeparture({ duration, index, customer }) {
      this.cancel('encounter');
      const silent = this.shift === 2 && ['Hollis', 'Last Customer'].includes(customer.name);
      if (!silent) {
        const count = Math.max(1, Math.floor(duration / .45));
        for (let i = 0; i < count; i++) this.later(.1 + i * duration / count, () => this.play('footstep', {
          group: 'encounter', outside: true, gain: .31 * (1 - i / (count + 1)),
          pan: (index % 2 ? -1 : 1) * .65 * i / count, cutoff: 1900 - i * 250
        }));
        this.later(duration + .3, () => this.play('car-door', { group: 'encounter', outside: true, gain: .18, pan: index % 2 ? -.7 : .7 }));
        this.later(duration + 1.1, () => this.play('engine', { group: 'encounter', outside: true, gain: .15, pan: index % 2 ? -.7 : .7 }));
      }
    }

    silence(seconds, amount = .05) {
      if (!this.duck || !this.canPlay()) return;
      this.ramp(this.duck.gain, amount, .45);
      this.later(seconds, () => this.ramp(this.duck.gain, 1, 1.6), 'story');
    }

    storyEncounter(customer, index) {
      if (this.shift === 0) return;
      const later = (s, fn) => this.later(s, fn, 'story');
      if (this.shift === 1 && index === 0) later(2.5, () => this.play('buzz', { group: 'story', gain: .15, pan: .55 }));
      if (this.shift === 1 && index === 2) later(1.3, () => this.play('engine', { group: 'story', outside: true, gain: .11, rate: .73, pan: -.65 }));
      if (this.shift === 1 && customer.strange) {
        later(3, () => this.silence(2.2, .15));
        later(4, () => this.play('rattle', { group: 'story', outside: true, gain: .11, pan: -.8, cutoff: 800 }));
      }
      if (this.shift === 2) {
        const hum = this.loops.get('fluorescent');
        if (hum) this.ramp(hum.source.playbackRate, customer.strange ? .88 : .98, 5);
        if (index === 1) later(3, () => this.play('footstep', { group: 'story', outside: true, gain: .17, pan: .85 }));
        if (index === 2) {
          for (const s of [2, 2.37]) later(s, () => this.play('knock', { group: 'story', gain: .23, pan: -.9, cutoff: 2600 }));
        }
        if (index === 3) later(2, () => this.play('intercom', { group: 'story', gain: .17, pan: -.1, rate: .7 }));
        if (index >= 4) {
          later(2.5, () => this.silence(3.5, .015));
          if (index === 5) later(4, () => this.play('knock', { group: 'story', gain: .13, pan: .88 }));
        }
      }
    }

    watchPendulum(element) {
      let previous = null, lastTick = -10, lastSample = 0;
      const sample = now => {
        if (this.disposed) return;
        this.pendulumFrame = requestAnimationFrame(sample);
        if (now - lastSample < 45) return;
        lastSample = now;
        const moving = element.getAnimations().some(a => a.playState === 'running' && a.playbackRate !== 0);
        if (!moving || !this.canPlay() || !['working', 'result'].includes(this.scene)) { previous = null; return; }
        const transform = getComputedStyle(element).transform;
        const parts = transform.startsWith('matrix(') ? transform.slice(7, -1).split(',').map(Number) : null;
        const angle = parts ? Math.atan2(parts[1], parts[0]) : 0;
        if (previous !== null && previous * angle < 0 && Math.abs(angle - previous) > .001 && now - lastTick > 450) {
          this.play('pendulum', { gain: random(.045, .065), pan: -.65, cooldown: .45 });
          lastTick = now;
        }
        previous = angle;
      };
      this.pendulumFrame = requestAnimationFrame(sample);
    }

    setHidden(hidden) {
      this.hidden = hidden;
      if (!this.ctx || this.disposed) return;
      if (hidden) {
        for (const group of ['world', 'story', 'encounter', 'action']) this.cancel(group, .01);
        this.ctx.suspend().catch(() => {});
      } else if (this.unlocked) {
        this.ctx.resume().then(() => {
          if (this.hidden || this.disposed) return;
          this.ramp(this.duck.gain, 1, .7);
          this.ensureLoops(); this.scheduleWorld(); this.change();
        }).catch(() => this.change());
      }
    }

    snapshot() {
      return { state: this.ctx?.state || 'locked', scene: this.scene, shift: this.shift, muted: this.settings.muted,
        loops: this.loops.size, voices: this.voices.size, timers: this.timers.size, cached: this.buffers.size,
        missing: [...this.failures], generation: this.generation };
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.generation++;
      for (const timer of this.timers.keys()) clearTimeout(timer);
      this.timers.clear();
      cancelAnimationFrame(this.pendulumFrame);
      for (const voice of [...this.voices]) { try { voice.source.stop(); } catch {} this.releaseVoice(voice); }
      this.loops.clear(); this.buffers.clear();
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      document.removeEventListener('pointerdown', this.gestureHandler);
      document.removeEventListener('keydown', this.gestureHandler);
      window.removeEventListener('pagehide', this.pageHideHandler);
      window.removeEventListener('pageshow', this.pageShowHandler);
      if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {});
    }
  }
  window.NightAudio = NightAudio;
})();
