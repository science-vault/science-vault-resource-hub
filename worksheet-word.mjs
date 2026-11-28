const libraryUrl = new URL('./vendor/docx-9.5.1.js', import.meta.url);
let library;

function loadWordLibrary() {
  if (window.docx) return Promise.resolve(window.docx);
  if (!library) {
    library = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = libraryUrl.href;
      script.onload = () => window.docx ? resolve(window.docx) : reject(new Error('Word export did not load.'));
      script.onerror = () => reject(new Error('Word export could not load. Please try again.'));
      document.head.append(script);
    }).catch(error => {
      library = undefined;
      throw error;
    });
  }
  return library;
}

async function rasterImage(img) {
  const source = new Image();
  source.crossOrigin = 'anonymous';
  source.src = img.getAttribute('src');
  await source.decode();
  const scale = Math.min(1, 1800 / Math.max(source.naturalWidth, source.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('A question diagram could not be converted.');
  const displayScale = Math.min(1, (Number(img.getAttribute('width')) || 540) / canvas.width, 540 / canvas.width, 650 / canvas.height);
  return {
    type: 'png',
    data: await blob.arrayBuffer(),
    transformation: {
      width: Math.max(1, Math.round(canvas.width * displayScale)),
      height: Math.max(1, Math.round(canvas.height * displayScale)),
    },
    altText: { title: img.alt || 'Question diagram', description: img.alt || 'Question diagram', name: 'Diagram' },
  };
}

const blockTags = new Set(['P', 'DIV', 'FIGURE', 'FIGCAPTION', 'OL', 'UL', 'LI', 'TABLE', 'BLOCKQUOTE', 'PRE', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

export async function wordWorksheet(markup, word = null, loadImage = rasterImage) {
  const d = word ?? await loadWordLibrary();
  const html = new DOMParser().parseFromString(markup, 'text/html');
  const images = new Map();
  const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle } = d;

  const paragraph = (children, properties = {}) => new Paragraph({ children, ...properties });
  const label = (text, properties = {}) => paragraph([new TextRun(text)], properties);
  const heading = (text, level, properties = {}) => label(text, { heading: level, ...properties });
  const content = node => node.textContent.trim();

  async function runs(node, style = {}) {
    if (node.nodeType === 3) return [new TextRun({ ...style, text: node.textContent.replace(/\s+/g, ' ') })];
    if (node.nodeType !== 1) return [];
    if (node.tagName === 'BR') return [new TextRun({ break: 1 })];
    if (node.tagName === 'IMG') {
      const key = node.getAttribute('src') + '|' + node.getAttribute('width');
      if (!images.has(key)) images.set(key, loadImage(node));
      try {
        return [new ImageRun(await images.get(key))];
      } catch {
        throw new Error('Could not load the diagram “' + (node.alt || 'Question diagram') + '”.');
      }
    }
    const next = { ...style };
    if (['STRONG', 'B'].includes(node.tagName)) next.bold = true;
    if (['EM', 'I'].includes(node.tagName)) next.italics = true;
    if (node.tagName === 'SUP') next.superScript = true;
    if (node.tagName === 'SUB') next.subScript = true;
    if (node.tagName === 'U') next.underline = {};
    return (await Promise.all([...node.childNodes].map(child => runs(child, next)))).flat();
  }

  async function blocks(parent) {
    const result = [];
    let pending = [];
    const flush = () => {
      if (pending.length) result.push(paragraph(pending));
      pending = [];
    };
    for (const node of parent.childNodes) {
      if (!blockTags.has(node.tagName)) {
        if (node.nodeType !== 3 || node.textContent.trim() || pending.length) pending.push(...await runs(node));
        continue;
      }

      flush();
      if (node.tagName === 'TABLE') {
        const rows = [];
        for (const tr of node.querySelectorAll('tr')) {
          const cells = [];
          for (const cell of tr.children) {
            if (!['TD','TH'].includes(cell.tagName)) continue;
            const children = await blocks(cell);
            cells.push(new TableCell({
              children: children.length ? children : [paragraph([])],
              columnSpan: Number(cell.getAttribute('colspan')) || undefined,
              rowSpan: Number(cell.getAttribute('rowspan')) || undefined,
            }));
          }
          if (cells.length) rows.push(new TableRow({ children: cells }));
        }
        if (rows.length) result.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      } else if (node.tagName === 'OL' || node.tagName === 'UL') {
        const alpha = node.getAttribute('type') === 'A';
        for (const [index, item] of [...node.children].entries()) {
          const marker = node.tagName === 'UL' ? '•' : alpha ? String.fromCharCode(65 + index) + '.' : (index + 1) + '.';
          result.push(paragraph([new TextRun(marker + '  '), ...await runs(item)]));
        }
      } else if (node.classList.contains('answer')) {
        const line = { style: BorderStyle.SINGLE, size: 4, color: 'B0B9C0' };
        for (const rule of node.querySelectorAll('.rule')) {
          result.push(label(' ', { border: { bottom: line, between: line }, spacing: { line: 360, after: 0 } }));
        }
      } else {
        result.push(...await blocks(node));
      }
    }
    flush();
    return result;
  }

  const flow = html.querySelector('#flow');
  const header = flow.querySelector('.ws-head');
  const children = [
    heading(content(header.querySelector('.ws-title')), 'Title'),
    label(content(header.querySelector('.ws-course'))),
    label(content(header.querySelector('.ws-meta-row'))),
  ];
  for (const lesson of flow.querySelectorAll('.lesson')) {
    children.push(heading(content(lesson.querySelector('.lesson-name')), 'Heading1'));
    for (const group of lesson.querySelectorAll('.qgroup')) {
      children.push(heading(content(group.querySelector('.qg-name')), 'Heading2'));
      for (const question of group.querySelectorAll('.q')) {
        const number = content(question.querySelector('.q-num'));
        const marks = content(question.querySelector('.m') || document.createElement('span'));
        children.push(heading('Question ' + number + (marks ? ' (' + marks + (marks === '1' ? ' mark)' : ' marks)') : ''), 'Heading3', { keepNext: true }));
        const body = question.querySelector('.q-body');
        if (!html.querySelector('#ws').classList.contains('show-space')) body.querySelector('.answer')?.remove();
        children.push(...await blocks(body));
      }
    }
  }

  const key = flow.querySelector('.answer-key');
  if (key) {
    children.push(heading(content(key.querySelector('.key-title')), 'Heading1', { pageBreakBefore: true }));
    for (const entry of key.querySelectorAll('.key-entry')) {
      children.push(heading('Question ' + content(entry.querySelector('.key-ref')), 'Heading3', { keepNext: true }));
      children.push(...await blocks(entry.querySelector('.key-q')));
    }
  }
  const file = new Document({
    title: 'Custom Worksheet',
    creator: 'Science Vault',
    styles: { default: { document: { run: { font: 'Arial', size: 22 }, paragraph: { spacing: { after: 100 } } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 950, right: 950, bottom: 950, left: 950 } } },
      children,
    }],
  });
  return Packer.toBlob(file);
}
