import { catalog, arr, json, safeHTML, bankFile } from './practice-question-source.mjs?v=images-1';
import { worksheetDocument } from './worksheet-document.mjs?v=images-1';

const $ = id => document.getElementById(id);
const collator = new Intl.Collator('en-AU', { numeric: true });

const topics = row => [...arr(row.topics), ...arr(row.subtopics)];
const units = row => arr(row.units).filter(unit => unit && unit !== 'Lower school');
const scopes = row => units(row).length
  ? units(row).map(unit => 'Unit ' + unit)
  : (arr(row.topics).filter(Boolean).length ? arr(row.topics).filter(Boolean) : ['General']);
const dimensions = {
  type: row => arr(row.types),
  marks: row => Number.isFinite(Number(row.marks)) && row.marks != null ? [String(row.marks)] : [],
  band: row => arr(row.difficulty || row.bandLabel || row.band).map(String),
  outcome: topics,
};
const filters = Object.fromEntries(Object.keys(dimensions).map(key => [key, ""]));
const scope = { subject: '', year: '', unit: '' };
const selections = new Map();
let rows = [];
let loading = false;
let generating = false;
let unavailable = [];

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

function sectionName(row) {
  return row.section || row.sourceSection || arr(row.types).join(' / ') || 'Questions';
}

function grouped(items, key) {
  const groups = new Map();
  for (const row of items) {
    const name = key(row);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  return groups;
}

function scopedRows() {
  return rows.filter(row => row.subject === scope.subject && String(row.year) === scope.year && scopes(row).includes(scope.unit));
}

function updateCount() {
  const count = selections.size;
  $('selection-count').replaceChildren(el('span', 'n', String(count)), ' item' + (count === 1 ? '' : 's') + ' selected');
  $('generate-btn').disabled = $('download-word').disabled = !count || generating;
}

function status(message) {
  $('builder-content').replaceChildren(el('div', 'gen-status', message));
}

function setScope(key, value) {
  scope[key] = value;
  if (key === 'subject') scope.year = '';
  if (key !== 'unit') scope.unit = '';
  for (const name of Object.keys(filters)) filters[name] = '';
  render();
}

function questionCounts(pool, read) {
  const counts = new Map();
  for (const row of pool) {
    for (const value of new Set(read(row))) {
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return counts;
}

function renderDropdown(id, counts, selected, placeholder, label = value => value) {
  const select = $(id);
  const values = [...counts.keys()].sort(collator.compare);
  select.replaceChildren(new Option(placeholder, ''), ...values.map(value =>
    new Option(label(value) + ' (' + counts.get(value).toLocaleString('en-AU') + ')', value)));
  select.value = counts.has(selected) ? selected : '';
  select.disabled = !values.length;
}

function matchesFilters(row, except) {
  return Object.entries(dimensions).every(([key, read]) =>
    key === except || !filters[key] || read(row).includes(filters[key]));
}

function renderFilters(pool) {
  const placeholders = { type: 'All types', marks: 'All marks', band: 'All difficulties', outcome: 'All topics' };
  for (const [key, read] of Object.entries(dimensions)) {
    const eligible = pool.filter(row => matchesFilters(row, key));
    const counts = questionCounts(pool, read);
    const eligibleCounts = questionCounts(eligible, read);
    for (const value of counts.keys()) counts.set(value, eligibleCounts.get(value) || 0);
    const placeholder = placeholders[key] + ' (' + eligible.length.toLocaleString('en-AU') + ')';
    renderDropdown('filter-' + key, counts, filters[key], placeholder, value =>
      key === 'marks' ? value + (value === '1' ? ' mark' : ' marks') : value);
  }
}

function sourceTitle(row) {
  return row.source || 'Practice Studio';
}

function renderSection(name, items) {
  const section = el('div', 'gen-section');
  const title = el('label', 'gen-section-title');
  const selectAll = el('input', 'gen-checkbox');
  selectAll.type = 'checkbox';
  title.append(selectAll, name, el('span', 'sub', '(' + items.length + ' q' + (items.length === 1 ? '' : 's') + ')'));
  const list = el('div', 'gen-q-list');
  const boxes = [];
  function sync() {
    const selected = boxes.filter(box => box.checked).length;
    selectAll.checked = selected === boxes.length;
    selectAll.indeterminate = selected > 0 && selected < boxes.length;
    updateCount();
  }
  items.forEach(row => {
    const label = el('label', 'gen-q');
    const checkbox = el('input', 'gen-checkbox');
    checkbox.type = 'checkbox';
    checkbox.checked = selections.has(row.id);
    const badges = el('span', 'gen-q-badges');
    if (row.marks != null) badges.append(el('span', 'gen-badge marks', row.marks + 'm'));
    if (row.difficulty) badges.append(el('span', 'gen-badge band', row.difficulty));
    label.append(checkbox, el('span', 'gen-q-num', row.sourceQuestionLabel || row.number || 'Q'),
      el('span', 'gen-q-text', row.text || 'Question ' + (row.number || '')), badges);
    checkbox.onchange = () => {
      if (checkbox.checked) selections.set(row.id, row);
      else selections.delete(row.id);
      sync();
    };
    boxes.push(checkbox);
    list.append(label);
  });
  selectAll.onchange = () => {
    items.forEach((row, index) => {
      boxes[index].checked = selectAll.checked;
      if (selectAll.checked) selections.set(row.id, row);
      else selections.delete(row.id);
    });
    sync();
  };
  sync();
  section.append(title, list);
  return section;
}

function renderQuestions() {
  const ready = Boolean(scope.subject && scope.year && scope.unit);
  const pool = ready ? scopedRows() : [];
  $('builder-filters').hidden = !pool.length;
  $('builder-options').hidden = !ready && !selections.size;
  const tree = $('builder-tree-wrap');
  tree.replaceChildren();
  tree.hidden = true;
  updateCount();
  if (!ready) {
    status(scope.subject ? 'Choose a year and unit or topic to list the questions you can select.' : 'Pick a subject above to start building.');
    return;
  }

  renderFilters(pool);
  const visible = pool.filter(row => matchesFilters(row));
  if (!visible.length) {
    status('No questions match the active filters. Your selections are still available.');
    return;
  }

  status('Filters hide questions without clearing your selection. A section checkbox selects only the questions currently shown.');
  for (const [source, members] of grouped(visible, sourceTitle)) {
    const sourceGroup = el('div', 'gen-tree-lesson');
    sourceGroup.append(el('div', 'gen-tree-lesson-title', source));
    const block = el('div', 'gen-ws');
    for (const [name, questions] of grouped(members, sectionName)) block.append(renderSection(name, questions));
    sourceGroup.append(block);
    tree.append(sourceGroup);
  }
  tree.hidden = false;
}

function render() {
  $('hero-badge-count').textContent = loading ? 'Loading…' : rows.length.toLocaleString('en-AU') + ' questions';
  renderDropdown('scope-subject', questionCounts(rows, row => [row.subject]), scope.subject, 'Choose a subject');
  const subjectRows = rows.filter(row => row.subject === scope.subject);
  const years = questionCounts(subjectRows, row => row.year == null ? [] : [String(row.year)]);
  renderDropdown('scope-year', years, scope.year, 'Choose a year', value => 'Year ' + value);
  const units = questionCounts(subjectRows.filter(row => String(row.year) === scope.year), scopes);
  renderDropdown('scope-unit', units, scope.unit, 'Choose a unit or topic');
  renderQuestions();
  if (loading) status('Loading the Practice Studio question bank…');
  const support = $('builder-support');
  support.replaceChildren();
  if (unavailable.length) {
    const retry = el('button', '', 'Retry');
    retry.type = 'button';
    retry.onclick = load;
    support.append(unavailable.length + ' question indices could not load. ', retry);
  }
}

async function load() {
  if (loading) return;
  if (!catalog?.indices?.length) {
    status('The Practice Studio catalogue could not load. Refresh the page to retry.');
    return;
  }
  loading = true;
  unavailable = [];
  render();
  const results = await Promise.allSettled(catalog.indices.map(json));
  const ids = new Set();
  const hashes = new Set();
  rows = results.flatMap((result, index) => {
    if (result.status !== 'fulfilled' || !Array.isArray(result.value)) {
      unavailable.push(catalog.indices[index]);
      return [];
    }
    return result.value.flatMap(raw => {
      const row = catalog.normalise(raw);
      if (!row.id || ids.has(row.id) || (row.hash && hashes.has(row.hash))) return [];
      ids.add(row.id);
      if (row.hash) hashes.add(row.hash);
      return [row];
    });
  });
  loading = false;
  render();
}

async function generate(format) {
  const chosen = rows.filter(row => selections.has(row.id));
  if (!chosen.length || generating) return;
  const preview = format === 'print' ? window.open('', '_blank') : null;
  if (format === 'print' && !preview) {
    status('Allow pop-ups for Science Vault to open the worksheet preview.');
    return;
  }
  if (preview) {
    preview.opener = null;
    preview.document.title = 'Preparing your worksheet';
    preview.document.body.textContent = 'Loading full questions and preparing the worksheet…';
  }
  generating = true;
  updateCount();
  try {
    const picks = await Promise.all(chosen.map(async row => {
      const bank = await json(bankFile(row));
      const question = bank.find(item => item.id === row.id);
      if (!question) throw new Error('Question missing from its source bank: ' + sourceTitle(row) + ', Q' + row.number);
      return { row, question };
    }));
    if (preview?.closed) return;
    const markup = worksheetDocument(picks, {
      space: $('opt-answer-space').checked,
      key: $('opt-answer-key').checked,
    }, { safeHTML, sourceTitle, sectionName, grouped, scopes });
    if (preview) {
      const url = URL.createObjectURL(new Blob([markup], { type: 'text/html' }));
      preview.location.replace(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      const { wordWorksheet } = await import('./worksheet-word.mjs?v=1');
      const file = await wordWorksheet(markup);
      const url = URL.createObjectURL(file);
      const download = el('a');
      download.href = url;
      download.download = 'Science_Vault_Worksheet.docx';
      document.body.append(download);
      download.click();
      download.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  } catch (error) {
    if (preview && !preview.closed) preview.close();
    status('Could not generate the worksheet. ' + error.message + ' Your selected questions are still available.');
  } finally {
    generating = false;
    updateCount();
  }
}

for (const key of Object.keys(scope)) {
  $('scope-' + key).onchange = event => setScope(key, event.target.value);
}
for (const key of Object.keys(filters)) {
  $('filter-' + key).onchange = event => {
    filters[key] = event.target.value;
    renderQuestions();
  };
}
$('generate-btn').onclick = () => generate('print');
$('download-word').onclick = () => generate('word');
load();
