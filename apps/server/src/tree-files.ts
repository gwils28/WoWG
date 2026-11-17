import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { TreeFile } from '@wowg/shared';

export class PathError extends Error {}

/** Résout un chemin relatif à trees/ en refusant toute sortie du dossier et tout fichier non .json. */
export function resolveTreePath(treesDir: string, relPath: string): string {
  const root = resolve(treesDir);
  const full = resolve(root, relPath);
  if (!full.startsWith(root + sep) || !full.endsWith('.json')) {
    throw new PathError(`chemin refusé : "${relPath}" (fichier .json attendu dans trees/)`);
  }
  return full;
}

export function canonicalTreePath(tree: TreeFile): string {
  return `${tree.domain.id}/${tree.specialization.id}.json`;
}

export async function listTreeFiles(treesDir: string): Promise<string[]> {
  const root = resolve(treesDir);
  let entries: string[];
  try {
    entries = await readdir(root, { recursive: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.endsWith('.json'))
    .map((e) => relative(root, join(root, e)).split(sep).join('/'))
    .sort();
}

export async function readTreeFile(treesDir: string, relPath: string): Promise<string> {
  return readFile(resolveTreePath(treesDir, relPath), 'utf-8');
}

/** Écrit l'arbre à son emplacement canonique et renvoie le chemin relatif. */
export async function writeTreeFile(treesDir: string, tree: TreeFile): Promise<string> {
  const rel = canonicalTreePath(tree);
  const full = resolveTreePath(treesDir, rel);
  await mkdir(resolve(full, '..'), { recursive: true });
  await writeFile(full, JSON.stringify(tree, null, 2) + '\n', 'utf-8');
  return rel;
}
