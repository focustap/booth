# Night Window sound design

`audio.js` owns the AudioContext, loading, voices, mixer, lifecycle, and event scheduling. The inline game calls named events rather than oscillator frequencies. `scripts/build-audio.mjs` produces all 60 original 22.05 kHz, mono, 16-bit WAV files deterministically, using filtered stochastic noise, inharmonic resonators, motor harmonics, and material-specific envelopes. The designs approximate physical sound; they are not recordings.

## Routing

- Ambience sources → individual lowpass/pan/gain → ambience bus → scene crossfade → scripted silence gain → master.
- One-shots → lowpass/pan/gain → effects bus → master. Close interior effects also send a little signal to a short stereo room impulse.
- Master → gentle peak compressor → output analyser → speakers. Settings affect both dry and reverberant effects.
- Exterior sources default to a 1.45 kHz lowpass. Glass rain and near footsteps get more high-frequency detail. Distant engines and thunder get less. StereoPanner has a mono fallback.

The default mix is 80% master, 58% ambience, 76% effects. These are gain controls, not claims about perceived loudness. Saved values are clamped and validated; disabled storage is supported. No dialogue bus is shown because there are no voice assets.

Nine ambient layers have independent seamless loops, initial offsets, subtle rate differences, and slow level movement. The ninth layer, mechanical rumble, is silent until the final shift. Sample tails overlap into their heads at build time. State transitions fade existing layers rather than restarting them at every customer. Sparse passing cars, rattles, heavier-rain thunder, and later-night electrical faults use independent bounded timers.

## Event map

| Game event | Sound |
| --- | --- |
| Clock In / close shift | Computer startup / shutdown; ambient fade |
| Customer approach | Increasing wet footsteps, occasional splash, clothing rustle |
| Customer reaches glass | Muffled knock, item placement |
| Scan / remove product | Scanner tone / physical key |
| Charge / wrong order or change | Placement and register key / restrained warning |
| Take cash | Paper handling, drawer rails and latch |
| Count / undo change | Separate paper or metallic coin assets |
| Confirm cash | Drawer close, receipt motor and paper, quiet approval |
| Send card / tap / authorize | Keypad, plastic contact, processing tone, approval |
| Pump selection / authorization | Physical key and keypad, relay, outside motor, confirmation |
| ID / refusal | Paper handling and return |
| Workstation tabs / typing | Mouse switch and keyboard key; journal notification |
| Intercom | Brief band-limited switch/static |
| Pendulum crossing its center | Quiet mechanical escapement tick with variation |
| Customer departure | Receding wet footsteps, distant car door, engine |

The final Hollis and Last Customer departures intentionally omit footsteps, matching their scripted uncanny behavior. Reduced-motion arrivals have fewer steps; audio never extends a walk that has already finished. The pendulum watcher reads the actual composed animation transform, including nudges; it does not use an unrelated fixed metronome.

## Scripted progression

- First shift: ordinary station sound.
- Rina: a fluorescent fault. Owen: a low idling engine. Ari and the Night Driver: a brief ambient dip with a distant metallic rattle.
- Final shift: altered electrical pitch and low motor rumble. Mrs. Dyer: an isolated side footstep. Noah: two knocks from the back of the booth. Elise: intercom interference. Hollis and the Last Customer: sustained near-silence; the final visitor adds a quiet knock from an unexpected direction.

## Lifecycle and delivery

AudioContext creation/resume originates in Clock In or Enable Audio. Gameplay never awaits asset decoding. One-shots carry scene generations and cancellable group versions so delayed decoding or timers cannot play an obsolete event. Per-sound cooldowns, a three-voice limit per effect, and a 40-voice overall cap prevent stacking. Nodes disconnect on completion.

Hidden tabs cancel pending one-shots and suspend the context. Resuming restores the ambient graph without replaying old footsteps or knocks. Briefings reduce the bed; shift-end and replay fade and stop it. Disposal clears timers, animation sampling, buffers, nodes, and event listeners.

Hosted play fetches WAVs on demand. Direct `file://` play loads `assets/audio/offline.js`, a byte-identical base64 fallback bundle. Both forms cache decoded buffers. Missing/corrupt assets get quiet procedural substitutes; an unavailable AudioContext leaves the game playable. Deploy `index.html`, `audio.js`, and the entire `assets/audio/` directory together.

`npm test` checks actual analyser output, persistence, cue integration, motion sync, scripted silence, cleanup, fallback behavior, full checkout progression, asset integrity, and browser compatibility. Tests can inspect `audio.snapshot()` and the bounded event history; neither is presented as gameplay UI.
