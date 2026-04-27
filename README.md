# Helm Dashboard

Single-file, mobile-first boating dashboard for the Boyne City to Bay City route.

## Files

- `index.html` - the complete dashboard app
- `README.md` - deployment and iPhone instructions

No backend, build tools, package manager, or dependencies are required.

## Deploy To GitHub Pages

### Option 1: Upload In The GitHub Website

1. Create a new GitHub repository named `helm-dashboard`.
2. Upload `index.html` and `README.md` to the repository root.
3. Open the repository `Settings`.
4. Go to `Pages`.
5. Under `Build and deployment`, set:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - Folder: `/root`
6. Click `Save`.
7. Wait for GitHub Pages to publish the site.
8. Open:

```text
https://YOUR-GITHUB-USERNAME.github.io/helm-dashboard/
```

### Option 2: Deploy With Git

From this folder:

```bash
git init
git add index.html README.md
git commit -m "Deploy helm dashboard"
git branch -M main
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/helm-dashboard.git
git push -u origin main
```

Then enable GitHub Pages using the same `Settings` -> `Pages` steps above.

## Open On iPhone

1. Open the GitHub Pages URL in Safari.
2. Tap the share button.
3. Tap `Add to Home Screen`.
4. Name it `Helm Dashboard`.
5. Open it from the Home Screen before departure.

The dashboard saves entered fields, checklist state, emergency contact, decision status, and dark-mode preference in the browser on that iPhone.

## Underway Use

Use the top flow:

1. Check conditions.
2. Decide `GO`, `CAUTION`, or `NO-GO`.
3. Contact help or marina if needed.

This dashboard is a planning and decision aid, not a navigation chart. Confirm weather, charts, hazards, Notices to Mariners, harbor conditions, and vessel readiness before departure.
