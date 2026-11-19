import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { QuestOrigin, QuestTalentView } from '../../lib/api';
import { formatDay } from '../../lib/journal';
import { GameIcon } from '../GameIcon';

export function GoldAmount({ amount, sign = false }: { amount: number; sign?: boolean }) {
  return (
    <span className="gold" title="Pièces d'or">
      <GameIcon icon="game-icons:two-coins" size={16} />
      {sign && amount > 0 ? '+' : ''}
      {amount}
    </span>
  );
}

/** Talents récompensés : icône, nom, rang courant. */
export function TalentChips({ talents }: { talents: QuestTalentView[] }) {
  if (talents.length === 0) return null;
  return (
    <ul className="quest-talents">
      {talents.map((t) => (
        <li
          key={`${t.specializationId}/${t.talentId}`}
          className={`quest-talent${t.exists ? '' : ' quest-talent--missing'}`}
          title={t.exists ? `${t.specializationName} : ${t.name}` : 'Talent introuvable'}
        >
          {t.icon && <GameIcon icon={t.icon} size={18} />}
          <span>{t.name}</span>
          {t.maxRank !== null && (
            <span className="quest-talent__rank">
              {t.rank}/{t.maxRank}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function OriginLabel({ origin }: { origin: QuestOrigin | null }) {
  return (
    <span className="quest__origin">
      {origin ? `${origin.domain.name} / ${origin.specialization.name}` : 'Quête personnelle'}
    </span>
  );
}

/** Bouton en deux temps (pas de boîte de confirmation du navigateur). */
export function ConfirmButton({
  label,
  confirmLabel = 'Confirmer ?',
  onConfirm,
  className = 'btn btn--ghost btn--small',
  disabled,
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={armed ? 'btn btn--danger btn--small' : className}
      disabled={disabled}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

/** Fenêtre modale native (<dialog>), même habillage que la saisie d'un rang. */
export function Modal({
  title,
  sub,
  icon,
  wide,
  children,
  submitLabel,
  submitDisabled,
  pending,
  onSubmit,
  onClose,
}: {
  title: string;
  sub?: ReactNode;
  icon?: string;
  wide?: boolean;
  children: ReactNode;
  submitLabel: string;
  submitDisabled?: boolean;
  pending?: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' dialog--wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <header className="dialog__header">
          {icon && (
            <span className="dialog__icon dialog__icon--quest">
              <GameIcon icon={icon} size={32} />
            </span>
          )}
          <div>
            <h2 className="dialog__title">{title}</h2>
            {sub && <div className="dialog__sub">{sub}</div>}
          </div>
        </header>
        {children}
        <footer className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--gold" disabled={pending || submitDisabled}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/** « 13 décembre 2026 », sans le jour de la semaine. */
export function shortDay(day: string): string {
  return formatDay(day).replace(/^\S+\s/, '');
}
