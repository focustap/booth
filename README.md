# NIGHT WINDOW — Graveyard Shift

A playable browser cashier game set inside a locked roadside gas-station booth. Three nights, 18 visitors, and an increasingly uneasy road outside your window.

## Play

Open `index.html` in Chrome, Edge, Firefox, or Opera. The complete game, original SVG artwork, animation, and generated audio are in that file. There are no runtime dependencies, downloads, or network requests.

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
- **Sound** enables generated rain, a quiet electrical hum, scanner beeps, coins, and payment feedback. Sound starts off.
- **E** repeats the customer's order. **Escape** closes ID, fuel, and shift-note panels. Buttons support keyboard navigation. Reduced-motion preferences shorten arrivals and disable ongoing decorative motion.
- On narrower screens, the order, stock, and workstation stack below the window. Payment equipment stays within the viewport and scrolls when needed.

## Development checks

With Node.js 20+ and Google Chrome installed:

```sh
npm ci
npm test
```

Tests run the actual offline HTML game in headless Chrome. They cover all 18 encounters, cash mistakes and undo, exact cash and pennies, duplicate-payment prevention, card authorization, fuel validation and frozen receipts, ID checks and refusal, replay reset, arrivals, sound controls, and desktop/mobile layouts. Screenshots are written to the ignored `test-results/` folder.

Set `PLAYWRIGHT_CHANNEL=msedge` to run against installed Microsoft Edge instead.

## Creative references

Original artwork and implementation. The brief's *Evenin' Shift* and *Supermarket Together* references inform the atmosphere and cashier workflow; no assets from those games are used. The existing fuel, ID, story, and three-shift systems are preserved.
