# Spending Log

A tiny private expense tracker. Add what you spend, see the monthly total and a
category breakdown. **No build step, no backend, no accounts** — just three files.
All data stays in your browser's `localStorage`.

## Run locally

Open `index.html` in a browser. That's it.

(If your browser blocks the ES module on `file://`, serve the folder instead:
`python3 -m http.server` then visit http://localhost:8000.)

## Deploy free on GitHub Pages

1. Create a new **public** repo on GitHub, e.g. `spending-log`. Don't add any files.
2. From this folder:
   ```bash
   git add -A
   git commit -m "Spending Log"
   git branch -M main
   git remote add origin https://github.com/<your-username>/spending-log.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch → Branch: `main` / `/ (root)` → Save.**
4. Wait ~1 minute. Your site is live at
   `https://<your-username>.github.io/spending-log/`

Every `git push` after that redeploys automatically.

## Customise

- **Currency:** change `CURRENCY` at the top of `app.js`.
- **Categories:** edit the `<option>` list in `index.html`.
- **Colours:** the CSS variables at the top of `style.css` (light + dark).

## Files

| File | What it does |
| --- | --- |
| `index.html` | markup + the add form |
| `style.css` | all styling, light/dark aware |
| `app.js` | state, localStorage, rendering, CSV export |
