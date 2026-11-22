import type { MarketCard } from '../../lib/api';
import { availabilityLabel, cooldownLabel, RARITY_LABEL } from '../../lib/market';
import { GameIcon } from '../GameIcon';
import { GoldAmount } from '../quests/QuestParts';
import type { MarketActions } from './useMarketActions';

/** Carte de l'Étal : bordure et titre à la couleur de sa rareté. */
export function RewardCardTile({
  card,
  isGoal,
  actions,
  onBuy,
  onEdit,
}: {
  card: MarketCard;
  isGoal: boolean;
  actions: MarketActions;
  onBuy: (card: MarketCard) => void;
  onEdit: (card: MarketCard) => void;
}) {
  const a = card.availability;
  const state = a.ok ? 'ok' : a.reason;
  return (
    <article
      className={`reward-card reward-card--${card.rarity}${a.ok ? '' : ' reward-card--blocked'}`}
    >
      <header className="reward-card__head">
        <div className="reward-card__title">
          <h3>{card.name}</h3>
          <span className="reward-card__rarity">{RARITY_LABEL[card.rarity]}</span>
        </div>
        <GoldAmount amount={card.price} />
      </header>
      {card.description && <p className="reward-card__desc">{card.description}</p>}
      <p className="reward-card__meta muted">
        {cooldownLabel(card)}
        {card.purchaseCount > 0 && ` · acheté ${card.purchaseCount} fois`}
      </p>
      <footer className="reward-card__foot">
        <span className={`reward-card__state reward-card__state--${state}`}>
          {availabilityLabel(a)}
        </span>
        <div className="reward-card__actions">
          {card.archived ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={actions.archive.isPending}
              onClick={() => actions.archive.mutate({ id: card.id, archived: false })}
            >
              Réactiver
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`pin${isGoal ? ' pin--on' : ''}`}
                title={
                  isGoal ? "Retirer l'objectif d'épargne" : "Épingler comme objectif d'épargne"
                }
                aria-label={
                  isGoal ? "Retirer l'objectif d'épargne" : "Épingler comme objectif d'épargne"
                }
                aria-pressed={isGoal}
                disabled={actions.setGoal.isPending}
                onClick={() => actions.setGoal.mutate(isGoal ? null : card.id)}
              >
                <GameIcon icon="game-icons:pin" size={16} />
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => onEdit(card)}
              >
                Modifier
              </button>
              <button
                type="button"
                className="btn btn--gold btn--small"
                disabled={!a.ok}
                onClick={() => onBuy(card)}
              >
                Acheter
              </button>
            </>
          )}
        </div>
      </footer>
    </article>
  );
}
