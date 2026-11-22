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
- Étal : récompenses réelles achetées avec l'or (section 10.8, spécifiée le 2026-11-21).

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

- **Refaire** : une quête proposée rendue redevient disponible tant que l'un de ses talents n'est pas au rang max (« une fois par rang »). Une quête personnelle, avec ou sans talent, se refait à volonté, mais se rend au plus une fois par semaine ISO : un rendu est refusé si la même quête personnelle a déjà un rendu non annulé daté de la même semaine (« disponible lundi »). C'est un limiteur, pas une pénalité (anti-farm, avis `economiste-rpg` du 2026-11-21).
- **Échéance dépassée** : le suivi reste ouvert, signalé « en retard », et se rend normalement. Aucune pénalité (cohérent avec « pas de déclin »).
- **Annuler un rendu** : crée les événements inverses (-1 rang, -or). Refusé si un retrait de rang est refusé (enfant dépendant) ou si le solde d'or deviendrait négatif.

### 10.4 Rythme

- Les périodes sont calendaires : jour, semaine ISO (lundi au dimanche), mois. La première est celle de l'acceptation.
- Une période est réussie quand elle compte au moins `times` occurrences. Une période ratée ne compte pas mais n'annule rien : il faut `periods` périodes réussies, consécutives ou non.
- Affichage : périodes réussies / requises, occurrences de la période en cours.

### 10.5 Barème d'or (automatique)

- Par talent récompensé au palier p : `1 + floor((p - 1) / 2)` (paliers 1-2 : 1, 3-4 : 2, 5-6 : 3, 7+ : 4). Talent ultime : +2. Un talent déjà au rang max au moment du calcul ne rapporte pas son or de talent (évite de refaire à l'infini une quête perso pour son or ; ajouté le 2026-11-21).
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

### 10.8 Étal (récompenses réelles)

Issue de l'interview du 2026-11-21, prix proposés par l'agent `economiste-rpg` (`.claude/agents/economiste-rpg.md`).

#### Principe

L'or gagné par les quêtes s'échange contre des récompenses réelles que l'utilisateur s'offre. L'Étal est la page qui présente le catalogue et permet d'acheter. Un achat est consommé immédiatement : pas d'inventaire.

| Terme              | Définition                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Carte              | Récompense du catalogue : nom, description, rareté, prix, recharge, achat unique. Éditable dans l'app. |
| Achat              | Échange d'une carte contre son prix en or, daté. Crée un événement d'or négatif.                       |
| Recharge           | Nombre de jours avant de pouvoir racheter la même carte.                                               |
| Objectif d'épargne | Une carte épinglée, avec la progression du solde vers son prix.                                        |

#### Carte

- Nom, description (y mettre le plafond indicatif en euros, ex. « au plus ~1 000 € »).
- Rareté : commune (blanc), inhabituelle (vert), rare (bleu), épique (violet), légendaire (or orangé).
- Prix : or entier, au moins 1. Prix fixe, pas d'indexation sur le revenu ; révision manuelle, sans effet sur les achats passés.
- Recharge en jours (facultative). Valeur proposée à la création selon la rareté : commune 1, inhabituelle 7, rare 30, épique 90, légendaire 365.
- Achat unique (booléen) : pour un objet durable. La carte est archivée après l'achat.
- Archivée : retirée de la vente, visible dans une section repliée, réactivable. Archiver plutôt que supprimer une carte déjà achetée (l'historique garde une copie de la carte).

#### Achat

- Possible si la carte n'est pas archivée, si le solde couvre le prix et si la recharge est écoulée : la carte redevient achetable le jour `dernier achat + recharge` (jours calendaires, UTC comme le journal). Le dernier achat ignore les achats annulés.
- En une transaction : crée l'achat avec une copie de la carte (nom, rareté, prix) et un événement d'or `-prix` (raison `purchase`). Archive la carte si achat unique. Date modifiable, comme un rang.
- **Annuler un achat** : depuis le journal, sans limite de temps. Crée l'événement inverse `+prix` (raison `purchase-undo`), marque l'achat annulé, réactive la carte si elle avait été archivée par cet achat. Un achat annulé ne se rétablit pas : on rachète.

#### Objectif d'épargne

- Au plus une carte épinglée à la fois (préférence). Affichée en tête de l'Étal : solde / prix, et estimation « environ N semaines » au rythme des 8 dernières semaines (somme divisée par 8, ou par le nombre de semaines écoulées depuis le premier gain d'or s'il y en a moins de 8 ; l'or tombe en bloc en fin de cycle, une fenêtre de 4 semaines serait trop instable) (or gagné par les quêtes, net des annulations de rendu, achats exclus). Sans revenu sur la période : pas d'estimation.
- Une carte archivée ou achetée en achat unique perd son épinglage.

#### Interface

- Barre du haut : onglet « Étal » après « Quêtes ».
- Page Étal : objectif d'épargne, puis cartes groupées par rareté (de commune à légendaire), chacune avec sa couleur de rareté, son prix, et son état (achetable, solde insuffisant, « disponible dans N jours »). Bouton « Acheter » avec confirmation (récapitulatif du prix et du solde après achat). Bouton « Nouvelle carte », édition, archivage, épinglage. Section repliée « Archivées ».
- Journal : achats et annulations d'achat (événements d'or), bouton « Annuler l'achat ».
- Sauvegarde : cartes, achats, objectif d'épargne (champs facultatifs, une ancienne sauvegarde se restaure sans).

#### Catalogue initial (chargé une fois, après la phase 12)

| Rareté       | Carte                              | Prix | Recharge     |
| ------------ | ---------------------------------- | ---- | ------------ |
| Commune      | Take five (20-30 min libres)       | 1    | 1 j          |
| Commune      | Bon café                           | 2    | 1 j          |
| Commune      | Snack gourmand                     | 2    | 1 j          |
| Commune      | Bonne bière                        | 3    | 2 j          |
| Inhabituelle | Cinéma                             | 6    | 7 j          |
| Inhabituelle | 1h30 de jeux vidéo                 | 4    | 2 j          |
| Inhabituelle | Exposition                         | 8    | 7 j          |
| Inhabituelle | Restaurant                         | 10   | 7 j          |
| Rare         | Concert                            | 30   | 30 j         |
| Rare         | Rhum millésimé                     | 40   | 90 j         |
| Rare         | Séjour court (2-3 jours)           | 60   | 60 j         |
| Épique       | Vêtement de qualité                | 80   | 90 j         |
| Épique       | Casque audio                       | 100  | achat unique |
| Épique       | Voyage (Europe, au plus 1 semaine) | 150  | 180 j        |
| Légendaire   | Vélo hollandais                    | 200  | achat unique |
| Légendaire   | Contrebasse                        | 300  | achat unique |
| Légendaire   | Pèlerinage à New York              | 300  | achat unique |

Repères (agent `economiste-rpg`, révisés le 2026-11-21) : revenu de départ environ 24 or/mois (3 quêtes perso), utilisateur assidu en croisière 20 à 26 or/mois (230 à 310 par an), occasionnel 6 à 8 or/mois. Le revenu dépend du nombre de séances par semaine, pas du nombre de quêtes proposées (une séance compte pour une seule quête). Une commune s'achète en quelques jours, une inhabituelle en 1 à 2 semaines, une légendaire demande 9 à 14 mois d'épargne pour un assidu qui épargne tout.

#### Règles d'équilibre (conventions, non imposées par l'app)

- Une quête perso avec talents dure au moins 2 semaines (les cycles courts paient plus par semaine).
- Une séance compte pour une seule quête : abandonner une quête perso quand une quête proposée équivalente est acceptée.
- Quête perso sans talent « large » : au moins 2 h d'effort réel.
- Or qui s'accumule (solde au-delà de 3 mois de revenu sans objectif) : nommer un objectif ou relever les prix de 25 %. Or qui manque (moins d'une commune par semaine pendant un mois) : baisser les communes et inhabituelles plutôt que toucher au barème.
- Révision de l'économie : passer par l'agent `economiste-rpg`.

## 11. Archive des classes et catalogue v2

Décision du 2026-11-22 : le catalogue v1 (15 classes, 45 arbres de 7 paliers) est remplacé par un catalogue v2 de 5 classes, une par rôle de groupe (Tank, Soigneur, DPS, Soutien, Éclaireur), de 3 arbres jusqu'à 10 paliers. La v1 reste consultable.

- Une classe (domaine) peut être **archivée** puis **réactivée** à tout moment. L'état est une préférence (`archivedDomains`), donc inclus dans la sauvegarde.
- Une classe archivée disparaît de l'accueil, de la page Classes et des quêtes proposées. Elle reste consultable dans la page **Archives**, en lecture seule : pas de saisie ni de retrait de rang, pas d'édition, pas de réimport (refus 409).
- Le **niveau** ne compte que les classes actives. L'archive affiche son propre total (points et niveau atteint).
- Une quête d'arbre d'une classe archivée ne peut plus être acceptée, et un suivi en cours ne peut pas être rendu tant que la classe est archivée (abandon possible). L'annulation d'un rendu passé reste possible.
- L'or, l'Étal et le journal ne changent pas : l'historique de la v1 reste dans le journal.
- La progression v2 démarre à zéro : aucun report des rangs v1.
- Courbe de niveau v2 : passer du niveau L au niveau L+1 coûte ceil(L/5) points. Légende (niveau 81) demande 680 points sur environ 900 au catalogue, le niveau 100 en demande 1 030.
