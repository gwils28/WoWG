# WoWG : arbre de talents de progression personnelle

Web app locale (TS full-stack) de suivi de progression sous forme d'arbres de talents inspirés de WoW. Besoin complet : `SPEC.md`.

Statut : interview terminée, SPEC.md rédigée. Prochaine étape : session propre en mode plan à partir de SPEC.md.

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
