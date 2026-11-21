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

## v2 : quêtes et or (SPEC section 10)

### Modèle

Fichier d'arbre, champ facultatif :

```ts
quests?: TreeQuest[]
TreeQuest {
  id: slug                     // unique dans l'arbre
  name, description
  talents: slug[]              // >= 1, sans doublon, existants dans l'arbre
  steps?: string[]             // 0 à 10
  recurrence?: { times: 1..20, per: 'day' | 'week' | 'month', periods: 1..52 }
}
```

Base, migration 3 :

- `custom_quests` (id, definition JSON, created_at, updated_at) : talents référencés par `{ specializationId, talentId }`, ou aucun avec `size`.
- `quest_runs` (id, source `tree` | `custom`, specialization_id + quest_id ou custom_quest_id, snapshot JSON de la définition, gold figé, accepted_at, deadline, steps_done JSON, status `active` | `completed` | `abandoned`, completed_at, note).
- `quest_ticks` (id, run_id, occurred_at, created_at).
- `gold_events` (id, amount signé, reason `quest` | `quest-undo` | plus tard `purchase`, run_id, occurred_at, created_at).
- `rank_events.quest_run_id` nullable (ALTER TABLE ADD COLUMN).

### Phases

8. **Shared, quêtes** : schéma `quests` (règles croisées : ids uniques, talents existants), `export-schema`, diff étendu aux quêtes. Logique pure : disponibilité, périodes calendaires et progression du rythme, prête à rendre, barème d'or, rendu (talents ignorés si maxés), annulation (refus enfant dépendant ou solde négatif). Tests.
9. **Serveur, quêtes et or** : migration 3, repository, routes (liste disponibles / actives / terminées, accepter, cocher étape, occurrence +/-, rendre, abandonner, annuler un rendu, CRUD quêtes perso, solde), journal et sauvegarde étendus. Tests d'API.
10. **Front, quêtes** : onglet et page Quêtes, marqueurs « ! » / « ? » sur l'arbre et infobulle, dialogues accepter / rendre, formulaire de quête perso, solde d'or (barre du haut, fiche), journal.
11. **Contenu, quêtes** : skill `generate-tree` (génération des quêtes + mode « ajouter des quêtes à un arbre existant »), puis ajout aux 36 arbres existants, classe par classe avec toi.
12. **Étal** : spécifié le 2026-11-21, voir « v2 : Étal » ci-dessous (phases 12a à 12d).

### Vérification

- Phase 8 : fixture avec quêtes valide, versions cassées (talent inconnu, id dupliqué) refusées avec message clair. Tests de périodes sur les bords (changement de semaine ISO, de mois).
- Phase 9 : `curl` sur un serveur isolé (port 3101) : accepter, occurrences, rendre (rangs + or), annuler refusé quand un enfant dépend.
- Phase 10 : parcours dans Chrome sur serveur isolé : quête proposée acceptée depuis un « ! », progression, rendu, déblocage d'un enfant, quête perso or seul, journal.

## v2 : Étal (SPEC 10.8)

### Modèle

`packages/shared` :

```ts
Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
RewardCard {
  name: string                 // non vide
  description: string          // défaut ''
  rarity: Rarity
  price: int >= 1
  cooldownDays?: int 1..3650   // absent : rachetable à volonté
  unique: boolean              // défaut false : archivée après achat
}
DEFAULT_COOLDOWN: { common: 1, uncommon: 7, rare: 30, epic: 90, legendary: 365 }
```

Base, migration 4 :

- `reward_cards` (id, definition JSON, archived 0/1, created_at, updated_at).
- `purchases` (id, card_id, snapshot JSON `{ name, rarity, price }`, purchased_at, undone_at nullable, archived_card 0/1 : la carte a été archivée par cet achat, created_at).
- `gold_events.purchase_id` nullable (ALTER TABLE ADD COLUMN) ; raisons `purchase` et `purchase-undo`.
- Objectif d'épargne : préférence `savingsGoal` (id de carte), table `preferences` existante.

Logique pure (`packages/shared/src/logic/market.ts`) :

- `cardAvailability(card, archived, purchases, balance, now)` : `ok` ou raison (`archived`, `cooldown` avec jour de disponibilité et jours restants, `insufficient` avec or manquant). Les achats annulés sont ignorés.
- `canUndoPurchase(purchase)` : refusé seulement si déjà annulé.
- `weeklyIncome(goldEvents, now)` : or des 4 dernières semaines (raisons `quest` et `quest-undo`) divisé par 4 ; `savingsEstimate(price, balance, income)` : semaines restantes arrondies au-dessus, `null` sans revenu, 0 si atteint.
- Barème : `questGold` ignore l'or d'un talent déjà au rang max (SPEC 10.5).

### Phases

12a. **Shared, Étal** : schéma `RewardCardSchema` (+ `export-schema` si exposé), `market.ts`, changement de `questGold`. Tests : recharge sur les bords de jour, achat annulé ignoré pour la recharge, solde exact égal au prix accepté, estimation d'épargne (revenu nul, objectif atteint), talent au max sans or.
12b. **Serveur, Étal** : migration 4, `market-repository.ts`, routes `apps/server/src/market.ts` (`GET /market` : cartes avec état, archivées, objectif et estimation, solde ; CRUD `/reward-cards`, `PUT /reward-cards/:id/archive` ; `POST /reward-cards/:id/purchase` (date facultative) ; `POST /purchases/:id/undo` ; `PUT /market/goal`). `/gold` renvoie aussi le nom de la carte des événements d'achat. Sauvegarde étendue (champs facultatifs). Tests d'API : achat refusé (solde, recharge, archivée), achat unique archive puis annulation réactive, annulation deux fois refusée (409), restauration d'une ancienne sauvegarde sans Étal.
12c. **Front, Étal** : onglet « Étal », page `apps/web/src/pages/MarketPage.tsx` et `components/market/` (carte avec couleur de rareté en variables CSS du thème, dialogue d'achat, formulaire de carte avec recharge pré-remplie selon la rareté, objectif d'épargne), entrées d'achat dans le journal avec « Annuler l'achat ».
12d. **Contenu** : chargement du catalogue initial (SPEC 10.8) via l'API sur la vraie base, après accord, et vérification des prix sur l'Étal.

### Vérification

- 12a et 12b : `npm test`, `npm run lint`, `npm run typecheck` ; `curl` sur un serveur isolé (port 3101, `WOWG_DATA_DIR` dans le scratchpad) : gagner de l'or via une quête perso sans talent, acheter, recharge refusée, annuler depuis l'API.
- 12c : parcours dans Chrome sur le serveur isolé (port 5174) : création de cartes des 5 raretés, achat, carte en recharge, achat unique archivé, annulation depuis le journal, objectif d'épargne. Captures pour valider les couleurs de rareté.
- 12d : le service `wowg` est redémarré (`systemctl --user restart wowg`) pour servir la nouvelle version.
