import { useState } from 'react';
import {
  DEFAULT_COOLDOWN,
  formatIssues,
  RARITIES,
  RewardCardSchema,
  type Rarity,
} from '@wowg/shared';
import type { MarketCard } from '../../lib/api';
import { cooldownLabel, RARITY_LABEL } from '../../lib/market';
import { localToday } from '../../lib/quests';
import { ConfirmButton, GoldAmount, Modal } from '../quests/QuestParts';
import type { MarketActions } from './useMarketActions';

/** Confirmer un achat : récapitulatif du prix et du solde après achat, date modifiable. */
export function PurchaseDialog({
  card,
  balance,
  actions,
  onClose,
}: {
  card: MarketCard;
  balance: number;
  actions: MarketActions;
  onClose: () => void;
}) {
  const [date, setDate] = useState(localToday);
  const submit = () =>
    actions.purchase.mutate(
      { id: card.id, occurredAt: date === localToday() ? undefined : date },
      {
        onSuccess: () => {
          actions.toast(`Achat : ${card.name} (-${card.price} or)`);
          onClose();
        },
      },
    );
  return (
    <Modal
      title={card.name}
      sub={
        <span className={`rarity-text rarity-text--${card.rarity}`}>
          {RARITY_LABEL[card.rarity]}
        </span>
      }
      icon="game-icons:swap-bag"
      submitLabel={`Acheter pour ${card.price} or`}
      pending={actions.purchase.isPending}
      onSubmit={submit}
      onClose={onClose}
    >
      {card.description && <p className="dialog__text">{card.description}</p>}
      <ul className="purchase-summary">
        <li>
          <span>Solde</span> <GoldAmount amount={balance} />
        </li>
        <li>
          <span>Prix</span> <GoldAmount amount={-card.price} />
        </li>
        <li className="purchase-summary__after">
          <span>Solde après achat</span> <GoldAmount amount={balance - card.price} />
        </li>
      </ul>
      <p className="muted">
        {card.unique
          ? 'Achat unique : la carte sera archivée.'
          : `${cooldownLabel(card)} avant de pouvoir la racheter.`}
      </p>
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
    </Modal>
  );
}

/** Créer ou modifier une carte. La recharge est pré-remplie selon la rareté. */
export function CardFormDialog({
  initial,
  actions,
  onClose,
}: {
  initial?: MarketCard;
  actions: MarketActions;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [rarity, setRarity] = useState<Rarity>(initial?.rarity ?? 'common');
  const [price, setPrice] = useState(String(initial?.price ?? 1));
  const [cooldown, setCooldown] = useState(
    initial ? String(initial.cooldownDays ?? '') : String(DEFAULT_COOLDOWN.common),
  );
  const [unique, setUnique] = useState(initial?.unique ?? false);
  // la recharge suit la rareté tant que l'utilisateur ne l'a pas modifiée
  const [cooldownTouched, setCooldownTouched] = useState(initial !== undefined);
  const [errors, setErrors] = useState<string[]>([]);

  const changeRarity = (r: Rarity) => {
    setRarity(r);
    if (!cooldownTouched) setCooldown(String(DEFAULT_COOLDOWN[r]));
  };

  const submit = () => {
    const raw = {
      name,
      description: description.trim(),
      rarity,
      price: Number(price),
      unique,
      ...(cooldown.trim() && !unique && { cooldownDays: Number(cooldown) }),
    };
    const res = RewardCardSchema.safeParse(raw);
    if (!res.success) return setErrors(formatIssues(res.error));
    setErrors([]);
    actions.save.mutate(
      { id: initial?.id, card: res.data },
      {
        onSuccess: () => {
          actions.toast(
            initial ? `Carte modifiée : ${res.data.name}` : `Carte créée : ${res.data.name}`,
          );
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      title={initial ? 'Modifier la carte' : 'Nouvelle carte'}
      icon="game-icons:card-pickup"
      submitLabel={initial ? 'Enregistrer' : 'Créer la carte'}
      pending={actions.save.isPending}
      onSubmit={submit}
      onClose={onClose}
    >
      <label className="field">
        <span>Nom</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
      </label>
      <label className="field">
        <span>Description (plafond indicatif en euros, ex. « au plus ~30 € »)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={1000}
        />
      </label>
      <fieldset className="field rarity-picker">
        <legend>Rareté</legend>
        {RARITIES.map((r) => (
          <label key={r} className={`rarity-picker__option rarity-text--${r}`}>
            <input
              type="radio"
              name="rarity"
              value={r}
              checked={rarity === r}
              onChange={() => changeRarity(r)}
            />
            {RARITY_LABEL[r]}
          </label>
        ))}
      </fieldset>
      <div className="card-form__row">
        <label className="field">
          <span>Prix (or)</span>
          <input
            type="number"
            min={1}
            step={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Recharge (jours, vide = aucune)</span>
          <input
            type="number"
            min={1}
            max={3650}
            step={1}
            value={unique ? '' : cooldown}
            disabled={unique}
            onChange={(e) => {
              setCooldown(e.target.value);
              setCooldownTouched(true);
            }}
          />
        </label>
      </div>
      <label className="card-form__check">
        <input type="checkbox" checked={unique} onChange={(e) => setUnique(e.target.checked)} />
        Achat unique (objet durable : la carte est archivée après l'achat)
      </label>
      {errors.length > 0 && (
        <ul className="error card-form__errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {initial && (
        <div className="card-form__danger">
          <ConfirmButton
            label="Archiver"
            confirmLabel="Archiver ?"
            disabled={actions.archive.isPending}
            onConfirm={() =>
              actions.archive.mutate({ id: initial.id, archived: true }, { onSuccess: onClose })
            }
          />
          {initial.purchaseCount === 0 && !initial.lastPurchasedAt && (
            <ConfirmButton
              label="Supprimer"
              confirmLabel="Supprimer ?"
              disabled={actions.remove.isPending}
              onConfirm={() => actions.remove.mutate(initial.id, { onSuccess: onClose })}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
