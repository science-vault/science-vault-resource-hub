import { readFile, writeFile, mkdir } from 'node:fs/promises';
import './video-curriculum.cjs';
import assessmentModel from './assessment-model.cjs';

const sources = {
  assessments: ['school-resource-library', 'catalog.json', 'resources'],
  exams: ['exam-library', 'catalog.json', 'resources'],
  textbooks: ['textbook-library', 'catalog.json', 'books'],
  videos: ['video-library', 'catalog.json', 'resources'],
  worksheets: ['worksheet-vault', 'catalogue/worksheets.json'],
};
const destination = new URL('./', import.meta.url);
await mkdir(destination, { recursive: true });

const args = process.argv.slice(2).filter(arg => arg !== '--local');
for (const arg of args) if (!Object.hasOwn(sources, arg)) throw Error('Unknown collection: ' + arg);
const selectedSources = Object.entries(sources).filter(([kind]) => !args.length || args.includes(kind));

function assessmentPacks(rows) {
  const clean = rows.filter(row => row.id && row.title && /^(?:schools|assessments)\//.test(row.path)
    && !row.path.split('/').includes('..')
    && ![row.filename, ...row.path.split('/')].some(name =>
      /^(?:\._|~\$|-\$)|^(?:\.DS_Store|__MACOSX|Thumbs\.db|desktop\.ini)$|\.metadata\.json$|_files$/i.test(name)));
  const fileUrl = row => row.url || row.path.split('/').map(encodeURIComponent).join('/');
  return assessmentModel.packs(clean).rows.map(pack => {
    const companions = pack.files.filter(file => file.id !== pack.id);
    const key = companions.find(file => file.fileRole === 'Answers / marking key');
    return {
      ...pack, url: fileUrl(pack), years: pack.yearLevel ? [pack.yearLevel] : [], format: pack.extension,
      documentRole: pack.files[0].fileRole, markingKeyUrl: key && fileUrl(key),
      relatedResources: companions.filter(file => file !== key).map(file => ({
        url: fileUrl(file), title: file.fileRole + ' · ' + file.filename,
      })),
      integratedAnswers: pack.integratedAnswers, supportCount: pack.supportCount,
      keywords: [pack.type, pack.filename],
    };
  });
}

const catalogues = await Promise.all(selectedSources.map(async ([kind, [repo, path, key]]) => {
  const base = 'https://science-vault.github.io/' + repo + '/';
  const data = process.argv.includes('--local')
    ? JSON.parse(await readFile('/tmp/hub-' + repo + '.json', 'utf8'))
    : await fetch(base + path, { signal: AbortSignal.timeout(90000) }).then(response => {
      if (!response.ok) throw Error(repo + ' returned HTTP ' + response.status);
      return response.json();
    });
  const url = value => {
    if (typeof value !== 'string' || !value) return undefined;
    try {
      const link = new URL(value, base);
      if (link.protocol === 'https:' && !link.username && !link.password) return link.href;
    } catch {}
  };
  const rows = key ? data[key] : data;
  if (!Array.isArray(rows) || !rows.length) throw Error('Invalid catalogue for ' + repo);
  const linkedKeys = new Set(rows.map(row => url(row.markingKeyUrl)).filter(Boolean));
  const result = (kind === 'assessments' ? assessmentPacks(rows) : rows).flatMap(original => {
    const row = kind === 'videos' ? globalThis.LibraryCurriculum.enrich(original) : original;
    const file = url(row.worksheet?.url || row.url);
    if (!file || (row.documentRole === 'Marking key' && linkedKeys.has(file))) return [];
    return [{
      id: row.id, title: row.title, years: (row.years || []).map(String), subject: row.subject,
      area: row.area || row.subjectGroup, strand: row.strand || undefined,
      topic: row.categoryTopic || row.topic || undefined, pathway: row.pathway || undefined,
      unit: row.unit || undefined, publisher: row.publisher || row.school || row.author || undefined,
      examYear: row.examYear || undefined, role: row.documentRole || undefined,
      format: row.format || row.resourceType, added: row.addedAt || row.added,
      description: row.description || undefined, keywords: row.keywords?.slice(0, 25),
      file, preview: url(row.previewUrl), thumbnail: url(row.thumbnail || row.cover || row.coverSource),
      integratedAnswers: row.integratedAnswers || undefined, supportCount: row.supportCount || undefined,
      answer: url(row.markingKeyUrl || row.answer?.url), answerPreview: url(row.markingKeyPreviewUrl),
      related: (Array.isArray(row.relatedResources) ? row.relatedResources : []).flatMap(item => {
        const href = url(item.url);
        return href ? [{ href, title: item.title || item.name || 'Supporting resource' }] : [];
      }),
    }];
  });
  console.log(kind + ': ' + result.length);
  return [kind, result];
}));
await Promise.all(catalogues.map(([kind, rows]) => writeFile(new URL(kind + '.json', destination), JSON.stringify(rows))));
