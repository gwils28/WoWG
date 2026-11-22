import type { Hono } from 'hono';
import { z } from 'zod';
import {
  canUndoPurchase,
  cardAvailability,
  lastPurchase,
  RARITIES,
  RewardCardSchema,
  savingsEstimate,
  weeklyIncome,
} from '@wowg/shared';
import { transaction, type Db } from './db';
import { badRequest, conflict, DateInput, notFound, readBody, toIso } from './http';
import { createMarketRepository, type StoredRewardCard } from './market-repository';
import type { QuestRepository } from './quest-repository';
import type { Repository } from './repository';

/** Préférence : id de la carte épinglée comme objectif d'épargne. */
export const SAVINGS_GOAL = 'savingsGoal';

const ArchiveBody = z.object({ archived: z.boolean() });
const PurchaseBody = z.object({ occurredAt: DateInput.optional() });
const GoalBody = z.object({ cardId: z.number().int().nullable() });

export function registerMarketRoutes(
  app: Hono,
  {
    db,
    repo,
    questRepo,
    now,
  }: { db: Db; repo: Repository; questRepo: QuestRepository; now: () => string },
) {
  const marketRepo = createMarketRepository(db);

  const requireCard = (raw: string) => {
    const card = marketRepo.getCard(Number(raw));
    if (!card) notFound(`carte "${raw}" inconnue`);
    return card;
  };

  const goalId = (): number | null => {
    const value = repo.preferences()[SAVINGS_GOAL];
    return typeof value === 'number' ? value : null;
  };

  /** Une carte archivée (à la main ou par un achat unique) perd son épinglage. */
  const unpinIfGoal = (cardId: number) => {
    if (goalId() === cardId) repo.setPreference(SAVINGS_GOAL, null);
  };

  const cardView = (stored: StoredRewardCard, balance: number, at: string) => {
    const purchases = marketRepo.listPurchases(stored.id);
    return {
      id: stored.id,
      ...stored.card,
      archived: stored.archived,
      availability: cardAvailability(stored.card, stored.archived, purchases, balance, at),
      lastPurchasedAt: lastPurchase(purchases)?.purchasedAt ?? null,
      purchaseCount: purchases.filter((p) => !p.undoneAt).length,
    };
  };

  const byRarityThenPrice = (a: StoredRewardCard, b: StoredRewardCard) =>
    RARITIES.indexOf(a.card.rarity) - RARITIES.indexOf(b.card.rarity) ||
    a.card.price - b.card.price ||
    a.id - b.id;

  app.get('/market', (c) => {
    const at = now();
    const balance = questRepo.goldBalance();
    const income = weeklyIncome(questRepo.listGoldEvents(), at);
    const cards = marketRepo.listCards().sort(byRarityThenPrice);
    const views = cards.map((card) => cardView(card, balance, at));
    const goalCard = views.find((v) => v.id === goalId() && !v.archived);
    return c.json({
      balance,
      weeklyIncome: Math.round(income * 10) / 10,
      goal: goalCard
        ? {
            cardId: goalCard.id,
            name: goalCard.name,
            rarity: goalCard.rarity,
            price: goalCard.price,
            weeksLeft: savingsEstimate(goalCard.price, balance, income),
          }
        : null,
      cards: views.filter((v) => !v.archived),
      archived: views.filter((v) => v.archived),
    });
  });

  app.post('/reward-cards', async (c) => {
    const card = await readBody(c, RewardCardSchema);
    const stored = marketRepo.createCard(card);
    return c.json(cardView(stored, questRepo.goldBalance(), now()), 201);
  });

  app.put('/reward-cards/:id', async (c) => {
    const stored = requireCard(c.req.param('id'));
    const card = await readBody(c, RewardCardSchema);
    const saved = marketRepo.updateCard(stored.id, card);
    return c.json(cardView(saved, questRepo.goldBalance(), now()));
  });

  app.put('/reward-cards/:id/archive', async (c) => {
    const stored = requireCard(c.req.param('id'));
    const { archived } = await readBody(c, ArchiveBody);
    const saved = transaction(db, () => {
      if (archived) unpinIfGoal(stored.id);
      return marketRepo.setArchived(stored.id, archived);
    });
    return c.json(cardView(saved, questRepo.goldBalance(), now()));
  });

  app.delete('/reward-cards/:id', (c) => {
    const stored = requireCard(c.req.param('id'));
    if (marketRepo.listPurchases(stored.id).length > 0) {
      conflict('cette carte a déjà été achetée : archive-la plutôt (l’historique la garde)');
    }
    transaction(db, () => {
      unpinIfGoal(stored.id);
      marketRepo.deleteCard(stored.id);
    });
    return c.json({ deleted: stored.id });
  });

  app.post('/reward-cards/:id/purchase', async (c) => {
    const stored = requireCard(c.req.param('id'));
    const body = await readBody(c, PurchaseBody, true);
    const at = now();
    const balance = questRepo.goldBalance();
    const check = cardAvailability(
      stored.card,
      stored.archived,
      marketRepo.listPurchases(stored.id),
      balance,
      at,
    );
    if (!check.ok) {
      if (check.reason === 'archived') conflict('carte archivée : réactive-la pour l’acheter');
      if (check.reason === 'cooldown') {
        conflict(`carte en recharge : de nouveau achetable dans ${check.daysLeft} jour(s)`);
      }
      conflict(`solde insuffisant : ${balance} or, il manque ${check.missing} or`);
    }
    const purchasedAt = toIso(body.occurredAt) ?? at;
    const { card } = stored;

    const purchase = transaction(db, () => {
      const p = marketRepo.addPurchase({
        cardId: stored.id,
        snapshot: { name: card.name, rarity: card.rarity, price: card.price },
        purchasedAt,
        archivedCard: card.unique,
      });
      questRepo.addGoldEvent({
        amount: -card.price,
        reason: 'purchase',
        purchaseId: p.id,
        occurredAt: purchasedAt,
      });
      if (card.unique) {
        marketRepo.setArchived(stored.id, true);
        unpinIfGoal(stored.id);
      }
      return p;
    });
    const balanceAfter = questRepo.goldBalance();
    return c.json(
      {
        purchase,
        card: cardView(marketRepo.getCard(stored.id)!, balanceAfter, now()),
        gold: balanceAfter,
      },
      201,
    );
  });

  app.post('/purchases/:id/undo', (c) => {
    const raw = c.req.param('id');
    const purchase = marketRepo.getPurchase(Number(raw));
    if (!purchase) notFound(`achat "${raw}" inconnu`);
    const check = canUndoPurchase(purchase);
    if (!check.ok) conflict(check.reason);
    const at = now();

    const undone = transaction(db, () => {
      questRepo.addGoldEvent({
        amount: purchase.snapshot.price,
        reason: 'purchase-undo',
        purchaseId: purchase.id,
        occurredAt: at,
      });
      if (purchase.archivedCard) marketRepo.setArchived(purchase.cardId, false);
      return marketRepo.markUndone(purchase.id, at);
    });
    return c.json({ purchase: undone, gold: questRepo.goldBalance() });
  });

  app.put('/market/goal', async (c) => {
    const { cardId } = await readBody(c, GoalBody);
    if (cardId !== null) {
      const card = marketRepo.getCard(cardId);
      if (!card) notFound(`carte "${cardId}" inconnue`);
      if (card.archived) badRequest(['une carte archivée ne peut pas être un objectif']);
    }
    repo.setPreference(SAVINGS_GOAL, cardId);
    return c.json({ cardId });
  });

  return { marketRepo };
}
