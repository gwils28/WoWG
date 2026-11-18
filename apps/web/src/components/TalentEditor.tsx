import type { Talent, TreeFile } from '@wowg/shared';
import {
  prerequisiteCandidates,
  removeTalent,
  renameTalent,
  setPrerequisites,
  setUltimate,
  uniqueId,
  updateTalent,
  withMaxRank,
} from '../lib/editor';
import { IconPicker } from './IconPicker';

interface Props {
  draft: TreeFile;
  talent: Talent;
  /** Talent absent de la version enregistrée : son id peut encore changer. */
  isNew: boolean;
  currentRank: number;
  errors: string[];
  onChange: (next: TreeFile, selectedId?: string | null) => void;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export function TalentEditor({ draft, talent, isNew, currentRank, errors, onChange }: Props) {
  const patch = (p: Partial<Talent>) => onChange(updateTalent(draft, talent.id, p));
  const candidates = prerequisiteCandidates(draft, talent);
  const byId = new Map(draft.talents.map((t) => [t.id, t]));

  return (
    <div className="editor">
      <h3>Talent</h3>

      {errors.length > 0 && (
        <ul className="editor__errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <label className="field">
        <span>Nom</span>
        <input
          value={talent.name}
          onChange={(e) => {
            const name = e.target.value;
            const others = { ...draft, talents: draft.talents.filter((t) => t.id !== talent.id) };
            // l'id suit le nom tant qu'il vaut ce que le nom actuel aurait généré
            const autoId =
              talent.id.startsWith('nouveau-talent') || talent.id === uniqueId(others, talent.name);
            if (!isNew || !autoId) return patch({ name });
            const id = uniqueId(others, name);
            onChange(updateTalent(renameTalent(draft, talent.id, id), id, { name }), id);
          }}
        />
      </label>

      <label className="field">
        <span>Identifiant {isNew ? '' : '(figé : la progression y est attachée)'}</span>
        <input
          value={talent.id}
          disabled={!isNew}
          onChange={(e) => {
            // normalisation légère pendant la frappe (garde les tirets), la validation fait le reste
            const id = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
            if (!id || draft.talents.some((t) => t.id === id && t.id !== talent.id)) return;
            onChange(renameTalent(draft, talent.id, id), id);
          }}
        />
      </label>

      <label className="field">
        <span>Description</span>
        <textarea
          rows={2}
          value={talent.description}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </label>

      <div className="field">
        <span>Icône</span>
        <IconPicker value={talent.icon} onChange={(icon) => patch({ icon })} />
      </div>

      <div className="editor__row">
        <label className="field">
          <span>Palier</span>
          <select value={talent.tier} onChange={(e) => patch({ tier: Number(e.target.value) })}>
            {range(draft.grid.tiers).map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Colonne</span>
          <select value={talent.column} onChange={(e) => patch({ column: Number(e.target.value) })}>
            {range(draft.grid.columns).map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Rang max</span>
          <select
            value={talent.maxRank}
            onChange={(e) =>
              onChange(updateTalent(draft, talent.id, withMaxRank(talent, Number(e.target.value))))
            }
          >
            {range(5).map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      {currentRank > talent.maxRank && (
        <p className="diff__warn">
          Rang actuel {currentRank} au-dessus du nouveau max {talent.maxRank}.
        </p>
      )}

      <div className="field">
        <span>Critères de rang</span>
        {talent.ranks.map((r, i) => (
          <label key={i} className="editor__rank">
            <span className="editor__rank-num">{i + 1}</span>
            <input
              value={r}
              onChange={(e) =>
                patch({ ranks: talent.ranks.map((x, j) => (j === i ? e.target.value : x)) })
              }
            />
          </label>
        ))}
      </div>

      <div className="field">
        <span>Prérequis</span>
        {talent.prerequisites.length === 0 && <span className="muted">Aucun.</span>}
        {talent.prerequisites.map((p, i) => {
          const parent = byId.get(p.talentId);
          const setRank = (rank?: number) =>
            onChange(
              setPrerequisites(
                draft,
                talent.id,
                talent.prerequisites.map((x, j) => (j === i ? { talentId: x.talentId, rank } : x)),
              ),
            );
          return (
            <div key={p.talentId} className="editor__prereq">
              <span>{parent?.name ?? p.talentId}</span>
              <select
                value={p.rank ?? ''}
                onChange={(e) => setRank(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">rang max</option>
                {range(parent?.maxRank ?? 1).map((n) => (
                  <option key={n} value={n}>
                    rang {n}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() =>
                  onChange(
                    setPrerequisites(
                      draft,
                      talent.id,
                      talent.prerequisites.filter((_, j) => j !== i),
                    ),
                  )
                }
              >
                Retirer
              </button>
            </div>
          );
        })}
        {candidates.length > 0 && (
          <select
            value=""
            onChange={(e) =>
              e.target.value &&
              onChange(
                setPrerequisites(draft, talent.id, [
                  ...talent.prerequisites,
                  { talentId: e.target.value },
                ]),
              )
            }
          >
            <option value="">+ Ajouter un prérequis...</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (palier {c.tier})
              </option>
            ))}
          </select>
        )}
      </div>

      <label className="editor__check">
        <input
          type="checkbox"
          checked={Boolean(talent.ultimate)}
          onChange={(e) => onChange(setUltimate(draft, talent.id, e.target.checked))}
        />
        Talent ultime (dernier palier, un seul par arbre)
      </label>

      <button
        type="button"
        className="btn btn--danger"
        onClick={() => onChange(removeTalent(draft, talent.id), null)}
      >
        Supprimer ce talent
      </button>
    </div>
  );
}

/** Édition des métadonnées de la spécialisation (quand aucun talent n'est sélectionné). */
export function SpecEditor({
  draft,
  onChange,
}: {
  draft: TreeFile;
  onChange: (next: TreeFile) => void;
}) {
  const spec = draft.specialization;
  const patch = (p: Partial<TreeFile['specialization']>) =>
    onChange({ ...draft, specialization: { ...spec, ...p } });
  return (
    <div className="editor">
      <h3>Spécialisation</h3>
      <p className="muted">
        Clique sur un talent pour le modifier, ou sur une case vide (+) pour en créer un.
      </p>
      <label className="field">
        <span>Nom</span>
        <input value={spec.name} onChange={(e) => patch({ name: e.target.value })} />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea
          rows={2}
          value={spec.description}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </label>
      <div className="field">
        <span>Icône</span>
        <IconPicker value={spec.icon} onChange={(icon) => patch({ icon })} />
      </div>
      <p className="muted">
        Domaine « {draft.domain.name} » et grille {draft.grid.tiers} x {draft.grid.columns} : à
        modifier dans le fichier via la skill generate-tree.
      </p>
    </div>
  );
}
