import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, NavLink } from 'react-router';
import {
  canAddRank,
  canRemoveRank,
  diffTrees,
  parseTree,
  type Talent,
  type TreeFile,
} from '@wowg/shared';
import { api, ApiError, type SpecDetail } from '../lib/api';
import { specPath } from '../lib/classes';
import { errorsByTalent, isCellFree, newTalentAt } from '../lib/editor';
import { DiffSummary, diffMarks, hasChanges } from '../components/DiffSummary';
import { GameIcon } from '../components/GameIcon';
import { PinButton } from '../components/PinButton';
import { RankDialog } from '../components/RankDialog';
import { SpecEditor, TalentEditor } from '../components/TalentEditor';
import { TalentTree } from '../components/TalentTree';
import { useToast } from '../components/Toast';

export function SpecializationPage({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState<Talent | null>(null);
  const [draftState, setDraft] = useState<TreeFile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const spec = useQuery({ queryKey: ['spec', id], queryFn: () => api.specialization(id) });
  const all = useQuery({ queryKey: ['specs'], queryFn: api.specializations });
  const character = useQuery({ queryKey: ['character'], queryFn: api.character });

  // un brouillon n'appartient qu'à sa spécialisation (changement de route = brouillon ignoré)
  const draft = draftState?.specialization.id === id ? draftState : null;

  const refresh = (detail: SpecDetail) => {
    qc.setQueryData(['spec', id], detail);
    void qc.invalidateQueries({ queryKey: ['character'] });
    void qc.invalidateQueries({ queryKey: ['specs'] });
    void qc.invalidateQueries({ queryKey: ['journal'] });
  };
  const onError = (e: Error) =>
    toast(e instanceof ApiError ? e.errors.join(', ') : e.message, 'error');

  const add = useMutation({
    mutationFn: (v: { talent: Talent; note?: string; occurredAt?: string }) =>
      api.addRank(id, v.talent.id, { note: v.note, occurredAt: v.occurredAt }),
    onSuccess: (res, v) => {
      refresh(res.specialization);
      setAdding(null);
      const rank = res.specialization.ranks[v.talent.id] ?? 0;
      toast(`${v.talent.name} : rang ${rank}/${v.talent.maxRank}`);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (talent: Talent) => api.removeRank(id, talent.id),
    onSuccess: (res) => refresh(res.specialization),
    onError,
  });
  const save = useMutation({
    mutationFn: (tree: TreeFile) => api.updateSpecialization(id, tree),
    onSuccess: (res) => {
      refresh(res.specialization);
      setDraft(null);
      setSelectedId(null);
      toast(`Arbre enregistré dans trees/${res.specialization.sourcePath}`);
    },
    onError,
  });

  const validation = useMemo(() => (draft ? parseTree(draft) : null), [draft]);
  const errors = validation && !validation.ok ? validation.errors : [];
  const grouped: ReturnType<typeof errorsByTalent> = draft
    ? errorsByTalent(draft, errors)
    : { byTalent: {}, general: [] };

  if (spec.isLoading) return <p className="muted">Chargement...</p>;
  if (spec.error || !spec.data) {
    return (
      <p className="error">
        {spec.error instanceof ApiError ? spec.error.errors.join(', ') : 'Introuvable'}
      </p>
    );
  }
  const { tree, ranks, points, maxPoints, orphans } = spec.data;
  const siblings = (all.data ?? []).filter((s) => s.domain.id === tree.domain.id);
  const shown = draft ?? tree;
  const diff = draft ? diffTrees(tree, draft, ranks) : null;
  const selected = draft && selectedId ? draft.talents.find((t) => t.id === selectedId) : undefined;
  const savedIds = new Set(tree.talents.map((t) => t.id));

  const startEdit = () => {
    setDraft(structuredClone(tree));
    setSelectedId(null);
  };
  const cancelEdit = () => {
    setDraft(null);
    setSelectedId(null);
  };

  return (
    <div className="spec-page">
      <header className="spec-page__header">
        <GameIcon icon={tree.domain.icon} size={28} className="domain__icon" />
        <h1>{tree.domain.name}</h1>
        <PinButton
          domainId={tree.domain.id}
          name={tree.domain.name}
          pinned={character.data?.pinned.includes(tree.domain.id) ?? false}
        />
        <Link to="/classes" className="spec-page__all">
          Toutes les classes
        </Link>
      </header>

      <div className="spec-layout">
        <section className={`panel tree-panel${draft ? ' tree-panel--edit' : ''}`}>
          <header className="tree-panel__header">
            <span className="tree-panel__icon">
              <GameIcon icon={shown.specialization.icon} size={30} />
            </span>
            <div>
              <h2>{shown.specialization.name}</h2>
              <p className="muted">{shown.specialization.description}</p>
            </div>
            {draft ? (
              <span className="badge-edit">Édition</span>
            ) : (
              <span className="tree-panel__points">
                {points}
                <small>/{maxPoints}</small>
              </span>
            )}
          </header>

          <div className="tree-scroll">
            {draft ? (
              <TalentTree
                tree={draft}
                ranks={ranks}
                marks={diff ? diffMarks(diff) : undefined}
                edit={{
                  selectedId,
                  invalidIds: new Set(Object.keys(grouped.byTalent)),
                  onSelect: setSelectedId,
                  onEmptyCell: (tier, column) => {
                    if (!isCellFree(draft, tier, column)) return;
                    const talent = newTalentAt(draft, tier, column);
                    setDraft({ ...draft, talents: [...draft.talents, talent] });
                    setSelectedId(talent.id);
                  },
                }}
              />
            ) : (
              <TalentTree
                tree={tree}
                ranks={ranks}
                onAdd={(talent, quick) => {
                  const check = canAddRank(tree, ranks, talent.id);
                  if (!check.ok) return toast(check.reason, 'error');
                  if (quick) add.mutate({ talent });
                  else setAdding(talent);
                }}
                onRemove={(talent) => {
                  const check = canRemoveRank(tree, ranks, talent.id);
                  if (!check.ok) return toast(check.reason, 'error');
                  remove.mutate(talent);
                }}
              />
            )}
          </div>

          {draft ? (
            <div className="edit-bar">
              {grouped.general.length > 0 && (
                <ul className="editor__errors">
                  {grouped.general.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              {errors.length > 0 ? (
                <p className="error">
                  {errors.length} erreur{errors.length > 1 ? 's' : ''} à corriger (talents en
                  rouge).
                </p>
              ) : (
                diff && <DiffSummary diff={diff} />
              )}
              <div className="edit-bar__actions">
                <button type="button" className="btn btn--ghost" onClick={cancelEdit}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn--gold"
                  disabled={errors.length > 0 || !diff || !hasChanges(diff) || save.isPending}
                  onClick={() => validation?.ok && save.mutate(validation.tree)}
                >
                  Enregistrer
                </button>
              </div>
            </div>
          ) : (
            <div className="tree-panel__footer">
              <p className="hint">
                Clic : monter un rang · Maj + clic : sans note · Clic droit : retirer
              </p>
              <button type="button" className="btn btn--ghost btn--small" onClick={startEdit}>
                Modifier l'arbre
              </button>
            </div>
          )}

          {orphans.length > 0 && (
            <div className="notice">
              Progression orpheline (talents retirés de l'arbre) :{' '}
              {orphans.map((o) => `${o.talentId} (${o.rank})`).join(', ')}
            </div>
          )}
        </section>

        {draft ? (
          <aside className="panel editor-panel">
            {selected ? (
              <TalentEditor
                draft={draft}
                talent={selected}
                isNew={!savedIds.has(selected.id)}
                currentRank={ranks[selected.id] ?? 0}
                errors={grouped.byTalent[selected.id] ?? []}
                onChange={(next, nextSelected) => {
                  setDraft(next);
                  if (nextSelected !== undefined) setSelectedId(nextSelected);
                }}
              />
            ) : (
              <SpecEditor draft={draft} onChange={setDraft} />
            )}
          </aside>
        ) : (
          siblings.length > 1 && (
            <nav className="panel spec-tabs" aria-label="Spécialisations du domaine">
              {siblings.map((s) => (
                <NavLink key={s.id} to={specPath(s.domain.id, s.id)} className="spec-tab">
                  <GameIcon icon={s.specialization.icon} size={24} />
                  <span>{s.specialization.name}</span>
                  <small>
                    {s.points}/{s.maxPoints}
                  </small>
                </NavLink>
              ))}
            </nav>
          )
        )}
      </div>

      {adding && (
        <RankDialog
          talent={adding}
          currentRank={ranks[adding.id] ?? 0}
          pending={add.isPending}
          onCancel={() => setAdding(null)}
          onConfirm={(body) => add.mutate({ talent: adding, ...body })}
        />
      )}
    </div>
  );
}
