---
name: generate-tree
description: Génère ou modifie un arbre de talents WoWG (une spécialisation d'un domaine) dans trees/<domaine>/<specialisation>.json, valide le fichier et itère avec l'utilisateur. Utiliser quand l'utilisateur veut créer un nouvel arbre, ajouter une spécialisation ou retoucher un arbre existant.
---

# generate-tree

Produit un fichier d'arbre conforme à `schemas/tree.schema.json` (source : `packages/shared/src/schema.ts`). L'utilisateur l'importe ensuite dans l'app (prévisualisation + diff). Tu n'écris jamais dans `data/`.

## 1. Entretien (court, AskUserQuestion, 1 ou 2 tours max)

- Domaine (existant dans `trees/` ou nouveau) et spécialisation.
- Niveau actuel réel : ce qui est déjà acquis, pour placer les premiers rangs au bon endroit.
- Objectif à long terme : il devient le talent ultime.
- Contraintes : temps par semaine, matériel, santé, budget.

Si l'arbre existe déjà, lis-le d'abord et ne demande que ce qui change.

## 2. Conception

- Grille : 7 paliers x 4 colonnes par défaut. Entre 20 et 30 talents, environ 3 à 5 par palier.
- Progression : palier 1 = fondamentaux accessibles tout de suite, dernier palier = un seul talent `"ultimate": true` (l'objectif long terme).
- Branches : 2 ou 3 axes lisibles (une colonne ou deux par axe), qui se rejoignent vers l'ultime.
- Rangs : 1 à 5. Chaque entrée de `ranks` est un critère **concret, vérifiable et daté par l'utilisateur** (une performance, un volume, une production, un examen). Jamais "être à l'aise avec", "maîtriser".
- Prérequis : uniquement vers un palier inférieur. `rank` absent = rang max du parent ; donne un `rank` plus bas quand un niveau partiel suffit. Évite les chaînes où tout dépend d'un seul talent.
- Identifiants : kebab-case, stables, sans accents (`ecoute-active`). Ne renomme jamais l'id d'un talent existant : la progression y est attachée. Pour un changement de sens, crée un nouveau talent.
- Icônes : `game-icons:<nom>`. Vérifie que le nom existe : `node -e "const s=require('@iconify-json/game-icons/icons.json');console.log(Object.keys(s.icons).filter(n=>n.includes(process.argv[1])).join(' '))" <motclé>` (une fois le paquet installé dans `apps/web`). Sinon, choisis un nom probable et signale-le.
- Textes en français. `description` : une phrase sur ce que le talent représente.

## 3. Écriture et validation

1. Écris `trees/<domaine.id>/<specialization.id>.json` (le `domain` doit être identique dans toutes les spécialisations du même domaine).
2. Lance `npm run validate-tree -- <fichier>`. Corrige jusqu'à `✓`. Ne contourne jamais une erreur de validation.
3. Présente l'arbre sous forme de tableau compact par palier (`palier | colonne | talent | rangs | prérequis`) plutôt que le JSON brut.

## 4. Itération

- Applique les demandes de modification, revalide, représente seulement ce qui a changé.
- En modification d'un arbre déjà importé, liste les talents supprimés ou dont `maxRank` baisse : la progression correspondante deviendra orpheline ou dépassera le max (le diff d'import l'affichera aussi).
- Termine par : "Importe le fichier depuis la page Import de l'app pour vérifier le diff."

## Exemple minimal

`packages/shared/test/fixtures/sample.json` (petite grille 3 x 3, prérequis avec et sans `rank`, talent ultime).
