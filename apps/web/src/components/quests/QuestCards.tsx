import { useState } from 'react';
import type { QuestOffer, QuestRun } from '../../lib/api';
import { localToday, periodName, progressLabel, recurrenceLabel } from '../../lib/quests';
import { GameIcon } from '../GameIcon';
import { ConfirmButton, GoldAmount, OriginLabel, shortDay, TalentChips } from './QuestParts';
import type { QuestActions } from './useQuestActions';

const PER_CURRENT = { day: "aujourd'hui", week: 'cette semaine', month: 'ce mois-ci' };

/** Quête en cours : étapes, occurrences, échéance, rendu. */
export function RunCard({
  run,
  actions,
  onTurnIn,
}: {
  run: QuestRun;
  actions: QuestActions;
  onTurnIn: (run: QuestRun) => void;
}) {
  const def = run.definition;
  const rec = run.progress.recurrence;
  const [tickDate, setTickDate] = useState(localToday);
  const progress = progressLabel(run);

  return (
    <article
      className={`quest-card${run.progress.ready ? ' quest-card--ready' : ''}${run.overdue ? ' quest-card--overdue' : ''}`}
    >
      <header className="quest-card__head">
        <span className="quest-card__mark" aria-hidden>
          ?
        </span>
        <div className="quest-card__title">
          <h3>{def.name}</h3>
          <OriginLabel origin={run.origin} />
        </div>
        <GoldAmount amount={run.gold} sign />
      </header>
      {def.description && <p className="quest-card__desc">{def.description}</p>}
      <TalentChips talents={def.talents} />

      {def.steps.length > 0 && (
        <ul className="quest-steps">
          {def.steps.map((step, i) => {
            const done = run.stepsDone.includes(i);
            return (
              <li key={i}>
                <label className={done ? 'quest-step quest-step--done' : 'quest-step'}>
                  <input
                    type="checkbox"
                    checked={done}
                    disabled={actions.setStep.isPending}
                    onChange={(e) =>
                      actions.setStep.mutate({ runId: run.id, index: i, done: e.target.checked })
                    }
                  />
                  {step}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {def.recurrence && rec && (
        <div className="quest-rhythm">
          <p className="quest-rhythm__label">
            <GameIcon icon="game-icons:sands-of-time" size={16} /> {recurrenceLabel(def.recurrence)}
          </p>
          <div className="quest-rhythm__meter" aria-label="Périodes réussies">
            {Array.from({ length: rec.requiredPeriods }, (_, i) => (
              <span
                key={i}
                className={i < rec.successfulPeriods ? 'pip pip--done' : 'pip'}
                aria-hidden
              />
            ))}
          </div>
          <p className="muted quest-rhythm__now">
            {rec.successfulPeriods}/{rec.requiredPeriods} {periodName(rec.per, rec.requiredPeriods)}{' '}
            réussie{rec.successfulPeriods > 1 ? 's' : ''} · {PER_CURRENT[rec.per]} :{' '}
            {rec.currentCount}/{rec.times}
          </p>
          <div className="quest-rhythm__add">
            <input
              type="date"
              value={tickDate}
              max={localToday()}
              min={run.acceptedAt.slice(0, 10)}
              onChange={(e) => setTickDate(e.target.value)}
              aria-label="Date de l'occurrence"
            />
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={actions.addTick.isPending || !tickDate}
              onClick={() => actions.addTick.mutate({ runId: run.id, occurredAt: tickDate })}
            >
              + Occurrence
            </button>
          </div>
          {run.ticks.length > 0 && (
            <ul className="quest-ticks">
              {[...run.ticks]
                .reverse()
                .slice(0, 12)
                .map((t) => (
                  <li key={t.id}>
                    {shortDay(t.occurredAt.slice(0, 10))}
                    <button
                      type="button"
                      className="quest-ticks__remove"
                      aria-label="Retirer cette occurrence"
                      onClick={() => actions.removeTick.mutate({ runId: run.id, tickId: t.id })}
                    >
                      ×
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      <footer className="quest-card__foot">
        <DeadlineField run={run} actions={actions} />
        {progress && <span className="muted quest-card__progress">{progress}</span>}
        <div className="quest-card__actions">
          <ConfirmButton label="Abandonner" onConfirm={() => actions.abandon.mutate(run.id)} />
          <button
            type="button"
            className="btn btn--gold btn--small"
            disabled={!run.progress.ready}
            title={run.progress.ready ? undefined : 'Étapes ou rythme pas encore atteints'}
            onClick={() => onTurnIn(run)}
          >
            Rendre la quête
          </button>
        </div>
      </footer>
    </article>
  );
}

function DeadlineField({ run, actions }: { run: QuestRun; actions: QuestActions }) {
  return (
    <label className={`quest-deadline${run.overdue ? ' quest-deadline--overdue' : ''}`}>
      <span>{run.overdue ? 'En retard, échéance' : 'Échéance'}</span>
      <input
        type="date"
        value={run.deadline ?? ''}
        onChange={(e) =>
          actions.setDeadline.mutate({ runId: run.id, deadline: e.target.value || null })
        }
      />
    </label>
  );
}

/** Quête disponible : résumé et bouton d'acceptation. */
export function OfferCard({
  offer,
  onAccept,
  onEdit,
  actions,
}: {
  offer: QuestOffer;
  onAccept: (offer: QuestOffer) => void;
  onEdit?: () => void;
  actions: QuestActions;
}) {
  return (
    <article className="quest-card quest-card--offer">
      <header className="quest-card__head">
        <span className="quest-card__mark quest-card__mark--available" aria-hidden>
          !
        </span>
        <div className="quest-card__title">
          <h3>{offer.name}</h3>
          {offer.source === 'tree' && offer.origin && (
            <span className="quest__origin">{offer.origin.specialization.name}</span>
          )}
        </div>
        <GoldAmount amount={offer.gold} sign />
      </header>
      {offer.description && <p className="quest-card__desc">{offer.description}</p>}
      <TalentChips talents={offer.talents} />
      <p className="muted quest-card__meta">
        {[
          offer.recurrence && recurrenceLabel(offer.recurrence),
          offer.steps.length > 0 &&
            `${offer.steps.length} étape${offer.steps.length > 1 ? 's' : ''}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <footer className="quest-card__foot">
        {offer.source === 'custom' && onEdit && (
          <div className="quest-card__actions quest-card__actions--start">
            <button type="button" className="btn btn--ghost btn--small" onClick={onEdit}>
              Modifier
            </button>
            <ConfirmButton
              label="Supprimer"
              onConfirm={() => actions.deleteCustom.mutate(offer.customQuestId)}
            />
          </div>
        )}
        <button type="button" className="btn btn--gold btn--small" onClick={() => onAccept(offer)}>
          Accepter
        </button>
      </footer>
    </article>
  );
}

/** Quête rendue : date, récompenses, annulation possible. */
export function CompletedRow({ run, actions }: { run: QuestRun; actions: QuestActions }) {
  const granted = new Set((run.grants ?? []).map((g) => `${g.specializationId}/${g.talentId}`));
  const talents = run.definition.talents.filter((t) =>
    granted.has(`${t.specializationId}/${t.talentId}`),
  );
  return (
    <li className="quest-done">
      <GameIcon icon="game-icons:checked-shield" size={22} className="quest-done__icon" />
      <div className="quest-done__body">
        <div className="quest-done__head">
          <strong>{run.definition.name}</strong>
          <GoldAmount amount={run.gold} sign />
        </div>
        <div className="muted quest-done__meta">
          {run.completedAt && shortDay(run.completedAt.slice(0, 10))}
          {talents.length > 0 && ` · +1 rang : ${talents.map((t) => t.name).join(', ')}`}
        </div>
        {run.note && <p className="quest-done__note">{run.note}</p>}
      </div>
      <ConfirmButton
        label="Annuler le rendu"
        confirmLabel="Retirer rangs et or ?"
        onConfirm={() => actions.undo.mutate(run.id)}
      />
    </li>
  );
}
