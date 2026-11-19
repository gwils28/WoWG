import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  CustomQuestSchema,
  customQuestDefinition,
  formatIssues,
  questGold,
  type QuestPeriod,
  type QuestRecurrence,
  type QuestSize,
  type QuestTalentRef,
  type TreeContext,
} from '@wowg/shared';
import { api, type CustomQuestView } from '../../lib/api';
import { stepsFromText } from '../../lib/quests';
import { GoldAmount, Modal } from './QuestParts';
import type { QuestActions } from './useQuestActions';

const SIZES: { value: QuestSize; label: string }[] = [
  { value: 'small', label: 'Petite' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'large', label: 'Grande' },
];

const PERIODS: { value: QuestPeriod; label: string }[] = [
  { value: 'day', label: 'par jour' },
  { value: 'week', label: 'par semaine' },
  { value: 'month', label: 'par mois' },
];

/** Créer ou modifier une quête personnelle : talents de n'importe quel arbre, ou or seul. */
export function CustomQuestDialog({
  initial,
  actions,
  onClose,
}: {
  initial?: CustomQuestView;
  actions: QuestActions;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [talents, setTalents] = useState<QuestTalentRef[]>(
    initial?.talents.map(({ specializationId, talentId }) => ({ specializationId, talentId })) ??
      [],
  );
  const [stepsText, setStepsText] = useState(initial?.steps.join('\n') ?? '');
  const [recurrence, setRecurrence] = useState<QuestRecurrence | null>(initial?.recurrence ?? null);
  const [size, setSize] = useState<QuestSize>(initial?.size ?? 'small');

  const quest = {
    name,
    description,
    talents,
    steps: stepsFromText(stepsText),
    ...(recurrence && { recurrence }),
    ...(talents.length === 0 && { size }),
  };
  const parsed = CustomQuestSchema.safeParse(quest);
  const errors = parsed.success ? [] : formatIssues(parsed.error);

  // arbres des talents choisis, pour l'aperçu de l'or
  const specIds = [...new Set(talents.map((t) => t.specializationId))];
  const details = useQueries({
    queries: specIds.map((id) => ({
      queryKey: ['spec', id],
      queryFn: () => api.specialization(id),
    })),
  });
  const contexts = new Map<string, TreeContext>();
  details.forEach((d) => {
    if (d.data) contexts.set(d.data.id, { tree: d.data.tree, ranks: d.data.ranks });
  });
  const gold = parsed.success
    ? questGold(customQuestDefinition(parsed.data), (id) => contexts.get(id))
    : null;

  const talentName = (ref: QuestTalentRef) => {
    const tree = contexts.get(ref.specializationId)?.tree;
    const t = tree?.talents.find((x) => x.id === ref.talentId);
    return t
      ? `${t.name} (${tree!.specialization.name})`
      : `${ref.specializationId}/${ref.talentId}`;
  };

  const submit = () => {
    if (!parsed.success) return;
    actions.saveCustom.mutate(
      { id: initial?.customQuestId, quest: parsed.data },
      {
        onSuccess: () => {
          actions.toast(initial ? 'Quête modifiée' : `Quête créée : ${parsed.data.name}`);
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      wide
      title={initial ? 'Modifier la quête' : 'Nouvelle quête'}
      sub={
        gold !== null && (
          <>
            Récompense : <GoldAmount amount={gold} sign />
          </>
        )
      }
      icon="game-icons:quill-ink"
      submitLabel={initial ? 'Enregistrer' : 'Créer la quête'}
      submitDisabled={!parsed.success}
      pending={actions.saveCustom.isPending}
      onSubmit={submit}
      onClose={onClose}
    >
      <label className="field">
        <span>Nom</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </label>
      <label className="field">
        <span>Description (facultative)</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </label>

      <fieldset className="quest-form__group">
        <legend>Talents récompensés (+1 rang chacun)</legend>
        {talents.length > 0 ? (
          <ul className="quest-form__talents">
            {talents.map((t) => (
              <li key={`${t.specializationId}/${t.talentId}`}>
                {talentName(t)}
                <button
                  type="button"
                  className="quest-ticks__remove"
                  aria-label="Retirer ce talent"
                  onClick={() => setTalents(talents.filter((x) => x !== t))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted quest-form__hint">Aucun talent : la quête ne rapporte que de l'or.</p>
        )}
        <TalentPicker exclude={talents} onPick={(ref) => setTalents([...talents, ref])} />
      </fieldset>

      {talents.length === 0 && (
        <label className="field">
          <span>Taille (fixe l'or)</span>
          <select value={size} onChange={(e) => setSize(e.target.value as QuestSize)}>
            {SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>Étapes (facultatives, une par ligne, 10 au plus)</span>
        <textarea value={stepsText} onChange={(e) => setStepsText(e.target.value)} rows={3} />
      </label>

      <fieldset className="quest-form__group">
        <legend>
          <label className="quest-form__toggle">
            <input
              type="checkbox"
              checked={recurrence !== null}
              onChange={(e) =>
                setRecurrence(e.target.checked ? { times: 3, per: 'week', periods: 4 } : null)
              }
            />
            Quête répétable
          </label>
        </legend>
        {recurrence && (
          <div className="quest-form__rhythm">
            <input
              type="number"
              min={1}
              max={20}
              value={recurrence.times}
              aria-label="Nombre de fois"
              onChange={(e) => setRecurrence({ ...recurrence, times: Number(e.target.value) })}
            />
            <span>fois</span>
            <select
              value={recurrence.per}
              aria-label="Période"
              onChange={(e) => setRecurrence({ ...recurrence, per: e.target.value as QuestPeriod })}
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <span>pendant</span>
            <input
              type="number"
              min={1}
              max={52}
              value={recurrence.periods}
              aria-label="Nombre de périodes"
              onChange={(e) => setRecurrence({ ...recurrence, periods: Number(e.target.value) })}
            />
            <span>période(s) réussie(s)</span>
          </div>
        )}
      </fieldset>

      {errors.length > 0 && name.trim() !== '' && (
        <ul className="editor__errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** Choix d'un talent : classe, puis spécialisation, puis talent. */
function TalentPicker({
  exclude,
  onPick,
}: {
  exclude: QuestTalentRef[];
  onPick: (ref: QuestTalentRef) => void;
}) {
  const specs = useQuery({ queryKey: ['specs'], queryFn: api.specializations });
  const [specId, setSpecId] = useState('');
  const [talentId, setTalentId] = useState('');
  const detail = useQuery({
    queryKey: ['spec', specId],
    queryFn: () => api.specialization(specId),
    enabled: specId !== '',
  });
  const byDomain = useMemo(() => {
    const groups = new Map<string, { name: string; specs: { id: string; name: string }[] }>();
    for (const s of specs.data ?? []) {
      const g = groups.get(s.domain.id) ?? { name: s.domain.name, specs: [] };
      g.specs.push({ id: s.id, name: s.specialization.name });
      groups.set(s.domain.id, g);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [specs.data]);
  const taken = new Set(exclude.map((t) => `${t.specializationId}/${t.talentId}`));
  const talents = (detail.data?.tree.talents ?? [])
    .filter((t) => !taken.has(`${specId}/${t.id}`))
    .sort((a, b) => a.tier - b.tier || a.column - b.column);

  return (
    <div className="quest-form__picker">
      <select
        value={specId}
        aria-label="Spécialisation"
        onChange={(e) => {
          setSpecId(e.target.value);
          setTalentId('');
        }}
      >
        <option value="">Spécialisation...</option>
        {byDomain.map((g) => (
          <optgroup key={g.name} label={g.name}>
            {g.specs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <select
        value={talentId}
        aria-label="Talent"
        disabled={!specId}
        onChange={(e) => setTalentId(e.target.value)}
      >
        <option value="">Talent...</option>
        {talents.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} (palier {t.tier})
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn--ghost btn--small"
        disabled={!talentId}
        onClick={() => {
          onPick({ specializationId: specId, talentId });
          setTalentId('');
        }}
      >
        Ajouter
      </button>
    </div>
  );
}
