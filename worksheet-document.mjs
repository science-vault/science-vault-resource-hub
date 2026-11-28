const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

const STYLE = new URL('./builder-worksheet-print.css?v=images-1', import.meta.url).href;
const FONTS = new URL('./builder-fonts.css', import.meta.url).href;
const PRINT = new URL('./builder-print.js?v=images-1', import.meta.url).href;
const KATEX = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';

export function rulesForMarks(marks) {
  const count = Math.max(1, Math.ceil(Number(marks) || 1));
  return [3, 5, 6, 8, 10, 12][count - 1] ?? 13;
}

function cleanHTML(value, safeHTML) {
  const node = document.createElement('div');
  safeHTML(node, value);
  for (const img of node.querySelectorAll('img')) img.loading = 'eager';
  return node.innerHTML;
}

function printableQuestion(question, safeHTML) {
  const body = question.html ? cleanHTML(question.html, safeHTML) : escape(question.text);
  const options = Array.isArray(question.options) ? question.options : [];
  if (!options.length) return body;
  return body + '<ol type="A">' + options.map((option, index) =>
    '<li>' + (question.optionsHtml?.[index] ? cleanHTML(question.optionsHtml[index], safeHTML) : escape(option)) + '</li>'
  ).join('') + '</ol>';
}

function printableAnswer(question, safeHTML) {
  const option = Number.isInteger(question.correctAnswer) && Array.isArray(question.options) &&
    question.correctAnswer >= 0 && question.correctAnswer < question.options.length
    ? '<p><strong>Correct option ' + String.fromCharCode(65 + question.correctAnswer) + '</strong></p>' : '';
  const working = question.answerHtml ? cleanHTML(question.answerHtml, safeHTML) : escape(question.answerText);
  return option + working || '<p>Answer guidance is unavailable for this question.</p>';
}

function courseLabel(picks, scopes) {
  const subjects = [...new Set(picks.map(({ row }) => row.subject))].join(' / ');
  const years = [...new Set(picks.map(({ row }) => row.year))].sort((a, b) => a - b).join(', ');
  const units = [...new Set(picks.flatMap(({ row }) => scopes(row)))];
  return [subjects, years && 'Year ' + years, units.length === 1 && units[0]].filter(Boolean).join(' · ');
}

export function worksheetDocument(picks, options, { safeHTML, sourceTitle, sectionName, grouped, scopes }) {
  const course = courseLabel(picks, scopes);
  const papers = grouped(picks.map(pick => ({ ...pick })), pick => sourceTitle(pick.row));
  const numbered = [...papers.values()].flatMap(items =>
    [...grouped(items, pick => sectionName(pick.row)).values()].flat());
  numbered.forEach((pick, index) => { pick.number = index + 1; });
  const total = picks.reduce((sum, { row }) => sum + (Number(row.marks) || 0), 0);
  const questions = [...papers].map(([source, items]) => {
    const sections = grouped(items, pick => sectionName(pick.row));
    return '<section class="lesson"><div class="lesson-head"><span class="lesson-kicker">Practice Studio</span>' +
      '<h2 class="lesson-name">' + escape(source) + '</h2></div>' +
      [...sections].map(([name, entries]) => '<div class="qgroup"><h3 class="qgroup-head"><span class="qg-name">' +
        escape(name) + '</span></h3>' + entries.map(({ row, question, number }) => {
          const marks = Number(row.marks) || 0;
          const rules = question.options?.length ? '' : '<div class="answer ruled">' +
            '<span class="rule"></span>'.repeat(rulesForMarks(marks)) + '</div>';
          return '<div class="q' + (marks >= 6 ? ' q-long' : '') + '"><div class="q-num">' + number + '</div>' +
            '<div class="q-body">' + printableQuestion(question, safeHTML) + rules + '</div>' +
            '<div class="q-marks">' + (marks ? '<span class="m">' + marks + '</span><span class="m-label">' +
              (marks === 1 ? 'mark' : 'marks') + '</span>' : '') + '</div></div>';
        }).join('') + '</div>').join('') + '</section>';
  }).join('');
  const key = options.key ? '<section class="answer-key"><div class="key-head"><p class="ws-course">' +
    escape(course) + '</p><h2 class="key-title">Answer Key &amp; Marking Guidelines</h2></div>' +
    numbered.map(({ row, question, number }) => '<div class="key-entry"><span class="key-ref">' + number +
      '</span><p class="key-lesson">' + escape(sourceTitle(row)) + ' · ' + escape(sectionName(row)) +
      '</p><div class="key-q">' + printableAnswer(question, safeHTML) + '</div></div>').join('') + '</section>' : '';

  return `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Custom Worksheet · Science Vault</title>
<link rel="stylesheet" href="${FONTS}"><link rel="stylesheet" href="${KATEX}katex.min.css" crossorigin="anonymous">
<link rel="stylesheet" href="${STYLE}"></head><body>
<div class="toolbar">
  <div class="tb-brand">Science Vault<small>Custom worksheet</small></div>
  <div class="tb-group"><span class="tb-label">Direction</span><div class="seg" id="dirSeg">
    <button type="button" data-theme="theme-a" class="active">Classic</button>
    <button type="button" data-theme="theme-b">Structured</button>
    <button type="button" data-theme="theme-c">Editorial</button>
  </div></div>
  <div class="tb-group">
    <label class="tgl"><input type="checkbox" id="tglSpace"${options.space ? ' checked' : ''}><span class="track"></span>Answer space</label>
    <label class="tgl"><input type="checkbox" id="tglKey"${options.key ? ' checked' : ' disabled'}><span class="track"></span>Answer key</label>
    ${options.key ? '' : '<small>To include an answer key, return to the builder and select it before generating.</small>'}
  </div>
  <div class="tb-spacer"></div><button type="button" class="tb-print" id="printWorksheet" disabled>Print / Save PDF</button>
</div>
<div class="sheet-wrap"><article class="worksheet theme-a${options.space ? ' show-space' : ''}${options.key ? ' show-key' : ''}" id="ws">
<div id="flow">
<header class="ws-head">
  <p class="ws-course">${escape(course)}</p>
  <h1 class="ws-title">Custom Worksheet</h1>
  <p class="ws-sub">${escape(papers.size === 1 ? papers.keys().next().value : 'Practice Studio question selection')}</p>
  <div class="ws-meta"><div class="ws-meta-row">
    <span><b>${picks.length}</b> question${picks.length === 1 ? '' : 's'}</span><span class="sep">/</span>
    <span><b>${papers.size}</b> source${papers.size === 1 ? '' : 's'}</span><span class="sep">/</span>
    <span><b>${total}</b> mark${total === 1 ? '' : 's'} total</span>
  </div></div>
</header>${questions}${key}</div><div id="pages"></div>
</article></div>
<script defer src="${KATEX}katex.min.js" crossorigin="anonymous"></script>
<script defer src="${KATEX}contrib/auto-render.min.js" crossorigin="anonymous"></script>
<script defer src="${PRINT}"></script></body></html>`;
}
