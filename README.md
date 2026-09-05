# Spin the Wheel + Spin Art

Two little apps that share the same "grab and spin" mechanic, built as a
plain HTML/CSS/JS site with no build step — ready to host on GitHub Pages:

- **Spin the Wheel** (`index.html`) — a game-show style spinner wheel you can
  play with a mouse (click &amp; drag) or a finger (swipe/touch).
- **Spin Art** (`spin-art.html`) — a virtual spin-art disc: tap Spin to get it
  going (it keeps spinning for roughly 25 seconds before it drifts to a
  stop), then click and hold to drip paint that flings outward while it
  spins, just like the real machines. Adjust color opacity with the
  Opacity slider. Save your art as a PNG when you're done.

A small nav in the header switches between the two pages.

## Try it locally

Just open `index.html` (or `spin-art.html`) in a browser, or serve the
folder with any static server, e.g.:

```
npx serve .
```

## Deploy to GitHub Pages

1. Create a new GitHub repository (or use an existing one) and push these
   files to it:
   ```
   git init
   git add .
   git commit -m "Add spinner wheel app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. On GitHub, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   pick the `main` branch and the `/ (root)` folder, then **Save**.
4. GitHub will publish the site at
   `https://<your-username>.github.io/<your-repo>/` within a minute or two.

The included `.nojekyll` file tells GitHub Pages to serve the files as-is
without running them through Jekyll (not strictly required here since there
are no underscore-prefixed files, but it's a safe default for static sites).

## How it works

- **Wheel & segments** — drawn on an HTML `<canvas>`. Each segment has a
  `label`, a `color`, and an optional `note` (the message shown when the
  wheel lands on it).
- **Spinning** — uses the Pointer Events API, so the same code handles mouse
  drag and touch swipe. Grab the wheel and flick it; your drag speed becomes
  the wheel's initial spin speed, which then decelerates naturally via
  simulated friction. There's also a center "SPIN" button (and Space/Enter
  when the wheel is focused) for a random spin without dragging.
- **Result** — when the wheel stops, it fires a `spinnerResult` custom event
  on `window` with the winning segment's data:
  ```js
  window.addEventListener("spinnerResult", (e) => {
    console.log(e.detail.index, e.detail.segment);
    // e.detail.segment = { label, color, note }
  });
  ```
  Hook into this event to add your own behavior per result — navigate to a
  page, show a bigger modal, award points, play a sound, etc.
- **Customize** — the "Customize" button opens a panel to add/remove
  segments and edit each one's label, color, and result message. Changes are
  saved to the browser's `localStorage` automatically, so they persist next
  time you (or a player) load the page in that browser. If storage isn't
  available (e.g. a locked-down preview), it just keeps working in memory
  for that session.

## Spin Art

- **The disc** is drawn on a `<canvas>`, with a permanent offscreen "paint
  layer" underneath it that the visible canvas just rotates and redraws each
  frame — so painted marks stay stuck to the disc as it spins, exactly like
  paint on a real spinning surface.
- **Spinning and pouring are two separate controls**, on purpose — dragging
  the disc to spin it used to conflict with dragging on it to pour paint
  (starting a pour would kill your spin, and vice versa). Now:
  - **Spin** — the button and speed slider beside the disc give it a burst
    of rotational speed (strength set by the slider), which then decays
    naturally via friction over roughly 20&ndash;27 seconds depending on the
    slider, just like a flick. Click again (or press Space while the disc is
    focused) to keep it going. This never reacts to anything you do with the
    mouse on the disc itself.
  - **Pouring** — click and hold anywhere on the disc to drip your selected
    color; this only ever moves the pour point, never the disc's rotation.
    Paint is flung outward from the drop point, and the faster the disc is
    spinning while you pour, the further and straighter the streaks fling
    (mimicking centrifugal force). Holding still pours in one place; since
    the disc keeps spinning independently underneath, dragging the pour
    point from the center outward traces a spiral.
- **Colors & brush size** — pick from the swatch row or use the custom color
  picker; brush size (S/M/L) controls streak thickness. The **Opacity**
  slider in the toolbar controls how transparent new paint strokes are, from
  faint washes to fully solid; each stroke keeps the opacity it was poured
  with, so you can layer washes of different strength.
- **Clear** wipes the disc back to blank. **Save PNG** downloads the current
  artwork (just the disc, not the whole page) as `spin-art.png`.

## Files

- `index.html` / `spin-art.html` — page structure for each app
- `styles.css` — shared dark theme, nav, and the wheel's own styles
- `spin-art.css` — spin-art-specific styles (disc, palette, toolbar)
- `script.js` — wheel drawing, spin physics, customize panel, persistence
- `spin-art.js` — spin-art disc rendering, spin physics, paint particles
- `.nojekyll` — disables Jekyll processing on GitHub Pages

## Ideas for next steps

- Add a confetti burst or bigger celebration animation on landing (wheel).
- Weight segments unevenly (e.g. bias probability instead of equal-sized
  wedges) if you want some outcomes rarer than others (wheel).
- Add a shareable URL that encodes the segment list, so a customized wheel
  can be linked directly (wheel).
- Let spin art streak color fade/thin out over their length, or add a
  "splatter" mode that flings several colors from one pour (spin art).
