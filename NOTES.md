# Notes d'implémentation

Écarts à la spec, choix conservateurs et pièges rencontrés. Plan de référence : `docs/PLAN.md`.

## Décisions (questions ouvertes de SPEC.md section 9)

- Niveau : passer de L à L+1 coûte L points, points pour L = L(L-1)/2 (`packages/shared/src/logic/level.ts`).
- Export d'un arbre édité : réécriture directe dans `trees/` par le serveur.
- Icônes : `@iconify-json/game-icons` (CC BY 3.0, attribution dans l'app).
- Prérequis : `rank` configurable par lien, défaut = rang max du parent.

## Choix conservateurs

- Points et niveau ne comptent que les talents encore définis : la progression orpheline est conservée mais n'entre pas dans le niveau.
- Rang courant borné à 0 lors du cumul des événements (un retrait en trop n'a pas d'effet négatif).
- Le JSON Schema exporté ne contient pas les règles croisées (ids uniques, cases, prérequis) : seul `npm run validate-tree` fait foi.
- Grille limitée à 10 paliers et 6 colonnes.
- Un retrait de rang crée un événement -1 (historique complet dans le journal), il ne supprime rien.
- Import par contenu (upload) : le fichier est aussi écrit dans `trees/` à son chemin canonique, pour que git reste la référence.
- Changer le domaine d'un arbre via l'édition écrit le fichier au nouveau chemin ; l'ancien fichier reste dans `trees/` (à supprimer à la main).
- La restauration d'une sauvegarde remplace la base mais ne réécrit pas `trees/`.
- Une spécialisation ne peut pas changer d'id (la progression y est attachée).

## Écarts au plan

- Phase 4 : règle de validation ajoutée, une flèche de prérequis ne doit traverser aucun talent (`arrowCells` dans `schema.ts`, même tracé que l'UI). La fixture a été ajustée (récupération en colonne 3).
- Phase 4 : à la lecture (base, sauvegarde), seul `TreeFileStructureSchema` est appliqué, pour qu'une règle ajoutée plus tard ne rende pas les données existantes illisibles. Les règles croisées s'appliquent à l'écriture (import, édition).

- Phase 3 : toutes les routes sont dans `apps/server/src/app.ts` (environ 250 lignes) plutôt qu'un dossier `routes/`. À découper si le fichier grossit.

## Pièges

- Le bundle web dépasse 500 kB à cause de la collection d'icônes embarquée (hors ligne voulu). Acceptable en local ; à découper si besoin.
- `npm audit` signale `picomatch` (ReDoS) : dépendance d'outillage de dev uniquement, non embarquée.
- `npm i -w <paquet> @wowg/shared` échoue (le paquet n'est pas sur le registre) : ajouter `"@wowg/shared": "*"` à la main dans `dependencies`, puis `npm i`.
- Ne pas arrêter le serveur de test avec `pkill -f` sur un motif présent dans la commande en cours : cela tue aussi le shell.
- npm 11 bloque les scripts d'installation : `esbuild` (via tsx/vitest) fonctionne sans son postinstall, qui n'est qu'une vérification.
- Écrire la séquence d'échappement unicode du tiret cadratin dans un appel d'outil la transforme en vrai caractère, et le hook bloque. Dans un script, utiliser `chr(0x2014)` (Python) ou `String.fromCharCode(0x2014)` (JS).
