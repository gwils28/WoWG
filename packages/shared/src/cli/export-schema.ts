/** Régénère schemas/tree.schema.json depuis le schéma zod. Usage : npm run export-schema */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { treeJsonSchema } from '../schema';

const target = fileURLToPath(new URL('../../../../schemas/tree.schema.json', import.meta.url));
writeFileSync(target, JSON.stringify(treeJsonSchema(), null, 2) + '\n');
console.log(`Schéma écrit : ${target}`);
