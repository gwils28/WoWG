import type { Talent, TreeDiff } from '@wowg/shared';

const FIELD_LABELS: Record<keyof Talent, string> = {
  id: 'id',
  name: 'nom',
  description: 'description',
  icon: 'icône',
  tier: 'palier',
  column: 'colonne',
  maxRank: 'rang max',
  ranks: 'critères',
  prerequisites: 'prérequis',
  ultimate: 'ultime',
};

const META_LABELS = { domain: 'domaine', specialization: 'spécialisation', grid: 'grille' };

export function hasChanges(diff: TreeDiff) {
  return (
    diff.isNew ||
    diff.added.length > 0 ||
    diff.removed.length > 0 ||
    diff.modified.length > 0 ||
    diff.metadataChanged.length > 0
  );
}

export function DiffSummary({ diff }: { diff: TreeDiff }) {
  if (diff.isNew) {
    return (
      <div className="diff">
        <p className="diff__line diff__line--added">
          Nouvel arbre : {diff.added.length} talents seront créés.
        </p>
      </div>
    );
  }
  if (!hasChanges(diff)) {
    return <p className="muted">Aucune différence avec la version actuelle.</p>;
  }
  return (
    <div className="diff">
      {diff.metadataChanged.length > 0 && (
        <p className="diff__line">
          Modifié : {diff.metadataChanged.map((k) => META_LABELS[k]).join(', ')}
        </p>
      )}
      {diff.added.length > 0 && (
        <p className="diff__line diff__line--added">
          + {diff.added.length} ajouté{diff.added.length > 1 ? 's' : ''} :{' '}
          {diff.added.map((t) => t.name).join(', ')}
        </p>
      )}
      {diff.modified.length > 0 && (
        <ul className="diff__line diff__line--modified">
          {diff.modified.map((m) => (
            <li key={m.id}>
              ~ {m.name} ({m.fields.map((f) => FIELD_LABELS[f]).join(', ')})
            </li>
          ))}
        </ul>
      )}
      {diff.removed.length > 0 && (
        <p className="diff__line diff__line--removed">
          - {diff.removed.length} supprimé{diff.removed.length > 1 ? 's' : ''} :{' '}
          {diff.removed.map((t) => t.name).join(', ')}
        </p>
      )}
      {diff.orphans.length > 0 && (
        <p className="diff__warn">
          Progression conservée mais orpheline :{' '}
          {diff.orphans.map((o) => `${o.name} (${o.rank} rang${o.rank > 1 ? 's' : ''})`).join(', ')}
        </p>
      )}
      {diff.overflows.length > 0 && (
        <p className="diff__warn">
          Rang actuel au-dessus du nouveau max :{' '}
          {diff.overflows.map((o) => `${o.name} (${o.rank}/${o.maxRank})`).join(', ')}
        </p>
      )}
    </div>
  );
}

export function diffMarks(diff: TreeDiff) {
  const marks: Record<string, 'added' | 'modified'> = {};
  if (diff.isNew) return marks;
  for (const t of diff.added) marks[t.id] = 'added';
  for (const m of diff.modified) marks[m.id] = 'modified';
  return marks;
}
