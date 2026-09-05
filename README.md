# Spin the Wheel

A game-show style spinner wheel you can play with a mouse (click &amp; drag) or a
finger (swipe/touch), built as a plain HTML/CSS/JS site with no build step —
ready to host on GitHub Pages.

## Try it locally

Just open `index.html` in a browser, or serve the folder with any static
server, e.g.:

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

## Files

- `index.html` — page structure
- `styles.css` — dark, game-show-ish theme; responsive down to phone widths
- `script.js` — wheel drawing, spin physics, customize panel, persistence
- `.nojekyll` — disables Jekyll processing on GitHub Pages

## Ideas for next steps

- Add a confetti burst or bigger celebration animation on landing.
- Weight segments unevenly (e.g. bias probability instead of equal-sized
  wedges) if you want some outcomes rarer than others.
- Add a shareable URL that encodes the segment list, so a customized wheel
  can be linked directly.
