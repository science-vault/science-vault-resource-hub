export const base = 'https://science-vault.github.io/science-vault-wa/';
export const catalog = window.PracticeStudioCatalog;
const cache = new Map();
export const arr=v=>Array.isArray(v)?v:v==null||v===''?[]:[v];
export async function json(file){if(!/^practice-studio-[a-z0-9-]+\.json$/.test(file))throw Error('Invalid bank path');if(!cache.has(file))cache.set(file,fetch(base+file,{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).catch(e=>{cache.delete(file);throw e}));return cache.get(file)}

export function questionImageSource(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  // Practice Studio embeds scanned diagrams as raster data URLs.
  if (/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)) {
    return value;
  }
  try {
    const url = new URL(value, base);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {}
  return null;
}


export function imageCrop(img) {
  const raw = img.getAttribute('data-studio-crop');
  if (!/^\d{1,5}(?:,\d{1,5}){3}$/.test(raw || '')) return null;
  const [x, y, width, height] = raw.split(',').map(Number);
  const sourceWidth = Number(img.getAttribute('width'));
  const sourceHeight = Number(img.getAttribute('height'));
  if (!width || !height || !Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight) ||
      x + width > sourceWidth || y + height > sourceHeight) return null;
  return { x, y, width, height, sourceWidth, sourceHeight };
}

function croppedImage(original, image, crop) {
  const inline = original.parentElement?.tagName === 'SPAN';
  const frame = document.createElement('span');
  const { x, y, width, height, sourceWidth, sourceHeight } = crop;
  const displayWidth = Math.min(inline ? 300 : 530, Math.max(28, Math.round(width * (inline ? 0.18 : 0.32))));
  Object.assign(frame.style, {
    display: inline ? 'inline-block' : 'block', position: 'relative', overflow: 'hidden',
    width: displayWidth + 'px', maxWidth: '100%', aspectRatio: width + ' / ' + height,
    verticalAlign: 'middle', margin: inline ? '0' : '0 auto',
  });
  Object.assign(image.style, {
    position: 'absolute', left: (-100 * x / width) + '%', top: (-100 * y / height) + '%',
    width: (100 * sourceWidth / width) + '%', height: 'auto', maxWidth: 'none', maxHeight: 'none', margin: '0',
  });
  image.setAttribute('data-studio-crop', [x, y, width, height].join(','));
  image.setAttribute('data-display-width', String(displayWidth));
  image.width = sourceWidth;
  image.height = sourceHeight;
  frame.append(image);
  return frame;
}

export function safeHTML(target,html){const doc=new DOMParser().parseFromString(String(html||''),'text/html');const allowed=new Set('P DIV SPAN BR STRONG B EM I U SUB SUP OL UL LI TABLE THEAD TBODY TR TH TD CAPTION FIGURE FIGCAPTION IMG H1 H2 H3 H4 H5 H6 PRE CODE BLOCKQUOTE HR MATH MROW MI MN MO MFRAC MSUP MSUB MSUBSUP MSQRT MTEXT MTABLE MTR MTD'.split(' '));function copy(n){if(n.nodeType===3)return document.createTextNode(n.textContent);if(n.nodeType!==1)return document.createDocumentFragment();const tag=n.tagName.toUpperCase();if(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED'].includes(tag))return document.createDocumentFragment();const e=allowed.has(tag)?(n.namespaceURI==='http://www.w3.org/1998/Math/MathML'?document.createElementNS(n.namespaceURI,n.localName):document.createElement(n.localName)):document.createDocumentFragment();if(tag==='IMG'){const source=questionImageSource(n.getAttribute('src'));if(!source)return document.createTextNode(n.getAttribute('alt')||'');e.src=source;e.alt=n.getAttribute('alt')||'Question diagram';e.loading='lazy';const crop=imageCrop(n);if(crop)return croppedImage(n,e,crop);const width=n.getAttribute('width');if(/^\d{1,5}$/.test(width||'')&&Number(width)>0)e.width=Number(width)}for(const k of ['colspan','rowspan'])if(['TD','TH'].includes(tag)&&/^\d+$/.test(n.getAttribute(k)||''))e.setAttribute(k,n.getAttribute(k));for(const child of n.childNodes)e.append(copy(child));return e}target.replaceChildren(...Array.from(doc.body.childNodes,copy))}

export function bankFile(m){return m.bankFile||'practice-studio-'+(m.subject==='Human Biology'?'human-biology':m.subject.toLowerCase())+'-'+m.examYear+'-u'+String(m.units).replace(/\D/g,'')+'.json'}
