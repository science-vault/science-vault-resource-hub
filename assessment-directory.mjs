// Resource-only nested directory for assessment packs from the live catalogue.
const expanded = new Set();
const collator = new Intl.Collator('en-AU',{numeric:true,sensitivity:'base'});
const fileExtensions = /\.(pdf|docx?|pptx?|xlsx?|odt|ods|odp|zip)$/i;
function parts(row) {
  try {
    const url = new URL(row.file);
    let path = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    const repoIndex = path.indexOf('school-resource-library');
    if (repoIndex >= 0) path = path.slice(repoIndex+1);
    if (['blob','raw'].includes(path[0])) path = path.slice(2);
    const resourceIndex = path.findIndex(p=>['schools','assessments','resources'].includes(p.toLowerCase()));
    if(resourceIndex>=0) path=path.slice(resourceIndex+1);
    if(!path.length || !fileExtensions.test(path.at(-1))) return null;
    return path;
  }catch{return null;}
}
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
export function assessmentDirectory(rows,container,preview){
  const root=el('section','ppt-tree');
  root.setAttribute('aria-label','Assessment resource directory');
  const header=el('div','ppt-tree-heading');
  header.append(el('strong','','Assessment resources'));
  const content=el('div','ppt-tree-content');
  root.append(header,content);
  container.replaceChildren(root);
  const tree={dirs:new Map(),files:[]};
  let count=0;
  for(const row of rows){
    const segments=parts(row);if(!segments)continue;
    count++;
    let branch=tree;
    for(const folder of segments.slice(0,-1)){
      if(!branch.dirs.has(folder))branch.dirs.set(folder,{dirs:new Map(),files:[]});
      branch=branch.dirs.get(folder);
    }
    branch.files.push({name:segments.at(-1),row});
  }
  header.append(el('span','ppt-tree-count',count.toLocaleString('en-AU')+' assessment packs'));
  if(!count){content.append(el('p','ppt-tree-empty','No assessment resources match these filters.'));return;}
  function draw(node,parent,prefix='',depth=0){
    for(const [name,branch] of [...node.dirs].sort((a,b)=>collator.compare(a[0],b[0]))){
      const key=prefix+'/'+name, isOpen=expanded.has(key);
      const line=el('div','ppt-tree-line');
      line.style.setProperty('--tree-depth',depth);
      const button=el('button','ppt-tree-toggle');
      button.type='button';
      button.setAttribute('aria-expanded',String(isOpen));
      button.append(el('span','ppt-tree-chevron',isOpen?'▾':'▸'),el('span','ppt-tree-folder','📁'),el('span','ppt-tree-name',name));
      button.onclick=()=>{isOpen?expanded.delete(key):expanded.add(key);assessmentDirectory(rows,container,preview);};
      line.append(button);parent.append(line);
      if(isOpen)draw(branch,parent,key,depth+1);
    }
    for(const {name,row} of node.files.sort((a,b)=>collator.compare(a.name,b.name))){
      const line=el('div','ppt-tree-line ppt-tree-file');
      line.style.setProperty('--tree-depth',depth);
      line.append(el('span','ppt-tree-file-icon','📄'),el('span','ppt-tree-filename',name));
      const show=el('button','ppt-tree-action','Preview');show.type='button';show.onclick=()=>preview(row);
      const download=el('a','ppt-tree-download','↓');download.href=row.file;download.target='_blank';download.rel='noopener noreferrer';download.title='Open original assessment';download.setAttribute('aria-label','Open original '+name);
      line.append(show,download);
      if(row.answer){const key=el('button','ppt-tree-action','Marking key');key.type='button';key.onclick=()=>preview(row);line.append(key);}
      parent.append(line);
    }
  }
  draw(tree,content);
}
