import { assessmentDirectory } from './assessment-directory.mjs?v=1';
import { directoryView } from './powerpoint-directory.mjs?v=resource-tree-4';
import { getSourceUrl, normalizeCatalogue } from './live-catalogue.mjs?v=powerpoints-1';
'use strict';

const collections = {
  assessments: ['Assessments', 'school-resource-library'],
  exams: ['Exams', 'exam-library'],
  textbooks: ['Textbooks', 'textbook-library'],
  powerpoints: ['PowerPoints', 'powerpoint-library'],
  videos: ['Videos', 'video-library'],
  worksheets: ['Worksheets', 'worksheet-vault'],
};
const filters = [...document.querySelectorAll('.filters select')].map(menu => menu.id);
const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('en-AU');
const collator = new Intl.Collator('en-AU', { numeric: true, sensitivity: 'base' });
const collectionIcons = { all: '▦', assessments: '▤', exams: '▣', textbooks: '▥', powerpoints: '▰', videos: '▷', worksheets: '▧' };
const rows = [];
const selected = document.body.dataset.collection;
let pending = Boolean(selected);
let loadNotice = '';
let page = 1;
let powerpointView = 'grid';
let assessmentView = 'grid';

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value) node.textContent = value;
  if (className) node.className = className;
  return node;
}

function link(label, url) {
  const anchor = element('a', label);
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
}

const optionLabels = {
  curriculum: 'SCSA curriculum topics', extra: 'Extra Worksheets', unspecified: 'Year not specified',
  answers: 'With answers / marking key', support: 'With supporting resources', unlinked: 'Unlinked answer files',
};

function values(row, field) {
  if (field === 'year') return row.years.length || row.kind !== 'assessments' ? row.years : ['unspecified'];
  if (field === 'school') return [row.school || row.publisher].filter(Boolean);
  if (field === 'collection') return [row.collection || 'curriculum'];
  if (field === 'resourceTypes') return row.resourceTypes || [row.format || 'Worksheet'];
  if (field === 'fileFormats') return row.fileFormats || [row.format].filter(Boolean);
  if (field === 'materials') {
    return [
      (row.answer || row.integratedAnswers) && !row.unlinkedAnswer && 'answers',
      row.supportCount && row.related?.length && 'support',
      (row.unlinkedAnswer || row.role === 'Answers / marking key') && 'unlinked',
    ].filter(Boolean);
  }
  const value = row[field];
  return (Array.isArray(value) ? value : [value]).filter(value => value != null && value !== '').map(String);
}

function yearOrder(row) {
  return Number.parseInt(row.years[0], 10) || 99;
}

function compareRows(a, b, sort) {
  if (sort === 'newest') return (Date.parse(b.added) || 0) - (Date.parse(a.added) || 0);
  if (sort === 'school') return collator.compare(a.school || a.publisher || '', b.school || b.publisher || '');
  if (sort === 'year') return yearOrder(a) - yearOrder(b);
  if (sort === 'curriculum') return Number(a.collection === 'extra') - Number(b.collection === 'extra')
    || yearOrder(a) - yearOrder(b) || collator.compare(a.strand || '', b.strand || '');
  return 0;
}

function matching(pool, field) {
  const value = $(field).value;
  return value ? pool.filter(row => values(row, field).includes(value)) : pool;
}

function render() {
  let pool = rows.slice();
  filters.forEach(field => {
    const menu = $(field);
    const old = menu.value;
    const options = [...new Set(pool.flatMap(row => values(row, field)))].sort(collator.compare);
    menu.replaceChildren(new Option(menu.dataset.all, ''), ...options.map(value =>
      new Option(field === 'year' && /^\d+$/.test(value) ? 'Year ' + value : optionLabels[value] || value, value)));
    if (options.includes(old)) menu.value = old;
    pool = matching(pool, field);
  });
  const terms = $('query').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length) pool = pool.filter(row => terms.every(term => row.search.includes(term)));
  const sort = $('sort').value;
  pool.sort((a, b) => compareRows(a, b, sort) || collator.compare(a.title, b.title));
  const pageSize = Number($('pageSize')?.value) || 24;
  const totalPages = Math.max(1, Math.ceil(pool.length / pageSize));
  page = Math.min(page, totalPages);
  const start = (page - 1) * pageSize;
  const shown = pool.slice(start, start + pageSize);
  $('status').textContent = (pool.length
    ? number.format(start + 1) + '–' + number.format(start + shown.length) + ' of ' + number.format(pool.length) + ' resources'
    : pending ? 'Loading catalogue…' : 'No resources match these filters.')
    + (pending && pool.length ? ' · Loading more…' : '')
    + (loadNotice ? ' · ' + loadNotice : '');
  if (selected === 'assessments' && assessmentView === 'directory') {
    assessmentDirectory(pool, $('results'), open);
    $('status').textContent = number.format(pool.length) + ' assessments in directory' + (pending ? ' · Loading more…' : '');
    $('pages').replaceChildren();
    return;
  }
  if (selected === 'powerpoints' && powerpointView === 'directory') {
    directoryView(pool, $('results'), open);
    $('status').textContent = number.format(pool.length) + ' PowerPoints in directory' + (pending ? ' · Loading more…' : '');
    $('pages').replaceChildren();
    return;
  }
  $('results').replaceChildren(...shown.map(card));
  $('pages').replaceChildren();
  if (totalPages > 1) {
    const previous = element('button', 'Previous');
    const next = element('button', 'Next');
    previous.disabled = page === 1;
    next.disabled = page === totalPages;
    const move = offset => {
      page += offset;
      render();
      $('status').scrollIntoView({ block: 'start' });
      $('pages').querySelector(offset > 0 ? 'button:last-child:not(:disabled)' : 'button:first-child:not(:disabled)')?.focus({ preventScroll: true });
    };
    previous.onclick = () => move(-1);
    next.onclick = () => move(1);
    $('pages').append(previous, element('span', 'Page ' + page + ' of ' + totalPages), next);
  }
}

function metadata(row) {
  const years = row.years.length ? row.years.map(year => /^\d+$/.test(year) ? 'Year ' + year : year).join(', ') : '';
  return [row.subject, years, row.strand, row.topic, row.pathway, row.unit, row.examYear].filter(Boolean);
}

function card(row) {
  const article = element('article', '', 'card');
  article.dataset.kind = row.kind;
  const tile = element('div', '', 'tile');
  tile.append(element('span', collectionIcons[row.kind], 'tile-icon'));
  tile.append(element('span', row.format || collections[row.kind][0], 'tile-format'));
  tile.setAttribute('aria-hidden', 'true');
  if (row.thumbnail) {
    const image = element('img');
    image.alt = '';
    image.loading = 'lazy';
    image.onerror = () => image.remove();
    image.src = row.thumbnail;
    tile.prepend(image);
    image.addEventListener('load', () => tile.classList.add('has-image'), { once: true });
  }
  const body = element('div', '', 'card-body');
  const action = element('button', row.kind === 'videos' ? 'Watch' : 'Preview');
  action.setAttribute('aria-label', action.textContent + ' ' + row.title);
  action.onclick = () => open(row);
  body.append(element('span', collections[row.kind][0], 'card-category'), element('h3', row.title), element('p', metadata(row).slice(0, 4).join(' · '), 'meta'));
  if (row.answer) body.append(element('p', ['assessments', 'exams'].includes(row.kind) ? 'Marking key included' : 'Answer key included', 'meta'));
  if (row.integratedAnswers && !row.answer) body.append(element('p', 'Answers in document', 'meta'));
  if (row.supportCount) body.append(element('p', number.format(row.supportCount) + (row.supportCount === 1 ? ' supporting file' : ' supporting files'), 'meta'));
  body.append(action);
  article.append(tile, body);
  return article;
}

function preview(file, provided, title, isVideo) {
  const mediaUrl = new URL(file);
  const box = $('preview');
  box.replaceChildren();
  if (isVideo && /\.(mp4|webm|ogv)$/i.test(mediaUrl.pathname)) {
    const video = element('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.poster = '';
    video.onerror = () => box.append(element('p', 'Playback is unavailable here. Use Open original to access the video.'));
    video.src = file;
    box.append(video);
    return;
  }
  let frameUrl = provided;
  if (mediaUrl.hostname === 'youtu.be' || ['www.youtube.com', 'youtube.com'].includes(mediaUrl.hostname)) {
    const id = mediaUrl.searchParams.get('v') || mediaUrl.pathname.split('/').pop();
    if (/^[\w-]{11}$/.test(id)) frameUrl = 'https://www.youtube-nocookie.com/embed/' + id;
  } else if (['vimeo.com', 'www.vimeo.com'].includes(mediaUrl.hostname)) {
    const id = mediaUrl.pathname.split('/').filter(Boolean).pop();
    if (/^\d+$/.test(id)) frameUrl = 'https://player.vimeo.com/video/' + id;
  }
  if (!frameUrl && /\.pdf$/i.test(mediaUrl.pathname)) frameUrl = file;
  if (!frameUrl && /\.(docx?|pptx?|xlsx?)$/i.test(mediaUrl.pathname)) {
    frameUrl = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(file);
  }
  if (!frameUrl) {
    box.append(element('p', 'Use Open original to view this resource.'));
    return;
  }
  const frame = element('iframe');
  frame.title = title;
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.src = frameUrl;
  box.append(frame);
}

function open(row) {
  $('detail-title').textContent = row.title;
  $('detail-meta').textContent = [...metadata(row), row.role, row.publisher].filter(Boolean).join(' · ');
  const action = element('button', 'Preview resource');
  action.onclick = () => preview(row.file, row.preview, row.title, row.kind === 'videos');
  $('actions').replaceChildren(link('Open original', row.file));
  if (row.answer) {
    const name = ['assessments', 'exams'].includes(row.kind) ? 'marking key' : 'answer key';
    const key = element('button', 'Preview ' + name);
    key.onclick = () => preview(row.answer, row.answerPreview, name, false);
    $('actions').append(action, key, link('Open ' + name, row.answer));
  }
  const files = $('related-files');
  files.replaceChildren();
  files.hidden = !row.related.length;
  if (row.related.length) {
    files.append(element('h3', 'Related documents'));
    const list = element('ul');
    for (const related of row.related) {
      const item = element('li');
      const show = element('button', 'Preview');
      show.setAttribute('aria-label', 'Preview ' + related.title);
      show.onclick = () => preview(related.href, related.preview, related.title, false);
      item.append(link(related.title, related.href), ' ', show);
      list.append(item);
    }
    files.append(list);
    if (!row.answer) $('actions').append(action);
  }
  action.onclick();
  $('detail').showModal();
}

for (const [kind, [title, repo]] of Object.entries(collections)) {
  const tab = element('a', '', 'collection-tab');
  tab.href = kind + '.html';
  tab.dataset.kind = kind;
  if (kind === selected) tab.setAttribute('aria-current', 'page');
  const icon = element('span', collectionIcons[kind], 'collection-icon');
  icon.setAttribute('aria-hidden', 'true');
  tab.append(icon, element('strong', title, 'collection-caption'));
  $('collections').append(tab);
  $('sources').append(link(title, 'https://science-vault.github.io/' + repo + '/'));
}

const questionTab = element('a', '', 'collection-tab');
questionTab.href = 'questions.html';
questionTab.dataset.kind = 'questions';
const questionIcon = element('span', '▥', 'collection-icon');
questionIcon.setAttribute('aria-hidden', 'true');
questionTab.append(questionIcon, element('strong', 'Question Database', 'collection-caption'));
$('collections').append(questionTab);

async function updateCollectionCounts() {
  const tabs = [...document.querySelectorAll('#collections .collection-tab')];
  await Promise.allSettled(tabs.map(async tab => {
    const kind = tab.dataset.kind;
    const caption = tab.querySelector('.collection-caption');
    const count = element('small', 'Loading count…');
    count.style.cssText = 'display:block;font-weight:400;font-size:12px;margin-top:4px;color:inherit';
    caption.append(count);
    try {
      let total;
      if (kind === 'questions') {
        const base = 'https://science-vault.github.io/science-vault-wa/';
        if (!window.PracticeStudioCatalog) await new Promise((resolve,reject)=>{
          const script=document.createElement('script');script.src=base+'practice-studio-catalog.js';script.onload=resolve;script.onerror=reject;document.head.append(script);
        });
        const results=await Promise.allSettled(window.PracticeStudioCatalog.indices.map(file=>fetchCatalogue(base+file)));
        const ids=new Set();let missing=0;
        for(const result of results){
          if(result.status!=='fulfilled'){missing++;continue;}
          const data=result.value;
          const items=Array.isArray(data)?data:data.questions||data.items||data.entries;
          if(!Array.isArray(items)){missing++;continue;}
          for(const q of items) ids.add(q.id||q.hash||JSON.stringify(q));
        }
        if(missing===results.length) throw Error('Question indices unavailable');
        total=ids.size;
        count.textContent=number.format(total)+(missing?' loaded questions (partial)':' questions');
      } else {
        total=normalizeCatalogue(kind,await fetchCatalogue(getSourceUrl(kind))).length;
        count.textContent=number.format(total)+' resources';
      }
    } catch(error){count.textContent='Count unavailable';console.warn(kind,error);}
  }));
}
if (!selected) updateCollectionCounts();

async function fetchCatalogue(url) {
  const response = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw Error('Catalogue returned HTTP ' + response.status);
  return response.json();
}

async function loadCatalogue() {
  try {
    let resources;
    try {
      const catalogue = await fetchCatalogue(getSourceUrl(selected));
      if (selected === 'worksheets') {
        try {
          const placements = await fetchCatalogue('https://science-vault.github.io/worksheet-vault/catalogue/year-placement-overrides.json');
          for (const item of catalogue) {
            const placement = placements[String(item.id || '').replace(/^github:/, '')];
            if (!placement) continue;
            item.keywords = [...new Set([...(item.keywords || []), item.topic, item.supportingTopic, item.strand,
              ...(placement.keywords || [])].filter(Boolean))];
            for (const field of ['year', 'years', 'collection', 'topic', 'supportingTopic', 'strand', 'classificationNote']) {
              if (field in placement) item[field] = placement[field];
            }
          }
        } catch (error) { console.warn('Reviewed worksheet placements unavailable:', error); }
      }
      resources = normalizeCatalogue(selected, catalogue);
    } catch (error) {
      console.warn('Live catalogue unavailable:', error);
      if (selected === 'powerpoints') {
        loadNotice = 'PowerPoint Library unavailable. Try the Resource Hub backup below';
        $('sources').prepend(link('PowerPoints backup', 'https://science-vault-resource-hub.jjdcruz27.chatgpt.site/powerpoints.html'));
        return;
      }
      resources = await fetchCatalogue(selected + '.json');
      if (!Array.isArray(resources)) throw Error('Invalid backup catalogue');
      loadNotice = 'Showing a saved copy because the live collection is unavailable';
    }
    for (const row of resources) {
      row.kind = selected;
      row.search = [row.title, ...metadata(row), row.area, row.publisher, row.description,
        row.format, row.role, ...(row.keywords || []), row.searchText].filter(Boolean).join(' ').toLowerCase();
      rows.push(row);
    }
  } catch (error) {
    loadNotice = 'Catalogue unavailable. Refresh to try again';
    console.warn(error);
  } finally {
    pending = false;
    render();
  }
}

if (selected) {
if (selected === 'assessments') {
  $('viewMode').addEventListener('change', event => { assessmentView = event.target.value; render(); });
}
if (selected === 'powerpoints') {
  $('viewMode').addEventListener('change', event => {
    powerpointView = event.target.value;
    render();
  });
}
$('detail').addEventListener('close', () => $('preview').replaceChildren());
for (const id of ['query', ...filters, 'sort', ...($('pageSize') ? ['pageSize'] : [])]) $(id).addEventListener(id === 'query' ? 'input' : 'change', () => {
  page = 1;
  render();
});
document.addEventListener('keydown', event => {
  if (event.key !== '/' || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented ||
      event.target.closest('input, select, textarea, [contenteditable]') || $('detail').open) return;
  event.preventDefault();
  $('query').focus();
});
$('clear').onclick = () => {
  for (const id of ['query', ...filters]) $(id).value = '';
  page = 1;
  render();
};
render();
loadCatalogue();
}
