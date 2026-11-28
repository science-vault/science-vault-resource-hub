/* ============================================================
   worksheet-print.js — KaTeX render + A4 pagination for the
   generated worksheet. Reads authored content from #flow and
   lays it out into discrete .page cards inside #pages.
   ============================================================ */
(function () {
  var ws    = document.getElementById('ws');
  var flow  = document.getElementById('flow');
  var pages = document.getElementById('pages');
  if (!ws || !flow || !pages) return;
  pages.classList.add('pages');

  /* Valid paginated worksheets share the A4 phone-pan scaffold. Resolve the
     nearest wrapper only after the required runtime elements are present, so
     custom layouts and incomplete worksheets keep their authored structure. */
  var sheetWrap = ws.closest('.sheet-wrap');
  if (sheetWrap && sheetWrap.contains(pages)) {
    sheetWrap.classList.add('worksheet-mobile-pan');
    if (!sheetWrap.hasAttribute('tabindex')) sheetWrap.setAttribute('tabindex', '0');
    if (!sheetWrap.hasAttribute('role')) sheetWrap.setAttribute('role', 'region');
    if (!sheetWrap.hasAttribute('aria-label') && !sheetWrap.hasAttribute('aria-labelledby')) {
      sheetWrap.setAttribute('aria-label', 'Scrollable A4 worksheet pages');
    }
  }

  /* Ruled responses author one .rule span per intended writing line.
     Keep that authored count as the source of truth instead of applying the
     stylesheet's five-line fallback to every question. data-lines remains an
     available explicit override for generated/custom worksheets. */
  flow.querySelectorAll('.answer.ruled').forEach(function (el) {
    var explicitLines = parseInt(el.getAttribute('data-lines'), 10);
    var authoredLines = el.querySelectorAll(':scope > .rule').length;
    var lineCount = explicitLines > 0 ? explicitLines : authoredLines;
    if (lineCount > 0) el.style.setProperty('--lines', lineCount);
  });

  /* sketch boxes carry their height in data-box (mm) */
  flow.querySelectorAll('.answer.grid[data-box]').forEach(function (el) {
    el.style.height = el.getAttribute('data-box') + 'mm';
  });

  /* Delimiters: the house pair (`$$`, `$` — scripts.js renderDelimitedMath, review-session.js,
     quick-check.html) PLUS `\[..\]` / `\(..\)`, the dialect worksheet-generator.js output has
     always been authored in. Until 2026-09-01 this list held only the second pair, so the 35
     Physics exam sheets written in the house `$..$` form rendered nothing even where KaTeX
     executed, and reached learners as literal `$F$` (FINDINGS-LOG.md, WORKSHEET-RENDER-
     DEFECTS-2026-09-01.md). Order matters: `$$` must precede `$`. `\(` cannot occur in prose,
     so the superset adds no pairing hazard; currency on a sheet is written `$\$N$` (CLAUDE.md).
     Any sheet that carries its own inline render block must use this same set — see the
     house block in subjects/physics/year12/module5/worksheets/lesson01-worksheet-01.html.
     Guard for the wiring (not the delimiter set): npm run audit:katex:wiring. */
  var MATH_DELIMITERS = [
    { left: "$$", right: "$$", display: true },
    { left: "\\[", right: "\\]", display: true },
    { left: "$", right: "$", display: false },
    { left: "\\(", right: "\\)", display: false }
  ];

  function renderMath() {
    if (!window.renderMathInElement) return;
    renderMathInElement(flow, {
      delimiters: MATH_DELIMITERS,
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"],
      throwOnError: false
    });
  }

  /* collect atomic blocks once (live element refs), in document order.
     Every child is laid out: anything not recognised becomes its own block rather
     than being left behind in the hidden #flow. Until 2026-11-17 only .ws-head,
     .lesson-head, the FIRST .qgroup-head / .qgroup-context and .q were collected, so
     reference-data tables, stimulus text, a second group heading and nested question
     groups silently vanished from the sheet (bug sweep 2: 10 of 255 sheets, including
     whole data-response questions). */
  var BLOCKS = [];
  function pushGroup(group) {
    [].forEach.call(group.children, function (c) {
      if (c.classList.contains('qgroup-head')) BLOCKS.push({ el: c, head: true });
      else if (c.classList.contains('qgroup')) pushGroup(c);
      else BLOCKS.push({ el: c });
    });
  }
  [].forEach.call(flow.children, function (node) {
    if (node.classList.contains('lesson')) {
      [].forEach.call(node.children, function (c) {
        if (c.classList.contains('lesson-head')) BLOCKS.push({ el: c, head: true });
        else if (c.classList.contains('qgroup')) pushGroup(c);
        else BLOCKS.push({ el: c });
      });
    } else if (node.classList.contains('answer-key')) {
      var hasHead = !!node.querySelector(':scope > .key-head');
      [].forEach.call(node.children, function (c, i) {
        if (c.classList.contains('key-head')) BLOCKS.push({ el: c, head: true, key: true, newPage: true });
        else BLOCKS.push({ el: c, key: true, newPage: !hasHead && i === 0 });
      });
    } else {
      BLOCKS.push({ el: node });
    }
  });

  function makePage(isKey) {
    var p = document.createElement('div'); p.className = 'page';
    var inner = document.createElement('div'); inner.className = 'page-inner';
    var foot = document.createElement('div'); foot.className = 'page-foot';
    p.appendChild(inner); p.appendChild(foot);
    p.dataset.key = isKey ? '1' : '0';
    pages.appendChild(p);
    return { p: p, inner: inner };
  }

  function isHeader(el) {
    return el && (el.classList.contains('lesson-head') ||
                  el.classList.contains('qgroup-head') ||
                  el.classList.contains('key-head'));
  }

  function paginate() {
    var frag = document.createDocumentFragment();
    BLOCKS.forEach(function (b) { frag.appendChild(b.el); });
    pages.innerHTML = '';

    var showKey = ws.classList.contains('show-key');
    var cur = makePage(false);

    BLOCKS.forEach(function (b) {
      if (b.key && !showKey) return;
      // A previous oversized block gets its own flexible page. Never append a
      // later question to that page: it could be clipped or land in the footer.
      if (cur.p.classList.contains('page--oversized')) cur = makePage(!!b.key);
      if (b.newPage && cur.inner.children.length) cur = makePage(true);
      if (b.key) cur.p.dataset.key = '1';

      cur.inner.appendChild(b.el);
      var innerTop = cur.inner.getBoundingClientRect().top;
      var overflow = (b.el.getBoundingClientRect().bottom - innerTop) > (cur.inner.clientHeight + 2);

      if (overflow && cur.inner.children.length > 1) {
        cur.inner.removeChild(b.el);
        var carry = [];
        while (isHeader(cur.inner.lastElementChild)) {
          carry.unshift(cur.inner.lastElementChild);
          cur.inner.removeChild(cur.inner.lastElementChild);
        }
        cur = makePage(!!b.key);
        carry.forEach(function (c) { cur.inner.appendChild(c); });
        cur.inner.appendChild(b.el);
      }
      // A single context, table or question can exceed an entire A4 page.
      // Fixed-height pages hide the excess, so let the browser paginate this
      // page naturally instead of silently discarding part of the task.
      if (b.el.getBoundingClientRect().bottom - cur.inner.getBoundingClientRect().top > cur.inner.clientHeight + 2) {
        cur.p.classList.add('page--oversized');
      }
    });

    numberPages();
  }

  function numberPages() {
    var all = [].slice.call(pages.children);
    var N = all.length;
    // A naturally flowing oversized block may occupy multiple print sheets,
    // so the fixed-card count is not a truthful count of physical pages.
    var hasOversized = all.some(function (p) { return p.classList.contains('page--oversized'); });
    all.forEach(function (p, i) {
      var isKey = p.dataset.key === '1';
      p.querySelector('.page-foot').innerHTML =
        '<span>Science Vault · ' + (isKey ? 'Answer key' : 'Custom worksheet') + '</span>' +
        (hasOversized ? '' : '<span>Page ' + (i + 1) + ' of ' + N + '</span>');
    });
  }

  var printButton = document.getElementById('printWorksheet');
  var images = Array.from(flow.querySelectorAll('img'));
  var imageTimer;
  var booted = false;
  var printReady = false;
  var imageWait;

  function updatePrintReady() {
    if (!booted || printReady || images.some(function (img) { return !img.complete; })) return;
    finishImageWait();
  }

  function finishImageWait() {
    printReady = true;
    clearTimeout(imageWait);
    paginate();
    if (printButton) printButton.disabled = false;
  }

  if (printButton) printButton.addEventListener('click', function () {
    paginate();
    window.print();
  });

  function boot() {
    renderMath();
    booted = true;
    paginate();
    // Let linked images finish before enabling print. A stalled host must
    // not permanently disable printing.
    imageWait = setTimeout(finishImageWait, 8000);
    updatePrintReady();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paginate);
  }

  images.forEach(function (img) {
    function reflowAfterImage() {
      if (!booted) return;
      updatePrintReady();
      clearTimeout(imageTimer);
      imageTimer = setTimeout(paginate, 50);
    }
    img.addEventListener('load', reflowAfterImage);
    img.addEventListener('error', reflowAfterImage);
  });

  function start() {
    var tries = 0;
    (function wait() {
      if (window.renderMathInElement) { boot(); }
      else if (tries++ < 60) { setTimeout(wait, 50); }
      else { boot(); }
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  /* toolbar */
  var seg = document.getElementById('dirSeg');
  if (seg) seg.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    ws.classList.remove('theme-a', 'theme-b', 'theme-c');
    ws.classList.add(btn.dataset.theme);
    this.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    paginate();
  });
  var ts = document.getElementById('tglSpace');
  if (ts) ts.addEventListener('change', function () { ws.classList.toggle('show-space', this.checked); paginate(); });
  var tk = document.getElementById('tglKey');
  if (tk) tk.addEventListener('change', function () { ws.classList.toggle('show-key', this.checked); paginate(); });

  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(paginate, 200); });
})();


