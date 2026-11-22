import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RewardCardInput } from '@wowg/shared';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../Toast';

/** Données touchées par une action de l'Étal : cartes, or, journal. */
const AFFECTED = ['market', 'character', 'quests', 'gold'];

/** Mutations de l'Étal, avec rafraîchissement et messages communs. */
export function useMarketActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const onSuccess = () => {
    for (const key of AFFECTED) void qc.invalidateQueries({ queryKey: [key] });
  };
  const onError = (e: Error) =>
    toast(e instanceof ApiError ? e.errors.join(', ') : e.message, 'error');
  const opts = { onSuccess, onError };

  return {
    save: useMutation({
      mutationFn: (v: { id?: number; card: RewardCardInput }) =>
        v.id === undefined ? api.createCard(v.card) : api.updateCard(v.id, v.card),
      ...opts,
    }),
    archive: useMutation({
      mutationFn: (v: { id: number; archived: boolean }) => api.archiveCard(v.id, v.archived),
      ...opts,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.deleteCard(id), ...opts }),
    purchase: useMutation({
      mutationFn: (v: { id: number; occurredAt?: string }) => api.purchase(v.id, v.occurredAt),
      ...opts,
    }),
    undoPurchase: useMutation({
      mutationFn: (purchaseId: number) => api.undoPurchase(purchaseId),
      ...opts,
    }),
    setGoal: useMutation({ mutationFn: (cardId: number | null) => api.setGoal(cardId), ...opts }),
    toast,
  };
}

export type MarketActions = ReturnType<typeof useMarketActions>;
