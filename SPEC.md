# SPEC : WoWG, arbre de talents de progression personnelle

Issue de l'interview du 2026-11-17. Cette spec sert d'entrée à une session propre (mode plan, puis implémentation).

## 1. Objectif

Web app locale pour suivre sa progression dans des domaines d'intérêt sous forme d'arbres de talents inspirés de WoW (version classique) : talents à rangs, prérequis visualisés par des flèches, niveau de personnage, journal.

## 2. Concepts et vocabulaire

| Terme             | Définition                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Domaine           | Grand thème (ex. Sport / santé, Langues / culture). Contient 2 à 3 spécialisations.                                      |
| Spécialisation    | Un arbre de talents (ex. Langues : Anglais, Japonais).                                                                   |
| Talent            | Nœud de l'arbre : nom, description, icône, position (palier, colonne), rang max (1 à 5).                                 |
| Rang              | Niveau d'un talent (ex. 2/5). Chaque rang a un critère concret décrit en texte (ex. "Tenir 20 min de conversation").     |
| Prérequis         | Lien parent vers enfant : l'enfant se débloque quand le parent atteint le rang requis (par défaut : rang max du parent). |
| Événement de rang | Gain ou retrait d'un rang, daté, avec note facultative. Source de vérité de la progression.                              |

Domaines initiaux : Sport / santé, Langues / culture.

## 3. Règles métier

- Taille d'un arbre : environ 20 à 30 talents sur 6 à 7 paliers, 1 à 5 rangs chacun, un talent "ultime" au dernier palier.
- Débloquage : prérequis uniquement. Pas de plafond de points, pas de seuil de points par palier.
- Un talent sans prérequis du palier 1 est toujours disponible.
- Monter un rang : un clic, date automatique (modifiable), note facultative (texte, lien).
- Pas de déclin : un rang acquis est définitif. Retrait manuel possible (crée un événement "retrait").
- Retirer un rang d'un parent qui rendrait un enfant invalide : refusé avec message explicite (comme WoW).
- Rang courant d'un talent = somme des événements (jamais stocké en double).
- Niveau de personnage : dérivé du total de rangs acquis, toutes spécialisations confondues (formule à fixer au plan, ex. courbe croissante pour que les premiers niveaux viennent vite).

## 4. Génération des arbres (via Claude Code, pas d'IA dans l'app)

- Un schéma unique (zod, dans `packages/shared`) décrit un fichier d'arbre ; un JSON Schema en est exporté.
- Skill Claude Code `generate-tree` : à partir d'une description du domaine / de la spécialisation et de mon niveau actuel, produit `trees/<domaine>/<specialisation>.json`, valide le fichier avec un script, et itère sur mes demandes de modification.
- Les fichiers `trees/**` sont versionnés dans git.
- Les identifiants de talents sont stables (slug) pour que la progression survive à une régénération.

## 5. Import et édition dans l'app

- Import d'un fichier d'arbre (sélection depuis `trees/` ou upload) avec prévisualisation rendue comme l'arbre final.
- Lors d'une réimport d'un arbre existant : diff (talents ajoutés, modifiés, supprimés). La progression des talents supprimés est conservée mais signalée "orpheline" (pas d'effacement silencieux).
- Édition manuelle d'un talent dans l'app : nom, description, icône, rangs, critères, prérequis, position. Validation par le même schéma.
- Export de l'arbre édité vers `trees/` pour garder git comme source de référence (à confirmer au plan : écriture directe ou téléchargement).

## 6. Interface

- Style : fantasy sombre inspiré de WoW, original. Cadres dorés, icônes dans des cases, grille paliers x colonnes, flèches de prérequis, états visuels distincts (verrouillé, disponible, en cours, maxé).
- Aucun asset Blizzard. Icônes : jeu libre type game-icons.net (CC BY 3.0, attribution dans l'app) ou équivalent.
- Infobulle au survol : nom, rang courant / max, description, critère du prochain rang, prérequis manquants.
- Clic gauche : monter un rang (ouvre une petite saisie de note facultative). Clic droit : retirer un rang.
- Écrans : accueil (fiche perso + domaines), vue spécialisation (arbre), journal, import / édition.
- Cible : PC uniquement, desktop, localhost.

## 7. Périmètre

### MVP (v1)

- Schéma d'arbre + skill `generate-tree`.
- Import avec prévisualisation et diff, édition de talents.
- Affichage des arbres, rangs avec notes, règles de prérequis.
- Journal (timeline des événements, filtres par domaine / spécialisation / période).
- Niveau de personnage et fiche perso.
- Export / import JSON de toute la progression (sauvegarde).

### v2

- Succès (achievements) débloqués automatiquement (ex. premier talent ultime, 10 rangs en un mois).
- Quêtes et or : voir section 10 (spécifiée le 2026-11-19).
- Boutique de récompenses réelles payées en or (section 10.8, à spécifier).

### Hors périmètre pour l'instant

- Mobile, hébergement distant, multi-utilisateur, authentification, IA intégrée à l'app.

## 8. Technique

- Monorepo TypeScript, workspaces npm :
  - `apps/web` : React + Vite, rendu de l'arbre en SVG + HTML.
  - `apps/server` : Node + Hono, SQLite (better-sqlite3, ORM léger type Drizzle à confirmer).
  - `packages/shared` : schémas zod, types, logique métier pure (débloquage, rang courant, niveau) testée unitairement.
- Base SQLite dans `data/` (hors git). Définitions d'arbres dans `trees/` (versionnées).
- Tests : Vitest (logique métier en priorité), tests d'API sur le serveur.
- Formatage : Prettier + ESLint.

## 9. Questions ouvertes (à trancher au plan)

1. Formule exacte du niveau de personnage.
2. Export d'un arbre édité : écriture directe dans `trees/` par le serveur ou téléchargement.
3. Source d'icônes et mode d'intégration (sprites locaux, sélecteur d'icône dans l'éditeur).
4. Rang requis par défaut pour un prérequis : rang max du parent (WoW) ou configurable par lien (proposition : configurable, défaut = max).

## 10. Quêtes et or (v2)

Issue de l'interview du 2026-11-19.

### 10.1 Principe

Une quête est une action concrète, éventuellement répétée dans le temps, qui rapporte des rangs de talent et de l'or. Elle ne remplace pas les critères de rang : elle donne un cadre (étapes, rythme, échéance) pour les atteindre. Le clic direct sur un talent reste possible.

| Terme             | Définition                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Quête proposée    | Définie dans le fichier d'arbre (champ `quests`), générée par la skill. Ses récompenses sont dans cet arbre. |
| Quête personnelle | Écrite dans l'app, stockée en base. Récompenses dans n'importe quels arbres, ou or seul.                     |
| Quête répétable   | Quête à rythme : N fois par période (jour, semaine, mois) pendant P périodes réussies.                       |
| Suivi de quête    | Une quête acceptée : date d'acceptation, échéance facultative, étapes cochées, occurrences, état.            |
| Or                | Monnaie virtuelle gagnée en rendant des quêtes, à dépenser plus tard dans la boutique.                       |
| Événement d'or    | Gain ou dépense d'or, daté. Le solde est la somme des événements (jamais stocké en double).                  |

### 10.2 Définition d'une quête

- Nom, description.
- Récompenses : liste de talents (sans doublon), chacun +1 rang. Une quête personnelle peut n'avoir aucun talent (or seul).
- Étapes : 0 à 10 textes à cocher, facultatif.
- Rythme, facultatif : `{ times, per: "day" | "week" | "month", periods }`. Ex. 3 fois par semaine pendant 4 semaines.
- Taille (`small`, `medium`, `large`) : uniquement pour une quête sans talent, elle fixe l'or.
- Pas d'échéance dans la définition : elle se choisit à l'acceptation (pré-remplie à partir du rythme).

### 10.3 Cycle de vie

1. **Disponible** : une quête proposée est disponible quand tous ses talents récompensés sont débloqués et qu'au moins l'un n'est pas au rang max. Une quête personnelle est toujours disponible. Marqueur « ! » sur le talent concerné.
2. **Acceptée** : un seul suivi actif par quête. L'acceptation fige une copie de la définition dans le suivi : modifier ou supprimer la quête plus tard ne change pas un suivi en cours.
3. **Progression** : cocher des étapes, saisir des occurrences (date automatique, modifiable, comme un rang).
4. **Prête à rendre** : toutes les étapes cochées et rythme atteint. Marqueur « ? » sur le talent.
5. **Rendue** : en une transaction, crée un événement de rang +1 par talent récompensé (rattaché au suivi) et un événement d'or. Un talent déjà au rang max entre-temps est ignoré, l'or reste dû. Note et date facultatives, comme un rang.
6. **Abandonnée** : à tout moment, sans effet. On peut la reprendre à neuf.

- **Refaire** : une quête proposée rendue redevient disponible tant que l'un de ses talents n'est pas au rang max (« une fois par rang »). Une quête personnelle sans talent se refait à volonté.
- **Échéance dépassée** : le suivi reste ouvert, signalé « en retard », et se rend normalement. Aucune pénalité (cohérent avec « pas de déclin »).
- **Annuler un rendu** : crée les événements inverses (-1 rang, -or). Refusé si un retrait de rang est refusé (enfant dépendant) ou si le solde d'or deviendrait négatif.

### 10.4 Rythme

- Les périodes sont calendaires : jour, semaine ISO (lundi au dimanche), mois. La première est celle de l'acceptation.
- Une période est réussie quand elle compte au moins `times` occurrences. Une période ratée ne compte pas mais n'annule rien : il faut `periods` périodes réussies, consécutives ou non.
- Affichage : périodes réussies / requises, occurrences de la période en cours.

### 10.5 Barème d'or (automatique)

- Par talent récompensé au palier p : `1 + floor((p - 1) / 2)` (paliers 1-2 : 1, 3-4 : 2, 5-6 : 3, 7+ : 4). Talent ultime : +2.
- Rythme : `+ ceil(times * periods / 4)` (ex. 3 x 4 semaines : +3).
- Étapes : `+ floor(nombre d'étapes / 3)`.
- Quête sans talent : small 1, medium 2, large 4 (rythme et étapes s'ajoutent).
- Constantes dans `packages/shared`, ajustables. Le montant est calculé et figé à l'acceptation.
- L'or n'entre pas dans le niveau : le niveau reste dérivé des seuls rangs.

### 10.6 Génération (skill `generate-tree`)

- Le champ `quests` est facultatif (`schemaVersion` reste 1, les arbres existants restent valides).
- Repères : environ une quête pour deux talents, au moins un tiers de répétables, la plupart avec un seul talent récompensé, des actions concrètes et vérifiables qui font progresser vers le critère du prochain rang.
- Identifiants de quête stables (slug), uniques dans l'arbre.
- Nouveau mode de la skill : ajouter des quêtes à un arbre existant sans toucher aux talents.
- Import : le diff signale aussi les quêtes ajoutées, modifiées, supprimées.

### 10.7 Interface

- Barre du haut : onglet « Quêtes » (nombre de suivis actifs), solde d'or.
- Page Quêtes : en cours (progression, échéance, « en retard »), disponibles (groupées par classe, classes épinglées d'abord), terminées. Bouton « Nouvelle quête ».
- Arbre : marqueurs « ! » (disponible) et « ? » (prête à rendre) sur les talents. L'infobulle liste les quêtes du talent.
- Rendu : récapitulatif des rangs et de l'or, rappel du critère du prochain rang de chaque talent.
- Journal : rendus de quête, gains d'or. Un rang obtenu par une quête affiche « via quête X ».
- Fiche personnage : solde d'or.
- Sauvegarde : quêtes personnelles, suivis, occurrences, événements d'or (champs facultatifs, une ancienne sauvegarde se restaure sans).

### 10.8 Boutique (phase ultérieure, à spécifier)

Cartes de récompense réelles définies par l'utilisateur (ex. « Un bon café », 2 or). Acheter une carte crée un événement d'or négatif. Le modèle d'événements d'or est conçu pour l'accueillir sans migration de rupture.
