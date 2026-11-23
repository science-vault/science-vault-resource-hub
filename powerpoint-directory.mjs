// Repository-path tree for PowerPoints. Folder names come from each source file URL,
// not from inferred curriculum metadata. The active catalogue filters still apply.
let trail = [];
const collator = new Intl.Collator('en-AU', {numeric:true, sensitivity:'base'});
const sourceRepo = 'powerpoint-library';
function pathParts(row) {
  try {
    const url = new URL(row.file);
    const pieces = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    // GitHub Pages: /powerpoint-library/<repository folders>/<filename>
    const index = pieces.indexOf(sourceRepo);
    if (index >= 0) return pieces.slice(index + 1);
    // GitHub raw/content URLs: /owner/repo/(raw|blob)/branch/...
    const repoIndex = pieces.indexOf(sourceRepo);
    if (repoIndex >= 0) {
      const rest = pieces.slice(repoIndex + 1);
      return ['raw','blob'].includes(rest[0]) ? rest.slice(2) : rest;
    }
    return pieces.length ? pieces : [row.title || 'Untitled'];
  } catch { return [row.title || 'Untitled']; }
}
export function directoryView(rows, container, openResource) {
  const root = document.createElement('div');
  root.className = 'directory-view';
  const crumbs = document.createElement('nav');
  crumbs.className = 'directory-crumbs';
  crumbs.setAttribute('aria-label', 'Repository folder location');
  const listing = document.createElement('div');
  listing.className = 'directory-list';
  root.append(crumbs, listing);
  container.replaceChildren(root);
  const entries = rows.map(row => ({row, parts:pathParts(row)}));
  function draw() {
    let subset = entries.filter(entry => trail.every((part,i) => entry.parts[i] === part));
    if (!subset.length && trail.length) {
      trail = [];
      subset = entries;
    }
    crumbs.replaceChildren();
    function crumb(name, depth) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.disabled = depth === trail.length;
      button.onclick = () => { trail = trail.slice(0,depth); draw(); };
      crumbs.append(button);
    }
    crumb(sourceRepo, 0);
    trail.forEach((part,i) => { crumbs.append(' / '); crumb(part,i+1); });
    listing.replaceChildren();
    const summary = document.createElement('p');
    summary.className = 'directory-summary';
    summary.textContent = subset.length.toLocaleString('en-AU') + ' presentations · Repository folder structure';
    listing.append(summary);
    const folders = new Map(), files = [];
    for (const entry of subset) {
      const part = entry.parts[trail.length];
      if (entry.parts.length > trail.length + 1) {
        if (!folders.has(part)) folders.set(part, new Set());
        folders.get(part).add(entry.row.file || entry.row.id);
      } else files.push(entry);
    }
    for (const [name, items] of [...folders].sort((a,b) => collator.compare(a[0],b[0]))) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'directory-entry';
      const icon = document.createElement('span'); icon.className = 'directory-symbol'; icon.textContent = '📁';
      const title = document.createElement('span'); title.textContent = name;
      const count = document.createElement('small'); count.textContent = items.size.toLocaleString('en-AU') + ' files';
      button.append(icon,title,count);
      button.onclick = () => { trail.push(name); draw(); };
      listing.append(button);
    }
    files.sort((a,b) => collator.compare(a.parts.at(-1),b.parts.at(-1)));
    for (const entry of files) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'directory-entry';
      const icon = document.createElement('span'); icon.className = 'directory-symbol'; icon.textContent = '📊';
      const title = document.createElement('span'); title.textContent = entry.parts.at(-1);
      const meta = document.createElement('small'); meta.textContent = entry.row.format || 'PowerPoint';
      button.append(icon,title,meta);
      button.onclick = () => openResource(entry.row);
      listing.append(button);
    }
    if (listing.children.length === 1) {
      const empty = document.createElement('p'); empty.className = 'directory-summary';
      empty.textContent = 'No files in this folder match the selected filters.';
      listing.append(empty);
    }
  }
  draw();
}
