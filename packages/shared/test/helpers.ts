import { readFileSync } from 'node:fs';
import { parseTree, type TreeFile } from '../src';

export function loadSample(): TreeFile {
  const res = parseTree(readFileSync(new URL('./fixtures/sample.json', import.meta.url), 'utf-8'));
  if (!res.ok) throw new Error(res.errors.join('\n'));
  return res.tree;
}

/** Copie profonde modifiable de la fixture, au format brut (avant validation). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixture brute modifiée librement dans les tests
export function rawSample(): Record<string, any> {
  return JSON.parse(readFileSync(new URL('./fixtures/sample.json', import.meta.url), 'utf-8'));
}
