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
- Objectifs / quêtes : talents ciblés avec échéance, suivi sur l'accueil.

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
