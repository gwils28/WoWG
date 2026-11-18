import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useToast } from './Toast';

/** Étoile pour épingler une classe. */
export function PinButton({
  domainId,
  name,
  pinned,
}: {
  domainId: string;
  name: string;
  pinned: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const pin = useMutation({
    mutationFn: () => api.pinDomain(domainId, !pinned),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['character'] }),
    onError: (e) => toast(e instanceof ApiError ? e.errors.join(', ') : e.message, 'error'),
  });
  const label = pinned ? `Désépingler ${name}` : `Épingler ${name}`;
  return (
    <button
      type="button"
      className={`pin${pinned ? ' pin--on' : ''}`}
      aria-pressed={pinned}
      aria-label={label}
      title={label}
      disabled={pin.isPending}
      onClick={() => pin.mutate()}
    >
      {pinned ? '★' : '☆'}
    </button>
  );
}
