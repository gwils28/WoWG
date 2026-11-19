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

- Phase 8 : talent récompensé verrouillé au moment du rendu (cas possible après un retrait de rang manuel, ou pour une quête personnelle) : rendu refusé avec le motif, comme un clic sur le talent. Seuls un talent au rang max, supprimé ou d'un arbre disparu sont ignorés.
- Phase 8 : au rendu, les talents sont traités par palier croissant (un parent récompensé passe avant son enfant) ; à l'annulation, par palier décroissant.
- Phase 8 : annuler un rendu est refusé si le rang a déjà été retiré à la main (pas de -1 sans effet dans l'historique).
- Phase 8 : une quête rapporte au moins 1 or, même si ses talents sont introuvables.
- Phase 8 : périodes du rythme et échéance calculées sur la partie date UTC, comme le journal (même décalage possible entre minuit et 1 h heure de Paris).
- Phase 8 : `quests` reste absent (pas `[]`) dans un arbre qui n'en a pas, pour que l'édition dans l'app ne réécrive pas les 36 arbres existants. L'éditeur met à jour les quêtes quand un talent est renommé, et retire un talent supprimé des quêtes (une quête sans talent restant est supprimée).
- Phase 8 : le diff d'import signale aussi les quêtes ajoutées, modifiées, supprimées (affiché dans la page Import, compté dans « aucune différence »).

- Hors plan (entre phases 6 et 7) : classes. La barre du haut ne liste plus les domaines (intenable à plusieurs dizaines) : onglet « Classes » qui ouvre directement la page `/classes` (recherche, tri, épingles). La fiche personnage n'affiche plus de classes. Une classe s'ouvre sur `/classe/:domaine/:spé` ; `/specialisation/:id` redirige. Les épingles sont dans la table `preferences` (migration 2) et dans la sauvegarde (champ `preferences` facultatif : une sauvegarde plus ancienne se restaure sans épingle). Activité d'une classe (tri « récentes ») = dernier import ou dernière saisie de rang (date d'enregistrement, pas la date déclarée).
- Hors plan : niveau plafonné à 100 (courbe inchangée, 4 950 points), 5 paliers de 20 niveaux (Novice, Initié, Aguerri, Vétéran, Légende) avec un portrait par palier sur la fiche personnage.
- Portraits : rendus du jeu, donc jamais versionnés (règle « aucun asset Blizzard » pour le dépôt). Dossier `portraits/` ignoré par git (`WOWG_PORTRAITS_DIR`), fichiers `palier-1.png` à `palier-5.png` (png, jpg ou webp), servis par `GET /api/portraits/:palier`. Sans fichier, un emblème générique s'affiche. Les rendus d'origine (fond à motif d'un site de rendu) ont été détourés en PNG transparents ; le fond de scène est généré en CSS.
- Phase 6 : le jour d'un événement (regroupement du journal, filtres `from`/`to`) est la partie date de `occurredAt` stocké en UTC. Une date saisie est exacte ; un retrait (horodaté à l'instant, en UTC) fait entre minuit et 1 h heure de Paris est rangé la veille. Accepté pour l'instant.
- Phase 6 : la sauvegarde est sur la page Journal (pas de page dédiée). La restauration fait un contrôle minimal côté client (format, listes présentes) pour la confirmation ; la validation complète reste celle du serveur.
- Phase 5 : `diffTrees` ne signale plus que les orphelins créés par le changement (une progression déjà orpheline n'est pas répétée à chaque import ou édition).
- Phase 5 : en édition, le domaine et la grille ne sont pas modifiables dans l'app (à changer dans le fichier via la skill). L'identifiant d'un talent n'est modifiable que tant qu'il n'est pas enregistré ; pour un nouveau talent, il suit le nom tant qu'il n'a pas été personnalisé.
- Phase 5 : quitter la page en cours d'édition jette le brouillon sans confirmation.
- Phase 4 : règle de validation ajoutée, une flèche de prérequis ne doit traverser aucun talent (`arrowCells` dans `schema.ts`, même tracé que l'UI). La fixture a été ajustée (récupération en colonne 3).
- Phase 4 : à la lecture (base, sauvegarde), seul `TreeFileStructureSchema` est appliqué, pour qu'une règle ajoutée plus tard ne rende pas les données existantes illisibles. Les règles croisées s'appliquent à l'écriture (import, édition).

- Phase 3 : toutes les routes sont dans `apps/server/src/app.ts` (environ 250 lignes) plutôt qu'un dossier `routes/`. À découper si le fichier grossit.

## Pièges

- Avant de lancer un serveur de test, vérifier que les ports sont libres (`ss -ltn`) et lire le log de démarrage : si l'utilisateur a déjà `npm run dev` sur 3001, le serveur de test plante (EADDRINUSE) et les requêtes partent vers la vraie base. Utiliser `PORT=3101 WOWG_API_PORT=3101` et Vite en `--port 5174 --strictPort`, puis vérifier que `/api/character` répond avec une base vide avant d'écrire.
- La validation d'un arbre ignore les clés inconnues : une clé mal placée (ex. `description` à la racine au lieu de `specialization.description`) passe sans erreur.
- Écrire une séquence d'échappement unicode (antislash u + 4 chiffres) dans un appel d'outil la transforme en vrai caractère (constaté pour le tiret cadratin et pour les diacritiques combinants d'une regex). Utiliser des classes Unicode (`\p{Diacritic}`) ou `String.fromCharCode`.
- Le bundle web dépasse 500 kB à cause de la collection d'icônes embarquée (hors ligne voulu). Acceptable en local ; à découper si besoin.
- `npm audit` signale `picomatch` (ReDoS) : dépendance d'outillage de dev uniquement, non embarquée.
- `npm i -w <paquet> @wowg/shared` échoue (le paquet n'est pas sur le registre) : ajouter `"@wowg/shared": "*"` à la main dans `dependencies`, puis `npm i`.
- Ne pas arrêter le serveur de test avec `pkill -f` sur un motif présent dans la commande en cours : cela tue aussi le shell.
- npm 11 bloque les scripts d'installation : `esbuild` (via tsx/vitest) fonctionne sans son postinstall, qui n'est qu'une vérification.
- Écrire la séquence d'échappement unicode du tiret cadratin dans un appel d'outil la transforme en vrai caractère, et le hook bloque. Dans un script, utiliser `chr(0x2014)` (Python) ou `String.fromCharCode(0x2014)` (JS).
