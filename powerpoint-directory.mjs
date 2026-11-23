// Folder-style view for the live PowerPoints catalogue.
let trail = [];
export function directoryView(rows, container, openResource) {
  const root = document.createElement('div');
  root.className = 'directory-view';
  const crumbs = document.createElement('nav');
  crumbs.className = 'directory-crumbs';
  crumbs.setAttribute('aria-label', 'Folder location');
  const listing = document.createElement('div');
  listing.className = 'directory-list';
  root.append(crumbs, listing);
  container.replaceChildren(root);
  function draw() {
    const levels = [
      { label: 'Year level', get: row => row.years?.length ? row.years.map(y => /^\\d+$/.test(y) ? 'Year ' + y : y) : ['Unspecified year'] },
      { label: 'Subject', get: row => [row.subject || 'Other subjects'] },
      { label: 'Topic', get: row => [row.topic || row.strand || 'Other topics'] },
    ];
    let subset = rows;
    for (let i = 0; i < trail.length; i++) subset = subset.filter(row => levels[i].get(row).includes(trail[i]));
    crumbs.replaceChildren();
    const crumb = (name, depth) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = name;
      b.onclick = () => { trail = trail.slice(0, depth); draw(); };
      crumbs.append(b);
    };
    crumb('All PowerPoints', 0);
    trail.forEach((part, i) => { crumbs.append(document.createTextNode(' / ')); crumb(part, i + 1); });
    listing.replaceChildren();
    const heading = document.createElement('p');
    heading.className = 'directory-summary';
    heading.textContent = subset.length + ' presentation' + (subset.length === 1 ? '' : 's') + (trail.length < levels.length ? ' · Browse by ' + levels[trail.length].label.toLowerCase() : '');
    listing.append(heading);
    if (trail.length < levels.length) {
      const folders = new Map();
      for (const row of subset) for (const name of levels[trail.length].get(row)) {
        if (!folders.has(name)) folders.set(name, new Set());
        folders.get(name).add(row.id || row.file);
      }
      const sort = new Intl.Collator('en-AU', { numeric: true, sensitivity: 'base' });
      for (const [name, ids] of [...folders].sort((a,b) => sort.compare(a[0],b[0]))) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'directory-entry';
        const symbol = document.createElement('span'); symbol.className = 'directory-symbol'; symbol.textContent = '📁';
        const title = document.createElement('span'); title.textContent = name;
        const count = document.createElement('small'); count.textContent = ids.size + ' files';
        b.append(symbol,title,count); b.onclick = () => { trail.push(name); draw(); };
        listing.append(b);
      }
    } else {
      for (const row of subset) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'directory-entry';
        const symbol = document.createElement('span'); symbol.className = 'directory-symbol'; symbol.textContent = '📊';
        const title = document.createElement('span'); title.textContent = row.title;
        const meta = document.createElement('small'); meta.textContent = row.format || 'PowerPoint';
        b.append(symbol,title,meta); b.onclick = () => openResource(row);
        listing.append(b);
      }
    }
  }
  draw();
}
