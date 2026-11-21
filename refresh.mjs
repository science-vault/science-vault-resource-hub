import { normalizeCatalogue, sources, getSourceUrl } from './live-catalogue.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const destination = new URL('./', import.meta.url);
await mkdir(destination, { recursive: true });

const args = process.argv.slice(2).filter(arg => arg !== '--local');
for (const arg of args) if (!Object.hasOwn(sources, arg)) throw Error('Unknown collection: ' + arg);
const selectedSources = Object.entries(sources).filter(([kind]) => !args.length || args.includes(kind));

const catalogues = await Promise.all(selectedSources.map(async ([kind, [repo]]) => {
  const data = process.argv.includes('--local')
    ? JSON.parse(await readFile('/tmp/hub-' + repo + '.json', 'utf8'))
    : await fetch(getSourceUrl(kind), { signal: AbortSignal.timeout(90000) }).then(response => {
      if (!response.ok) throw Error(repo + ' returned HTTP ' + response.status);
      return response.json();
    });
  const result = normalizeCatalogue(kind, data);
  console.log(kind + ': ' + result.length);
  return [kind, result];
}));
await Promise.all(catalogues.map(([kind, rows]) => writeFile(new URL(kind + '.json', destination), JSON.stringify(rows))));
