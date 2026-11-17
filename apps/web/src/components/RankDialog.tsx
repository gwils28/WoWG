import { useEffect, useRef, useState } from 'react';
import type { Talent } from '@wowg/shared';
import { GameIcon } from './GameIcon';

// date locale (et non UTC) au format AAAA-MM-JJ
const today = () => new Date().toLocaleDateString('sv-SE');

interface Props {
  talent: Talent;
  currentRank: number;
  pending: boolean;
  onConfirm: (body: { note?: string; occurredAt: string }) => void;
  onCancel: () => void;
}

/** Saisie facultative d'une note et de la date avant de monter un rang. */
export function RankDialog({ talent, currentRank, pending, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today);

  useEffect(() => {
    ref.current?.showModal();
    // showModal place le focus sur le premier champ (la date) : on le met sur la note
    noteRef.current?.focus();
  }, []);

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
          onConfirm({ note: note.trim() || undefined, occurredAt: date });
        }}
      >
        <header className="dialog__header">
          <span className="dialog__icon">
            <GameIcon icon={talent.icon} size={36} />
          </span>
          <div>
            <h2 className="dialog__title">{talent.name}</h2>
            <div className="dialog__sub">
              Rang {currentRank} → {currentRank + 1} / {talent.maxRank}
            </div>
          </div>
        </header>
        <p className="dialog__criterion">{talent.ranks[currentRank]}</p>
        <label className="field">
          <span>Date</span>
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Note (facultative)</span>
          <textarea
            ref={noteRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Lien, ressenti, contexte..."
          />
        </label>
        <footer className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn btn--gold" disabled={pending}>
            Valider le rang
          </button>
        </footer>
      </form>
    </dialog>
  );
}
