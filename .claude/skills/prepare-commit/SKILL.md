---
name: prepare-commit
description: Prépare un commit sans l'exécuter. Vérifie que le diff porte sur un seul sujet, lance tests et lint, propose un message. Utiliser quand l'utilisateur dit "prépare le commit" ou avant de rendre la main après une tâche.
disable-model-invocation: true
---

# prepare-commit

Tu ne lances JAMAIS `git commit`, `git push`, ni `git add` sans demande explicite. L'utilisateur commite lui-même.

## Étapes

1. `git status` et `git diff` (plus `git diff --staged` s'il y a des fichiers indexés).
2. Un seul sujet ? Si le diff mélange plusieurs sujets (ex. feature + refacto + config), propose un découpage en commits distincts avec la liste des fichiers pour chacun.
3. Vérifie l'absence de fichiers sensibles ou parasites : `.env*`, `data/`, `*.sqlite`, `node_modules/`, fichiers de debug.
4. Lance `npm test` et `npm run lint` si les scripts existent. Rapporte les échecs tels quels, sans les masquer.
5. Propose le message de commit :
   - Format Conventional Commits : `type(portée): résumé` (feat, fix, refactor, test, docs, chore), en français, 72 caractères max pour la première ligne.
   - Corps : le pourquoi en 2 à 4 lignes, pas le quoi.
   - Aucune ligne `Co-Authored-By`.
6. Donne la commande exacte à copier (`git add ...` puis `git commit -m ...`), sans l'exécuter.
7. Rappelle les points à relire en priorité dans le diff (logique métier, migrations, schéma d'arbre).
