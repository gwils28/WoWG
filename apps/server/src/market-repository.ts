import { RewardCardSchema, type PurchaseSnapshot, type RewardCard } from '@wowg/shared';
import type { Db } from './db';

export interface StoredRewardCard {
  id: number;
  card: RewardCard;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredPurchase {
  id: number;
  cardId: number;
  /** Copie de la carte au moment de l'achat. */
  snapshot: PurchaseSnapshot;
  purchasedAt: string;
  undoneAt: string | null;
  /** La carte a été archivée par cet achat (achat unique) : l'annulation la réactive. */
  archivedCard: boolean;
  createdAt: string;
}

/** Contenu des tables de l'Étal, tel qu'il est sauvegardé et restauré. */
export interface MarketData {
  rewardCards: StoredRewardCard[];
  purchases: StoredPurchase[];
}

interface CardRow {
  id: number;
  definition: string;
  archived: number;
  created_at: string;
  updated_at: string;
}

interface PurchaseRow {
  id: number;
  card_id: number;
  snapshot: string;
  purchased_at: string;
  undone_at: string | null;
  archived_card: number;
  created_at: string;
}

const toCard = (r: CardRow): StoredRewardCard => ({
  id: r.id,
  card: RewardCardSchema.parse(JSON.parse(r.definition)),
  archived: r.archived === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toPurchase = (r: PurchaseRow): StoredPurchase => ({
  id: r.id,
  cardId: r.card_id,
  snapshot: JSON.parse(r.snapshot) as PurchaseSnapshot,
  purchasedAt: r.purchased_at,
  undoneAt: r.undone_at,
  archivedCard: r.archived_card === 1,
  createdAt: r.created_at,
});

const now = () => new Date().toISOString();

export function createMarketRepository(db: Db) {
  const all = <R, T>(sql: string, map: (r: R) => T, ...params: (string | number)[]) =>
    (db.prepare(sql).all(...params) as unknown as R[]).map(map);
  const one = <R, T>(sql: string, map: (r: R) => T, ...params: (string | number)[]) => {
    const row = db.prepare(sql).get(...params);
    return row ? map(row as unknown as R) : null;
  };

  return {
    // --- cartes ---

    listCards(): StoredRewardCard[] {
      return all('SELECT * FROM reward_cards ORDER BY id', toCard);
    },

    getCard(id: number): StoredRewardCard | null {
      return one('SELECT * FROM reward_cards WHERE id = ?', toCard, id);
    },

    createCard(card: RewardCard): StoredRewardCard {
      const ts = now();
      const res = db
        .prepare('INSERT INTO reward_cards (definition, created_at, updated_at) VALUES (?, ?, ?)')
        .run(JSON.stringify(card), ts, ts);
      return this.getCard(Number(res.lastInsertRowid))!;
    },

    updateCard(id: number, card: RewardCard): StoredRewardCard {
      db.prepare('UPDATE reward_cards SET definition = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify(card),
        now(),
        id,
      );
      return this.getCard(id)!;
    },

    setArchived(id: number, archived: boolean): StoredRewardCard {
      db.prepare('UPDATE reward_cards SET archived = ?, updated_at = ? WHERE id = ?').run(
        archived ? 1 : 0,
        now(),
        id,
      );
      return this.getCard(id)!;
    },

    deleteCard(id: number) {
      db.prepare('DELETE FROM reward_cards WHERE id = ?').run(id);
    },

    // --- achats ---

    listPurchases(cardId?: number): StoredPurchase[] {
      return cardId === undefined
        ? all('SELECT * FROM purchases ORDER BY id', toPurchase)
        : all('SELECT * FROM purchases WHERE card_id = ? ORDER BY id', toPurchase, cardId);
    },

    getPurchase(id: number): StoredPurchase | null {
      return one('SELECT * FROM purchases WHERE id = ?', toPurchase, id);
    },

    addPurchase(p: {
      cardId: number;
      snapshot: PurchaseSnapshot;
      purchasedAt: string;
      archivedCard: boolean;
    }): StoredPurchase {
      const res = db
        .prepare(
          `INSERT INTO purchases (card_id, snapshot, purchased_at, archived_card, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(p.cardId, JSON.stringify(p.snapshot), p.purchasedAt, p.archivedCard ? 1 : 0, now());
      return this.getPurchase(Number(res.lastInsertRowid))!;
    },

    markUndone(id: number, at: string): StoredPurchase {
      db.prepare('UPDATE purchases SET undone_at = ? WHERE id = ?').run(at, id);
      return this.getPurchase(id)!;
    },

    // --- sauvegarde ---

    exportAll(): MarketData {
      return { rewardCards: this.listCards(), purchases: this.listPurchases() };
    },

    /** Vide les tables de l'Étal (après les événements d'or, qui référencent les achats). */
    clear() {
      db.exec('DELETE FROM purchases; DELETE FROM reward_cards;');
    },

    /** Réinsère des données sauvegardées en gardant leurs identifiants (avant les événements d'or). */
    insertAll(data: MarketData) {
      const insCard = db.prepare(
        `INSERT INTO reward_cards (id, definition, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const c of data.rewardCards) {
        insCard.run(c.id, JSON.stringify(c.card), c.archived ? 1 : 0, c.createdAt, c.updatedAt);
      }
      const insPurchase = db.prepare(
        `INSERT INTO purchases
           (id, card_id, snapshot, purchased_at, undone_at, archived_card, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const p of data.purchases) {
        insPurchase.run(
          p.id,
          p.cardId,
          JSON.stringify(p.snapshot),
          p.purchasedAt,
          p.undoneAt,
          p.archivedCard ? 1 : 0,
          p.createdAt,
        );
      }
    },
  };
}

export type MarketRepository = ReturnType<typeof createMarketRepository>;
