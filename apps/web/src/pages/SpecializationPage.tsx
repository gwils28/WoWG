import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, useParams } from 'react-router';
import { canAddRank, canRemoveRank, type Talent } from '@wowg/shared';
import { api, ApiError, type SpecDetail } from '../lib/api';
import { GameIcon } from '../components/GameIcon';
import { RankDialog } from '../components/RankDialog';
import { TalentTree } from '../components/TalentTree';
import { useToast } from '../components/Toast';

export function SpecializationPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState<Talent | null>(null);

  const spec = useQuery({ queryKey: ['spec', id], queryFn: () => api.specialization(id) });
  const all = useQuery({ queryKey: ['specs'], queryFn: api.specializations });

  const onSuccess = (detail: SpecDetail) => {
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
      onSuccess(res.specialization);
      setAdding(null);
      const rank = res.specialization.ranks[v.talent.id] ?? 0;
      toast(`${v.talent.name} : rang ${rank}/${v.talent.maxRank}`);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (talent: Talent) => api.removeRank(id, talent.id),
    onSuccess: (res) => onSuccess(res.specialization),
    onError,
  });

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

  return (
    <div className="spec-page">
      <header className="spec-page__header">
        <GameIcon icon={tree.domain.icon} size={28} className="domain__icon" />
        <h1>{tree.domain.name}</h1>
      </header>

      <div className="spec-layout">
        <section className="panel tree-panel">
          <header className="tree-panel__header">
            <span className="tree-panel__icon">
              <GameIcon icon={tree.specialization.icon} size={30} />
            </span>
            <div>
              <h2>{tree.specialization.name}</h2>
              <p className="muted">{tree.specialization.description}</p>
            </div>
            <span className="tree-panel__points">
              {points}
              <small>/{maxPoints}</small>
            </span>
          </header>

          <div className="tree-scroll">
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
          </div>
          <p className="hint">
            Clic : monter un rang · Maj + clic : sans note · Clic droit : retirer
          </p>

          {orphans.length > 0 && (
            <div className="notice">
              Progression orpheline (talents retirés de l'arbre) :{' '}
              {orphans.map((o) => `${o.talentId} (${o.rank})`).join(', ')}
            </div>
          )}
        </section>

        {siblings.length > 1 && (
          <nav className="panel spec-tabs" aria-label="Spécialisations du domaine">
            {siblings.map((s) => (
              <NavLink key={s.id} to={`/specialisation/${s.id}`} className="spec-tab">
                <GameIcon icon={s.specialization.icon} size={24} />
                <span>{s.specialization.name}</span>
                <small>
                  {s.points}/{s.maxPoints}
                </small>
              </NavLink>
            ))}
          </nav>
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
