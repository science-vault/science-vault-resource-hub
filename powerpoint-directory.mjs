// Nested, resource-only repository tree for the PowerPoints catalogue.
// Files are sourced exclusively from catalogue records, never a repository source-code listing.
const collator = new Intl.Collator('en-AU', { numeric: true, sensitivity: 'base' });
const openFolders = new Set();
const allowed = /\.(?:ppt|pptx|pps|ppsx|pot|potx|pdf|doc|docx|xls|xlsx|odp|odt|ods|zip)$/i;
const excluded = /^(?:index\.html?|readme(?:\.md)?|package(?:-lock)?\.json|.*\.(?:js|mjs|cjs|css|html?|json|ya?ml|toml|ts|tsx|jsx|map|svg))$/i;
function partsFor(row) {
  try {
    const url = new URL(row.file);
    let parts = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    const repo = parts.indexOf('powerpoint-library');
    if (repo >= 0) {
      parts = parts.slice(repo + 1);
      if (['blob','raw'].includes(parts[0])) parts = parts.slice(2);
    }
    // Start the tree inside the repository's resources folder.
    const resourcesIndex = parts.indexOf('resources');
    if (resourcesIndex < 0) return null;
    parts = parts.slice(resourcesIndex + 1);
    // Never show the repository's site scripts or metadata in the resource browser.
    if (!parts.length || excluded.test(parts.at(-1)) || !allowed.test(parts.at(-1))) return null;
    return parts;
  } catch { return null; }
}
function make(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label !== undefined) node.textContent = label;
  return node;
}
function folderKey(parts) { return parts.join('/'); }
export function directoryView(rows, container, openResource) {
  const root = make('section','ppt-tree');
  root.setAttribute('aria-label','PowerPoint resource directory');
  const head = make('div','ppt-tree-heading');
  head.append(make('strong','', 'Resources'));
  const tree = make('div','ppt-tree-content');
  root.append(head,tree);
  container.replaceChildren(root);
  const top = {folders:new Map(),files:[]};
  let count = 0;
  for (const row of rows) {
    const parts = partsFor(row);
    if (!parts) continue;
    count++;
    let node = top;
    for (const folder of parts.slice(0,-1)) {
      if (!node.folders.has(folder)) node.folders.set(folder,{folders:new Map(),files:[]});
      node = node.folders.get(folder);
    }
    node.files.push({name:parts.at(-1),row});
  }
  head.append(make('span','ppt-tree-count',count.toLocaleString('en-AU')+' resources'));
  const empty = make('p','ppt-tree-empty','No presentation resources match the current filters.');
  if (!count) { tree.append(empty); return; }
  function drawNode(node, parent, path=[], depth=0) {
    const folders = [...node.folders.entries()].sort((a,b)=>collator.compare(a[0],b[0]));
    for (const [name,child] of folders) {
      const next = [...path,name], key=folderKey(next);
      const group = make('div','ppt-tree-group');
      const line = make('div','ppt-tree-line');
      line.style.setProperty('--tree-depth',depth);
      const toggle = make('button','ppt-tree-toggle');
      toggle.type='button';
      const expanded = openFolders.has(key);
      toggle.setAttribute('aria-expanded',String(expanded));
      toggle.setAttribute('aria-label',(expanded?'Collapse ':'Expand ')+name);
      toggle.append(make('span','ppt-tree-chevron',expanded?'▾':'▸'),make('span','ppt-tree-folder','📁'),make('span','ppt-tree-name',name));
      const children = make('div','ppt-tree-children');
      children.hidden = !expanded;
      toggle.onclick=()=>{
        if(openFolders.has(key))openFolders.delete(key);else openFolders.add(key);
        directoryView(rows,container,openResource);
      };
      line.append(toggle);
      group.append(line,children);
      parent.append(group);
      if(expanded) drawNode(child,children,next,depth+1);
    }
    for (const file of node.files.sort((a,b)=>collator.compare(a.name,b.name))) {
      const line = make('div','ppt-tree-line ppt-tree-file');
      line.style.setProperty('--tree-depth',depth);
      const icon=make('span','ppt-tree-file-icon','📄');
      const name=make('span','ppt-tree-filename',file.name);
      const preview=make('button','ppt-tree-action','Preview');
      preview.type='button';
      preview.setAttribute('aria-label','Preview '+file.name);
      preview.onclick=()=>openResource(file.row);
      const download=make('a','ppt-tree-download','↓');
      download.href=file.row.file;
      download.target='_blank';
      download.rel='noopener noreferrer';
      download.setAttribute('aria-label','Open or download '+file.name);
      download.title='Open or download original resource';
      line.append(icon,name,preview,download);
      parent.append(line);
    }
  }
  drawNode(top,tree);
}
