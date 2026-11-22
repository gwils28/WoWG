import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useToast } from './Toast';

/** Archive une classe (lecture seule, hors niveau) ou la réactive (SPEC 11). */
export function ArchiveButton({
  domainId,
  name,
  archived,
}: {
  domainId: string;
  name: string;
  archived: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: () => api.archiveDomain(domainId, !archived),
    onSuccess: () => {
      toast(archived ? `${name} réactivée` : `${name} archivée`);
      for (const key of ['character', 'specs', 'spec', 'quests'])
        void qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.errors.join(', ') : e.message, 'error'),
  });
  return (
    <button
      type="button"
      className="btn btn--ghost btn--small"
      title={
        archived
          ? `Réactiver ${name} : elle revient dans les classes et compte de nouveau pour le niveau`
          : `Archiver ${name} : lecture seule, hors niveau et hors quêtes, réactivable`
      }
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {archived ? 'Réactiver' : 'Archiver'}
    </button>
  );
}
