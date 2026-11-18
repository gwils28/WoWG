import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { summarizeBackup, type BackupSummary } from '../lib/journal';
import { useToast } from './Toast';

interface Pending {
  fileName: string;
  data: unknown;
  summary: BackupSummary;
}

/** Export de toute la progression et restauration (qui remplace tout). */
export function BackupPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const restore = useMutation({
    mutationFn: (data: unknown) => api.restoreBackup(data),
    onSuccess: (r) => {
      setPending(null);
      void qc.invalidateQueries();
      toast(
        `Sauvegarde restaurée : ${r.specializations} spécialisation(s), ${r.events} événement(s)`,
      );
    },
    onError: (e) => {
      setPending(null);
      setErrors(e instanceof ApiError ? e.errors : [e.message]);
    },
  });

  async function onFile(file: File) {
    setErrors([]);
    try {
      const data: unknown = JSON.parse(await file.text());
      setPending({ fileName: file.name, data, summary: summarizeBackup(data) });
    } catch (e) {
      setErrors([`${file.name} : ${(e as Error).message}`]);
    }
  }

  return (
    <section className="panel backup">
      <h2 className="backup__title">Sauvegarde</h2>
      <p className="muted">
        Exporte arbres et historique dans un fichier JSON. La restauration remplace toute la
        progression actuelle.
      </p>
      <div className="backup__actions">
        <a className="btn btn--gold" href={api.backupUrl} download>
          Exporter
        </a>
        <label className="upload">
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
              e.target.value = '';
            }}
          />
          <span className="btn btn--ghost">Restaurer...</span>
        </label>
      </div>
      {errors.length > 0 && (
        <div className="editor__errors">
          <strong>Restauration refusée</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {pending && (
        <ConfirmRestore
          pending={pending}
          busy={restore.isPending}
          onConfirm={() => restore.mutate(pending.data)}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}

function ConfirmRestore({
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: Pending;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  const { summary } = pending;
  const exported = summary.exportedAt
    ? new Date(summary.exportedAt).toLocaleString('fr-FR', {
        dateStyle: 'long',
        timeStyle: 'short',
      })
    : 'date inconnue';

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm();
        }}
      >
        <h2 className="dialog__title">Restaurer la sauvegarde ?</h2>
        <p className="muted backup__file">
          {pending.fileName}, exportée le {exported}
        </p>
        <p className="backup__summary">
          {summary.specializations} spécialisation(s) · {summary.events} événement(s)
        </p>
        <p className="backup__warn">
          Toute la progression actuelle (arbres importés et historique des rangs) sera remplacée.
          Les fichiers de <code>trees/</code> ne sont pas modifiés. Pense à exporter d'abord si tu
          veux pouvoir revenir en arrière.
        </p>
        <footer className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn btn--danger" disabled={busy}>
            Tout remplacer
          </button>
        </footer>
      </form>
    </dialog>
  );
}
