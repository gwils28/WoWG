# WoWG : arbre de talents de progression personnelle

Web app locale (TS full-stack) de suivi de progression sous forme d'arbres de talents inspirés de WoW. Besoin complet : `SPEC.md`.

Plan : `docs/PLAN.md` (MVP phases 0 à 7, v2 phases 8 à 12). Statut : phases 0 à 6 faites (socle, `packages/shared`, skill `generate-tree`, serveur `apps/server`, front `apps/web` : accueil, arbre, import, édition, journal, sauvegarde). Phase 7 en partie : catalogue v2 depuis le 2026-11-22 (SPEC 11), 5 classes par rôle de 3 arbres de 10 paliers (`trees/gardien`, `guerisseur`, `conquerant`, `passeur`, `pisteur`, 899 points) ; les 15 classes v1 (45 arbres de 7 paliers, tag git `catalogue-v1`) restent dans `trees/` mais sont archivées dans l'app (préférence `archivedDomains`, page Archives, lecture seule, phase 13), README restant. Phases 8 à 10 faites (quêtes et or : logique `packages/shared/src/logic/quests.ts`, serveur `apps/server/src/quests.ts`, migration 3, front `apps/web/src/pages/QuestsPage.tsx` et `components/quests/`). Phase 12 (Étal) faite (`packages/shared/src/logic/market.ts`, migration 4, `apps/server/src/market.ts` et `market-repository.ts`, `apps/web/src/pages/MarketPage.tsx` et `components/market/`, limiteur hebdomadaire des quêtes perso) , catalogue initial chargé le 2026-11-21). Phase 11 faite le 2026-11-27 : 15 quêtes par arbre v2 (225), calées sur des journées pleines (NOTES.md). Courbe de niveau : passer de L à L+1 coûte ceil(L/5) points.

## Commandes

- `npm test` (Vitest, tous les paquets), `npm run lint`, `npm run typecheck`
- `npm run validate-tree -- <fichier.json>` : seule validation qui fait foi pour un arbre
- `npm run dev` : API (3001) + Vite (http://127.0.0.1:5173, proxy `/api`). Mêmes variables d'environnement que `npm start`.
- `npm start` : serveur sur http://127.0.0.1:3001 (base `data/wowg.sqlite`, arbres `trees/`). Variables `WOWG_DATA_DIR`, `WOWG_TREES_DIR`, `WOWG_PORTRAITS_DIR` (défaut `portraits/`, hors git), `PORT` pour tester sans toucher aux vraies données.
- Test manuel isolé : l'utilisateur a souvent `npm run dev` ouvert sur 3001/5173 avec la vraie base. Vérifier les ports, puis `PORT=3101 WOWG_API_PORT=3101 WOWG_DATA_DIR=<scratchpad> npx concurrently -k "npm run dev -w @wowg/server" "npm run dev -w @wowg/web -- --port 5174 --strictPort"`.
- `npm run export-schema` : régénère `schemas/tree.schema.json` après toute modif de `schema.ts`

## Façon de travailler

- Je ne commite jamais : l'utilisateur commite lui-même après revue (`/prepare-commit` pour préparer).
- Logique métier (débloquage, rang courant, niveau) dans `packages/shared`, pure et testée avant l'UI.
- Écarts à la spec et choix conservateurs : les consigner dans `NOTES.md`.
- `data/` (SQLite) et `.env` sont interdits en lecture/écriture par `.claude/settings.json`.
- Aucun asset Blizzard (nom, icônes, sons) : le style est inspiré, original.

## Typographie

- N'utilise JAMAIS le tiret cadratin (U+2014), ni dans le code, ni dans les commentaires, ni dans la documentation, ni dans tes réponses.
- À la place, utilise une virgule, deux-points, des parenthèses ou un tiret simple "-".
- Garde-fou : `.claude/hooks/no-em-dash.py`. Dans un script, écris `chr(0x2014)`, jamais l'échappement littéral (l'outil le convertit en caractère).

## Compaction

Conserver : fichiers modifiés, commandes de test, décisions sur le schéma d'arbre et les règles métier.
