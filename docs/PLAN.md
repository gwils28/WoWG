# Plan d'implémentation du MVP WoWG

## Contexte

Le dépôt ne contient que `SPEC.md`, `CLAUDE.md` et la config `.claude/`. Ce plan découpe le MVP (section 7 de la spec) en phases courtes. Chaque phase finit par des tests verts et un commit fait par l'utilisateur via `/prepare-commit`. Environnement : Node 24.21, npm 11.

## Réponses proposées aux questions ouvertes (spec section 9)

1. **Niveau de personnage** : passer du niveau L au niveau L+1 coûte L points (1 rang = 1 point). Points pour atteindre L = L(L-1)/2. Avec environ 300 rangs au total (4 à 6 spécialisations de 25 talents), on arrive vers le niveau 25. Pas de niveau max.
2. **Export d'un arbre édité** : le serveur réécrit directement `trees/<domaine>/<specialisation>.json`. Git reste la référence, et `git diff` montre les retouches.
3. **Icônes** : jeu game-icons.net via `@iconify-json/game-icons` (environ 4000 SVG, CC BY 3.0, hors ligne). Un talent référence `"game-icons:sword-wound"`. Attribution en pied de page.
4. **Rang requis pour un prérequis** : configurable par lien (`{ talentId, rank? }`), par défaut le rang max du parent.

## Architecture

```
apps/web         React 19 + Vite + React Router + TanStack Query, CSS maison (tokens)
apps/server      Hono + @hono/node-server, SQLite via node:sqlite (natif Node 24, pas de build natif)
packages/shared  schémas zod v4, types, logique métier pure, CLI validate-tree
trees/           définitions d'arbres versionnées (une spécialisation par fichier)
data/            wowg.sqlite (hors git, interdit à Claude)
schemas/         tree.schema.json exporté depuis zod (pour la skill)
```

Choix notables :

- **Pas d'ORM** : deux tables seulement, du SQL écrit à la main dans un module repository. Migrations via `PRAGMA user_version`.
- **Serveur lié à 127.0.0.1**. Les chemins d'import sont restreints à `trees/` (protection contre la traversée de répertoires).
- **En dev** : `npm run dev` lance Vite (5173) et le serveur (3001) via `concurrently`, avec un proxy `/api`. En usage normal : `npm start`, le serveur sert aussi le build du front.

### Format d'un fichier d'arbre (`packages/shared/src/schema.ts`)

```ts
TreeFile {
  schemaVersion: 1
  domain: { id, name, icon }                    // ex. "langues-culture"
  specialization: { id, name, description, icon }
  grid: { tiers: 7, columns: 4 }
  talents: Talent[]
}
Talent {
  id (slug stable), name, description, icon,
  tier 1..7, column 1..4, maxRank 1..5,
  ranks: string[]          // critère de chaque rang, longueur = maxRank
  prerequisites: { talentId, rank? }[]
  ultimate?: boolean
}
```

Validations ajoutées (`superRefine`) :

- ids uniques, une seule case par position ;
- un prérequis existe et se trouve à un palier strictement supérieur (ce qui exclut les cycles) ;
- `rank` du prérequis ≤ `maxRank` du parent ;
- au plus un talent `ultimate`, et il est au dernier palier.

### Base de données

- `specializations(id PK, domain_id, definition JSON, imported_at, updated_at)`
- `rank_events(id, specialization_id, talent_id, delta +1|-1, occurred_at, note, created_at)`

Le rang courant se calcule à partir des événements. Un événement dont le `talent_id` n'existe plus dans la définition est orphelin : il est conservé et signalé.

### Logique métier pure (`packages/shared/src/logic/`)

- `currentRanks(events)`
- `talentState(tree, ranks, id)` : verrouillé, disponible, en cours ou maxé
- `canAddRank` et `canRemoveRank` : le retrait est refusé s'il invalide un enfant qui a déjà des rangs, avec un message
- `levelFromPoints` et `pointsForLevel`
- `diffTrees(old, new)` : talents ajoutés, modifiés ou supprimés, plus les orphelins

Le serveur applique ces mêmes fonctions (source unique de vérité). Le front s'en sert pour l'affichage immédiat.

### API (`apps/server/src/routes/`)

| Route                                                       | Rôle                                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /api/character`                                        | niveau, points, progression vers le niveau suivant, résumé par domaine                              |
| `GET /api/specializations` / `GET /api/specializations/:id` | liste ; définition + rangs + orphelins                                                              |
| `GET /api/tree-files`                                       | fichiers disponibles dans `trees/`                                                                  |
| `POST /api/import/preview`                                  | `{ path }` ou `{ content }` → arbre validé + diff ou erreurs zod lisibles                           |
| `POST /api/import/apply`                                    | enregistre la définition                                                                            |
| `PUT /api/specializations/:id`                              | définition éditée → validation, base, puis réécriture du fichier `trees/`                           |
| `POST /api/specializations/:id/talents/:talentId/ranks`     | `{ note?, occurredAt? }`, +1                                                                        |
| `DELETE /api/specializations/:id/talents/:talentId/ranks`   | -1 (refus 409 si un enfant en dépend)                                                               |
| `GET /api/journal?domain&spec&from&to`                      | timeline                                                                                            |
| `GET /api/backup` / `POST /api/backup`                      | export / restauration de toute la progression (la restauration remplace tout, confirmation côté UI) |

### Front (`apps/web/src/`)

- **Thème** : tokens CSS (fond sombre, or, parchemin), police Cinzel auto-hébergée via `@fontsource` (licence OFL).
- **`TalentTree`** : une grille CSS paliers x colonnes, avec un calque SVG pour les flèches (couleur selon l'état du parent) et le compteur de points de la spécialisation.
- **`TalentNode`** : case d'icône, badge `2/5`, état visuel. Clic gauche : ouvre un popover « note facultative + date » puis +1. Clic droit : -1.
- **`TalentTooltip`** : nom, rang, description, critère du prochain rang, prérequis manquants.
- **Pages** :
  - Accueil : fiche perso avec niveau, barre d'XP et domaines.
  - Spécialisation : onglets des spécialisations du domaine, comme dans WoW.
  - Journal.
  - Import : liste des fichiers, prévisualisation via `TalentTree` en lecture seule, diff, appliquer.
- **Mode édition** dans la vue spécialisation : un panneau latéral pour le talent sélectionné (champs, rangs, prérequis, position, sélecteur d'icône avec recherche). Enregistrer appelle le `PUT`.

### Skill `generate-tree` (`.claude/skills/generate-tree/SKILL.md`)

1. Entretien court : domaine, spécialisation, niveau actuel, objectifs, contraintes (temps, matériel).
2. Écriture de `trees/<domaine>/<spec>.json` selon `schemas/tree.schema.json`, avec des critères de rang concrets et vérifiables.
3. Validation avec `npm run validate-tree -- <fichier>`, et correction jusqu'à ce qu'elle passe.
4. Itération sur les demandes de modification. L'import se fait ensuite dans l'app (prévisualisation + diff).

## Phases (une phase = un commit)

0. **Échafaudage** : workspaces npm, TypeScript strict, ESLint + Prettier, Vitest en projets, scripts `dev`, `test`, `lint`, `build`. Les hooks de formatage et de tests deviennent actifs ici.
1. **Shared** : schéma zod + export JSON Schema + CLI `validate-tree` + logique métier. Tests sur une fixture d'arbre (états, prérequis, retrait refusé, niveau, diff).
2. **Skill `generate-tree`** + `NOTES.md`.
3. **Serveur** : base (`:memory:` dans les tests), repository, routes, garde de chemin `trees/`. Tests d'API via `app.request()`.
4. **Front, arbre** : thème, `TalentTree`, `TalentNode`, `TalentTooltip`, interactions sur les rangs, accueil et fiche perso.
5. **Front, import et édition** : page Import (prévisualisation + diff), mode édition, sélecteur d'icônes, réécriture du fichier.
6. **Journal + sauvegarde** : page Journal avec filtres, export / restauration JSON.
7. **Contenu réel** : avec toi, génération via la skill d'une spécialisation par domaine (ex. Course à pied, Anglais), import, essai réel. README et mise à jour de `CLAUDE.md` (commandes, pièges).

## Vérification

- **À chaque phase** : `npm test` et `npm run lint` passent (le hook Stop relance les tests).
- **Phase 1** : `npm run validate-tree -- packages/shared/test/fixtures/sample.json` passe, et une version volontairement cassée échoue avec un message clair.
- **Phase 3** : on lance le serveur, puis on teste à la main avec `curl` (prévisualisation, application, +1 / -1, retrait refusé avec 409).
- **Phases 4 à 6** : on lance `npm run dev`, puis on parcourt l'app dans Chrome (extension Claude in Chrome). Parcours : import de la fixture, montée de rangs jusqu'au déblocage d'un enfant, tentative de retrait refusée, édition d'un talent puis `git diff trees/`, journal filtré, export puis restauration de la sauvegarde. Captures d'écran pour valider le rendu.
- **Phase 7** : utilisation réelle sur tes deux domaines.
