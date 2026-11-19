import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, NavLink } from 'react-router';
import { diffTrees, parseTree, type TreeFile } from '@wowg/shared';
import { api, ApiError } from '../lib/api';
import { classPath, specPath } from '../lib/classes';
import { errorsByTalent, isCellFree, newTalentAt } from '../lib/editor';
import { talentQuestMarks } from '../lib/quests';
import { DiffSummary, diffMarks, hasChanges } from '../components/DiffSummary';
import { GameIcon } from '../components/GameIcon';
import { PinButton } from '../components/PinButton';
import { SpecEditor, TalentEditor } from '../components/TalentEditor';
import { TalentTree } from '../components/TalentTree';
import { useToast } from '../components/Toast';
import { useRankActions } from '../components/useRankActions';

export function SpecializationPage({ id }: { id: string }) {
  const toast = useToast();
  const [draftState, setDraft] = useState<TreeFile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const spec = useQuery({ queryKey: ['spec', id], queryFn: () => api.specialization(id) });
  const all = useQuery({ queryKey: ['specs'], queryFn: api.specializations });
  const character = useQuery({ queryKey: ['character'], queryFn: api.character });

  // un brouillon n'appartient qu'à sa spécialisation (changement de route = brouillon ignoré)
  const draft = draftState?.specialization.id === id ? draftState : null;

  const { onAdd, onRemove, dialog, refresh, onError } = useRankActions(
    id,
    spec.data?.tree,
    spec.data?.ranks ?? {},
  );
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
        <Link to={classPath(tree.domain.id)} className="spec-page__all">
          Les {siblings.length} arbres de la classe
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
                onAdd={onAdd}
                onRemove={onRemove}
                quests={talentQuestMarks(tree, spec.data.questStates)}
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

      {dialog}
    </div>
  );
}
