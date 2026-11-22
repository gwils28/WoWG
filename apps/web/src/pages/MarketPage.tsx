import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type MarketCard } from '../lib/api';
import { groupByRarity, RARITY_GROUP, RARITY_LABEL, savingsLabel } from '../lib/market';
import { GameIcon } from '../components/GameIcon';
import { GoldAmount } from '../components/quests/QuestParts';
import { CardFormDialog, PurchaseDialog } from '../components/market/MarketDialogs';
import { RewardCardTile } from '../components/market/RewardCardTile';
import { useMarketActions } from '../components/market/useMarketActions';

type Open = { kind: 'buy'; card: MarketCard } | { kind: 'form'; card?: MarketCard } | null;

/** Étal : récompenses réelles achetées avec l'or des quêtes (SPEC 10.8). */
export function MarketPage() {
  const market = useQuery({ queryKey: ['market'], queryFn: api.market });
  const actions = useMarketActions();
  const [open, setOpen] = useState<Open>(null);
  const [showArchived, setShowArchived] = useState(false);

  if (market.isPending) return <p className="muted">Chargement...</p>;
  if (market.isError) return <p className="error">{market.error.message}</p>;
  const { balance, weeklyIncome, goal, cards, archived } = market.data;
  const close = () => setOpen(null);
  const tile = (card: MarketCard) => (
    <RewardCardTile
      key={card.id}
      card={card}
      isGoal={goal?.cardId === card.id}
      actions={actions}
      onBuy={(c) => setOpen({ kind: 'buy', card: c })}
      onEdit={(c) => setOpen({ kind: 'form', card: c })}
    />
  );

  return (
    <div className="quests market">
      <header className="quests__header">
        <GameIcon icon="game-icons:swap-bag" size={28} className="domain__icon" />
        <h1>Étal</h1>
        <span className="quests__gold">
          <GoldAmount amount={balance} />
        </span>
        <button type="button" className="btn btn--gold" onClick={() => setOpen({ kind: 'form' })}>
          Nouvelle carte
        </button>
      </header>

      {goal && (
        <section className={`panel savings savings--${goal.rarity}`}>
          <div className="savings__head">
            <GameIcon icon="game-icons:target-arrows" size={22} />
            <h2>Objectif : {goal.name}</h2>
            <span className={`rarity-text rarity-text--${goal.rarity}`}>
              {RARITY_LABEL[goal.rarity]}
            </span>
          </div>
          <div
            className="savings__meter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={goal.price}
            aria-valuenow={Math.min(balance, goal.price)}
          >
            <span style={{ width: `${Math.min(100, (balance / goal.price) * 100)}%` }} />
          </div>
          <p className="savings__text">
            <GoldAmount amount={balance} /> / <GoldAmount amount={goal.price} />
            <span className="muted">
              {' · '}
              {savingsLabel(goal.weeksLeft)}
              {weeklyIncome > 0 && ` (${weeklyIncome} or par semaine)`}
            </span>
          </p>
        </section>
      )}

      {cards.length === 0 && (
        <section className="panel quests__section">
          <p className="muted">
            L'Étal est vide. Crée une carte pour chaque récompense réelle que tu veux t'offrir avec
            l'or de tes quêtes.
          </p>
        </section>
      )}

      {groupByRarity(cards).map((g) => (
        <section key={g.rarity} className="panel quests__section">
          <h2 className={`rarity-text rarity-text--${g.rarity}`}>
            {RARITY_GROUP[g.rarity]} <span className="quests__count">{g.cards.length}</span>
          </h2>
          <div className="quest-grid">{g.cards.map(tile)}</div>
        </section>
      ))}

      {archived.length > 0 && (
        <section className="panel quests__section">
          <button
            type="button"
            className="market__toggle"
            aria-expanded={showArchived}
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? '▾' : '▸'} Archivées{' '}
            <span className="quests__count">{archived.length}</span>
          </button>
          {showArchived && <div className="quest-grid">{archived.map(tile)}</div>}
        </section>
      )}

      {open?.kind === 'buy' && (
        <PurchaseDialog card={open.card} balance={balance} actions={actions} onClose={close} />
      )}
      {open?.kind === 'form' && (
        <CardFormDialog initial={open.card} actions={actions} onClose={close} />
      )}
    </div>
  );
}
