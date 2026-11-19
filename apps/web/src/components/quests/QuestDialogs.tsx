import { useState } from 'react';
import { suggestedDeadline } from '@wowg/shared';
import type { QuestOffer, QuestRun } from '../../lib/api';
import { localToday, recurrenceLabel } from '../../lib/quests';
import { GoldAmount, Modal, TalentChips } from './QuestParts';
import type { QuestActions } from './useQuestActions';

/** Accepter une quête : échéance proposée d'après le rythme, vide = sans échéance. */
export function AcceptDialog({
  offer,
  actions,
  onClose,
}: {
  offer: QuestOffer;
  actions: QuestActions;
  onClose: () => void;
}) {
  const [deadline, setDeadline] = useState(() =>
    offer.recurrence ? suggestedDeadline(offer.recurrence, `${localToday()}T12:00:00.000Z`) : '',
  );
  const submit = () =>
    actions.accept.mutate(
      {
        ...(offer.source === 'tree'
          ? { source: 'tree', specializationId: offer.specializationId, questId: offer.questId }
          : { source: 'custom', customQuestId: offer.customQuestId }),
        deadline: deadline || null,
      },
      {
        onSuccess: () => {
          actions.toast(`Quête acceptée : ${offer.name}`);
          onClose();
        },
      },
    );

  return (
    <Modal
      title={offer.name}
      sub={<GoldAmount amount={offer.gold} sign />}
      icon="game-icons:scroll-quill"
      submitLabel="Accepter la quête"
      pending={actions.accept.isPending}
      onSubmit={submit}
      onClose={onClose}
    >
      {offer.description && <p className="dialog__text">{offer.description}</p>}
      <TalentChips talents={offer.talents} />
      {offer.recurrence && <p className="muted">{recurrenceLabel(offer.recurrence)}</p>}
      {offer.steps.length > 0 && (
        <ol className="dialog__steps">
          {offer.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      <label className="field">
        <span>Échéance (facultative)</span>
        <input
          type="date"
          value={deadline}
          min={localToday()}
          onChange={(e) => setDeadline(e.target.value)}
        />
      </label>
    </Modal>
  );
}

/** Rendre une quête : rappel des rangs gagnés et du critère suivant, date et note. */
export function TurnInDialog({
  run,
  actions,
  onClose,
}: {
  run: QuestRun;
  actions: QuestActions;
  onClose: () => void;
}) {
  const [date, setDate] = useState(localToday);
  const [note, setNote] = useState('');
  const talents = run.definition.talents;

  const submit = () =>
    actions.complete.mutate(
      { runId: run.id, occurredAt: date, note: note.trim() || undefined },
      {
        onSuccess: (res) => {
          const skipped = res.skipped.length
            ? ` (${res.skipped.length} talent${res.skipped.length > 1 ? 's' : ''} déjà au max)`
            : '';
          actions.toast(`Quête rendue : +${run.gold} or${skipped}`);
          onClose();
        },
      },
    );

  return (
    <Modal
      title={run.definition.name}
      sub="Rendre la quête"
      icon="game-icons:open-treasure-chest"
      submitLabel="Rendre la quête"
      pending={actions.complete.isPending}
      onSubmit={submit}
      onClose={onClose}
    >
      <ul className="turn-in">
        {talents.map((t) => {
          const maxed = t.maxRank !== null && t.rank >= t.maxRank;
          return (
            <li key={`${t.specializationId}/${t.talentId}`} className="turn-in__talent">
              <div>
                <strong>{t.name}</strong>{' '}
                <span className="muted">
                  {maxed || t.maxRank === null
                    ? 'déjà au rang max, ignoré'
                    : `rang ${t.rank} → ${t.rank + 1} / ${t.maxRank}`}
                </span>
              </div>
              {!maxed && t.nextCriterion && <p className="dialog__criterion">{t.nextCriterion}</p>}
            </li>
          );
        })}
        <li className="turn-in__gold">
          Récompense : <GoldAmount amount={run.gold} sign />
        </li>
      </ul>
      <label className="field">
        <span>Date</span>
        <input
          type="date"
          value={date}
          max={localToday()}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </label>
      <label className="field">
        <span>Note (facultative)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Lien, ressenti, contexte..."
        />
      </label>
    </Modal>
  );
}
