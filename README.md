# NIGHT WINDOW — Graveyard Shift

A playable browser cashier game set inside a locked roadside gas-station booth. Three nights, 18 visitors, and an increasingly uneasy road outside your window.

## Play

Open `index.html` in Chrome, Edge, Firefox, or Opera. Keep `audio.js` and the `assets/` folder beside it. The game works offline and has no production package dependencies. Direct file opening loads a local audio bundle; normal hosting loads individual WAV files.

For a local preview server, run `npm run dev` and visit `http://127.0.0.1:4173`.

## Working the window

1. Clock in and read the supervisor's notes. Wait for each customer to walk up from the forecourt.
2. Read the paper order and click products to scan them. The computer displays quantities, individual line prices, merchandise subtotal, fuel prepayment, and the total. Use the minus buttons to correct mistakes before charging.
3. For gasoline, open **Fuel Pumps**, choose the correct pump (1–4), and enter the exact prepayment. For tobacco, **Check ID** first. Close the ID card and refuse sales to customers under 21.
4. **Ring Up Order** checks the entire basket, fuel authorization, and any required ID.
5. **Cash:** take the customer's money to open the drawer, then click bills and coins to build the change tray. Click a tray entry to put it back, or clear it and recount. **Return Change** succeeds only for the exact amount due. For exact cash, return the empty tray.
6. **Card:** send the amount to the reader, tap the customer's card, wait for authorization, then print the receipt. You can cancel and edit before authorization begins.
7. Watch the customer leave, read the printed receipt, and **Call Next Customer**. After six visitors, close out the shift. Finish all three nights to see the ending.

All money is stored and counted as integer cents. A refused sale collects no payment. Completed payments cannot be booked twice.

## Around the booth

- The older desktop POS has a CRT-style screen, keyboard, mouse, and power indicator. **Shift Log** shows actual transactions and revenue; **Stock** opens the product price file.
- A brass desk pendulum swings beside your mug. Click it to nudge it into a larger swing.
- Pedestrians pass behind the service window. The next visitor waits in the forecourt; customers approach and depart instead of appearing instantly.
- Warm desk lighting, worn counter materials, receipt paper, screen grain, condensation, and rain contrast with the cool exterior.
- Audio starts when you click **Clock In**, following browser autoplay rules. **Audio / Settings** opens master, ambience, and effects sliders plus mute. Settings persist on this device. You can also enable audio from the title screen.
- **E** repeats the customer's order. **Escape** closes ID, fuel, and shift-note panels. Buttons support keyboard navigation. Reduced-motion preferences shorten arrivals and disable ongoing decorative motion.
- On narrower screens, the order, stock, and workstation stack below the window. Payment equipment stays within the viewport and scrolls when needed.

## Development checks

With Node.js 20+ and Google Chrome installed:

```sh
npm ci
npm test
```

Tests run the actual offline and hosted game in headless browsers. They cover all 18 encounters, checkout and ID rules, actual mixed audio output, mute, saved settings, arrival/departure cues, motion-synchronized pendulum clicks, scripted horror and silence, suspension/disposal, missing assets, unavailable audio APIs, denied storage, valid WAV data and loop seams, and responsive layouts. Screenshots are written to the ignored `test-results/` folder.

Set `PLAYWRIGHT_CHANNEL=msedge` to run against installed Microsoft Edge instead.

Audio smoke tests also run in Edge and Playwright Firefox when available. Install Firefox with `npx playwright install firefox`. Set `AUDIO_CROSS_BROWSER=1` to require both instead of skipping unavailable browsers.

## Audio design

The soundscape layers rain on pavement, glass patter, canopy wind, distant traffic, room tone, ventilation, computer fan, and fluorescent hum. Exterior sounds are filtered through the security glass; close equipment is clearer. Vehicles move across stereo space. Independent loop lengths, playback variation, slow mix changes, and sparse world events keep the beds from repeating together.

Sixty original WAV assets provide wet footsteps, cloth, knocks, paper, coins, drawers, printer gears, relay clicks, card handling, engines, thunder, and restrained electronic equipment cues. These are material-based procedural sound designs, not field recordings. Dialogue remains in subtitles; no browser text-to-speech is used. The pendulum's quiet escapement tick follows its actual animated center crossings and stops when the toy is stationary.

Later scripted encounters add electrical faults, unusual knocks, altered hum, and temporary losses of ambience. No loud stingers or background music are used. Audio fades between game states, suspends in hidden tabs, and cancels old effects on replay. Missing audio falls back quietly without blocking checkout.

See [AUDIO.md](AUDIO.md) for the mixer and event map. Rebuild all assets reproducibly with `npm run audio:build`. Asset provenance and the CC0 dedication are in `assets/audio/LICENSE.txt`.

## Creative references

Original artwork and implementation. The brief's *Evenin' Shift* and *Supermarket Together* references inform the atmosphere and cashier workflow; no assets from those games are used. The existing fuel, ID, story, and three-shift systems are preserved.
