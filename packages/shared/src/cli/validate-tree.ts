/**
 * Valide un ou plusieurs fichiers d'arbre.
 * Usage : npm run validate-tree -- [--quests] trees/sport-sante/course-a-pied.json [...]
 * --quests : affiche aussi chaque quête (talents, rythme, étapes, or du barème).
 * Les garde-fous économiques des quêtes (SPEC 10.6) s'affichent en avertissement, sans échec.
 * Code de sortie 1 si au moins un fichier est invalide.
 */
import { readFileSync } from 'node:fs';
import { parseTree } from '../schema';
import { maxPoints } from '../logic/ranks';
import { questGold, questWarnings, treeQuestDefinition } from '../logic/quests';

const args = process.argv.slice(2);
const showQuests = args.includes('--quests');
const files = args.filter((a) => a !== '--quests');
if (files.length === 0) {
  console.error('Usage : npm run validate-tree -- [--quests] <fichier.json> [...]');
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
    if (showQuests) {
      const lookup = () => ({ tree, ranks: {} });
      const name = (id: string) => tree.talents.find((t) => t.id === id)?.name ?? id;
      for (const q of tree.quests ?? []) {
        const gold = questGold(treeQuestDefinition(tree.specialization.id, q), lookup);
        const rhythm = q.recurrence
          ? `${q.recurrence.times}x/${q.recurrence.per} x ${q.recurrence.periods}`
          : 'ponctuelle';
        const steps = q.steps?.length ? `, ${q.steps.length} étapes` : '';
        console.log(
          `    ${q.id} : ${q.name} -> ${q.talents.map(name).join(', ')} [${rhythm}${steps}] ${gold} or`,
        );
      }
    }
    for (const w of questWarnings(tree)) console.log(`  ! ${w}`);
  } else {
    failed = true;
    console.error(`✗ ${file} : ${res.errors.length} erreur(s)`);
    for (const err of res.errors) console.error(`  - ${err}`);
  }
}
process.exit(failed ? 1 : 0);
