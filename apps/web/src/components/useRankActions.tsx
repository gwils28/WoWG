import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { canAddRank, canRemoveRank, type Ranks, type Talent, type TreeFile } from '@wowg/shared';
import { api, ApiError, type SpecDetail } from '../lib/api';
import { RankDialog } from './RankDialog';
import { useToast } from './Toast';

/**
 * Monter / retirer des rangs dans une spécialisation (mode jeu), partagé entre la vue
 * d'une classe (3 arbres) et la page d'une spécialisation.
 */
export function useRankActions(id: string, tree: TreeFile | undefined, ranks: Ranks) {
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState<Talent | null>(null);

  const refresh = (detail: SpecDetail) => {
    qc.setQueryData(['spec', id], detail);
    void qc.invalidateQueries({ queryKey: ['character'] });
    void qc.invalidateQueries({ queryKey: ['specs'] });
    void qc.invalidateQueries({ queryKey: ['journal'] });
    // un rang change la disponibilité des quêtes
    void qc.invalidateQueries({ queryKey: ['quests'] });
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

  const onAdd = (talent: Talent, quick: boolean) => {
    if (!tree) return;
    const check = canAddRank(tree, ranks, talent.id);
    if (!check.ok) return toast(check.reason, 'error');
    if (quick) add.mutate({ talent });
    else setAdding(talent);
  };
  const onRemove = (talent: Talent) => {
    if (!tree) return;
    const check = canRemoveRank(tree, ranks, talent.id);
    if (!check.ok) return toast(check.reason, 'error');
    remove.mutate(talent);
  };

  const dialog = adding && (
    <RankDialog
      talent={adding}
      currentRank={ranks[adding.id] ?? 0}
      pending={add.isPending}
      onCancel={() => setAdding(null)}
      onConfirm={(body) => add.mutate({ talent: adding, ...body })}
    />
  );

  return { onAdd, onRemove, dialog, refresh, onError };
}
