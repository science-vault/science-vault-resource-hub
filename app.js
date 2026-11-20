'use strict';

const collections = {
  all: ['All resources', ''],
  assessments: ['Assessments', 'school-resource-library'],
  exams: ['Exams', 'exam-library'],
  textbooks: ['Textbooks', 'textbook-library'],
  videos: ['Videos', 'video-library'],
  worksheets: ['Worksheets', 'worksheet-vault'],
};
const filters = ['year', 'subject', 'strand', 'topic'];
const labels = ['All years', 'All subjects', 'All strands', 'All topics'];
const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('en-AU');
const collator = new Intl.Collator('en-AU', { numeric: true, sensitivity: 'base' });
const pageSize = 24;
const collectionIcons = { all: '▦', assessments: '▤', exams: '▣', textbooks: '▥', videos: '▷', worksheets: '▧' };
const collectionCounts = new Map();
const rows = [];
const failures = [];
let pending = Object.keys(collections).length - 1;
let selected = 'all';
let page = 1;

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

function values(row, field) {
  if (field === 'year') return row.years;
  if (field === 'subject') return [row.subject, row.area].filter(Boolean);
  return row[field] ? [row[field]] : [];
}

function matching(pool, field) {
  const value = $(field).value;
  return value ? pool.filter(row => values(row, field).includes(value)) : pool;
}

function render() {
  let pool = rows.filter(row => selected === 'all' || selected === row.kind);
  filters.forEach((field, index) => {
    const menu = $(field);
    const old = menu.value;
    const options = [...new Set(pool.flatMap(row => values(row, field)))].sort(collator.compare);
    menu.replaceChildren(new Option(labels[index], ''), ...options.map(value =>
      new Option(field === 'year' && /^\d+$/.test(value) ? 'Year ' + value : value, value)));
    if (options.includes(old)) menu.value = old;
    pool = matching(pool, field);
  });
  const terms = $('query').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length) pool = pool.filter(row => terms.every(term => row.search.includes(term)));
  pool.sort((a,b) => ($('sort').value === 'newest' ? (Date.parse(b.added) || 0) - (Date.parse(a.added) || 0) : 0)
    || collator.compare(a.title, b.title));
  const totalPages = Math.max(1, Math.ceil(pool.length / pageSize));
  page = Math.min(page, totalPages);
  const start = (page - 1) * pageSize;
  const shown = pool.slice(start, start + pageSize);
  $('status').textContent = (pool.length
    ? number.format(start + 1) + '–' + number.format(start + shown.length) + ' of ' + number.format(pool.length) + ' resources'
    : pending ? 'Loading catalogue…' : 'No resources match these filters.')
    + (pending && pool.length ? ' · Loading more…' : '')
    + (failures.length ? ' · Unavailable: ' + failures.join(', ') : '');
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
  for (const related of row.related) $('actions').append(link(related.title, related.href));
  action.onclick();
  $('detail').showModal();
}

$('detail').addEventListener('close', () => $('preview').replaceChildren());
for (const [kind, [title, repo]] of Object.entries(collections)) {
  const button = element('button', '', 'collection-tab');
  button.dataset.kind = kind;
  const icon = element('span', collectionIcons[kind], 'collection-icon');
  icon.setAttribute('aria-hidden', 'true');
  const caption = element('span', '', 'collection-caption');
  const count = element('span', 'Loading…', 'collection-count');
  caption.append(element('strong', title), count);
  button.append(icon, caption);
  collectionCounts.set(kind, count);
  button.type = 'button';
  button.setAttribute('aria-pressed', String(kind === 'all'));
  button.onclick = () => {
    selected = kind;
    for (const item of $('collections').children) item.setAttribute('aria-pressed', String(item === button));
    for (const filter of filters) $(filter).value = '';
    page = 1;
    render();
  };
  $('collections').append(button);
  if (!repo) continue;
  $('sources').append(link(repo === 'exam-library' ? 'Exam Library' : repo === 'school-resource-library' ? 'School Assessment Library' : title, 'https://science-vault.github.io/' + repo + '/'));
  fetch(kind + '.json').then(response => {
    if (!response.ok) throw Error('Catalogue unavailable');
    return response.json();
  }).then(resources => {
    count.textContent = number.format(resources.length) + ' resources';
    for (const row of resources) {
      row.kind = kind;
      row.search = [row.title, ...metadata(row), row.area, row.publisher, row.description,
        row.format, row.role, ...(row.keywords || [])].filter(Boolean).join(' ').toLowerCase();
      rows.push(row);
    }
  }).catch(() => {
    count.textContent = 'Unavailable';
    failures.push(title);
  }).finally(() => {
    pending -= 1;
    if (!pending) collectionCounts.get('all').textContent = number.format(rows.length) + ' resources';
    render();
  });
}
for (const id of ['query', ...filters, 'sort']) $(id).addEventListener(id === 'query' ? 'input' : 'change', () => {
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
