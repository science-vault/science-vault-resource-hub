# Science Vault Resource Hub

Each collection has a dedicated page that reads and normalizes the corresponding published catalogue. The bundled JSON files are fallback snapshots when a source is unavailable.

Serve the site with `python3 -m http.server --directory . 8000`.

Use Node.js 20 or newer to run `node refresh.mjs` to update fallback snapshots. Pass a collection name to refresh only that snapshot. The assessment model and video curriculum rules are shared by browser and refresh scripts.
