/**
 * Valide un ou plusieurs fichiers d'arbre.
 * Usage : npm run validate-tree -- trees/sport-sante/course-a-pied.json [...]
 * Code de sortie 1 si au moins un fichier est invalide.
 */
import { readFileSync } from 'node:fs';
import { parseTree } from '../schema';
import { maxPoints } from '../logic/ranks';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage : npm run validate-tree -- <fichier.json> [...]');
  process.exit(2);
}

let failed = false;
for (const file of files) {
  let content: string;
  try {
    content = readFileSync(file, 'utf-8');
  } catch (e) {
    console.error(`✗ ${file} : lecture impossible (${(e as Error).message})`);
    failed = true;
    continue;
  }
  const res = parseTree(content);
  if (res.ok) {
    const { tree } = res;
    console.log(
      `✓ ${file} : ${tree.domain.name} / ${tree.specialization.name}, ${tree.talents.length} talents, ${maxPoints(tree)} points, ${tree.quests?.length ?? 0} quêtes`,
    );
  } else {
    failed = true;
    console.error(`✗ ${file} : ${res.errors.length} erreur(s)`);
    for (const err of res.errors) console.error(`  - ${err}`);
  }
}
process.exit(failed ? 1 : 0);
