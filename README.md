# Standalone geomap deployment

The planner is HTML, CSS, and browser-ready JavaScript, not TypeScript.
There is no npm development server or compilation step required.

## GitHub Pages

Site: https://tvy14.github.io/miniran-geomap/
Repository: https://github.com/tvy14/miniran-geomap

The standalone repository contains only the web application and deployment
tooling, not the parent miniRAN-2 repository or native stack. Its Pages source
is GitHub Actions. Pushing to `main` runs tests, builds `dist/`, and deploys
only that artifact using `.github/workflows/pages.yml`. All local asset links
are relative so the `/miniran-geomap/` subpath works without a bundler.
When this folder is inside miniRAN-2, its nested workflow is just a template;
deployment runs from the separate miniran-geomap repository root.

`npm run dev` is a convention for a development server, not a requirement for
publication. TypeScript requires compilation; these sources are plain
JavaScript. Here `python3 publish.py build` packages the static site, and GitHub
Pages serves it without Python, Node, a local server, or a Cloudflare tunnel.

## Local serving / optional Cloudflare tunnel

From this folder, run:

    python3 publish.py

This copies an explicit web-asset allowlist to `dist/` and serves those
assets on `127.0.0.1:8765`. In another terminal, run:

    cloudflared tunnel --url http://localhost:8765

Open the HTTPS URL printed by cloudflared. Keep both processes running.
Quick Tunnel URLs are temporary and publicly accessible; do not enter
sensitive topology data. This command does not configure authentication.

To build only (for another static host):

    python3 publish.py build

Publish only the allowlisted web assets in `dist/`, never the whole geomap
folder: `native_stack/` contains native builds, configuration, and logs.
The bundled server rejects unlisted paths, directory listings, and symlink
assets. It is a small demo server, not a hardened high-traffic web server.
Re-run it after modifying source assets. No Node/npm packages are needed.
If port 8765 is already occupied by this planner, just open
http://localhost:8765 or start cloudflared; do not launch a second server.
Otherwise stop the existing server, or use `python3 publish.py --port 8767`
with `cloudflared tunnel --url http://localhost:8767`. The script reports
occupied ports without a traceback; it does not kill unrelated processes.

Leaflet loads from unpkg; map tiles load from external providers, so internet
access is needed. The standalone map and simulations work without a backend.
The RIC controls require the separate `software_stack` backend and are not
provided or exposed by this static deployment. Do not publish an unauthenticated
control backend through a public tunnel.

Verification:

    python3 -m unittest test_publish.py

## Appearance

The header's Light/Dark mode button switches the interface palette. The first
visit follows the system preference; an explicit choice is saved locally when
browser storage is available. Parameter controls use a pastel-green palette,
larger labels, and tabular monospace values. Map tiles and radio coverage colors
are not recolored, so their scientific meaning stays unchanged.

Optional browser regression (requires Playwright and installed Google Chrome):

    python3 test_theme_browser.py

Pass the public site URL as an argument to verify the deployed version instead.
