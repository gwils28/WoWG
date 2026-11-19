import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type AcceptQuest } from '../../lib/api';
import { useToast } from '../Toast';
import type { CustomQuestInput } from '@wowg/shared';

/** Données touchées par une action de quête : rangs, niveau, or, journal. */
const AFFECTED = ['quests', 'character', 'specs', 'spec', 'journal', 'gold'];

/** Mutations des quêtes, avec rafraîchissement et messages communs. */
export function useQuestActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const onSuccess = () => {
    for (const key of AFFECTED) void qc.invalidateQueries({ queryKey: [key] });
  };
  const onError = (e: Error) =>
    toast(e instanceof ApiError ? e.errors.join(', ') : e.message, 'error');
  const opts = { onSuccess, onError };

  return {
    accept: useMutation({ mutationFn: (b: AcceptQuest) => api.acceptQuest(b), ...opts }),
    setDeadline: useMutation({
      mutationFn: (v: { runId: number; deadline: string | null }) =>
        api.setDeadline(v.runId, v.deadline),
      ...opts,
    }),
    setStep: useMutation({
      mutationFn: (v: { runId: number; index: number; done: boolean }) =>
        api.setStep(v.runId, v.index, v.done),
      ...opts,
    }),
    addTick: useMutation({
      mutationFn: (v: { runId: number; occurredAt?: string }) => api.addTick(v.runId, v.occurredAt),
      ...opts,
    }),
    removeTick: useMutation({
      mutationFn: (v: { runId: number; tickId: number }) => api.removeTick(v.runId, v.tickId),
      ...opts,
    }),
    complete: useMutation({
      mutationFn: (v: { runId: number; note?: string; occurredAt?: string }) =>
        api.completeQuest(v.runId, { note: v.note, occurredAt: v.occurredAt }),
      ...opts,
    }),
    abandon: useMutation({ mutationFn: (runId: number) => api.abandonQuest(runId), ...opts }),
    undo: useMutation({ mutationFn: (runId: number) => api.undoQuest(runId), ...opts }),
    saveCustom: useMutation({
      mutationFn: (v: { id?: number; quest: CustomQuestInput }) =>
        v.id === undefined ? api.createCustomQuest(v.quest) : api.updateCustomQuest(v.id, v.quest),
      ...opts,
    }),
    deleteCustom: useMutation({ mutationFn: (id: number) => api.deleteCustomQuest(id), ...opts }),
    toast,
  };
}

export type QuestActions = ReturnType<typeof useQuestActions>;
