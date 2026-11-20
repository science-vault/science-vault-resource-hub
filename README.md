# Science Vault Resource Hub

A static catalogue of assessments, exams, textbooks, videos and worksheets from the five Science Vault collections. The combined site indexes metadata and opens media and documents from their original hosts. Each catalogue retains its source curriculum fields. Worksheet answer keys and assessment marking keys use the associations provided by the original catalogues and the School Assessment Library matching model. Pass a collection name such as `assessments` to refresh just that collection.

Serve the site with `python3 -m http.server --directory . 8000`.

Run `node refresh.mjs` with Node.js 20 or newer to refresh the five catalogues from the published vaults. Commit the updated catalogue JSON files and redeploy the site to publish the new snapshot. The video curriculum rules in `video-curriculum.cjs` come from the Video Library.
