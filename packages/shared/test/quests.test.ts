import { describe, expect, it } from 'vitest';
import {
  canUndoTurnIn,
  CustomQuestSchema,
  customQuestDefinition,
  diffTrees,
  goldBalance,
  isOverdue,
  isoWeekStart,
  parseTree,
  periodKey,
  planTurnIn,
  questGold,
  questProgress,
  recurrenceProgress,
  suggestedDeadline,
  talentGold,
  treeQuestAvailability,
  treeQuestDefinition,
  type QuestDefinition,
  type QuestProgress,
  type Ranks,
  type TreeLookup,
  type TreeQuest,
  weeklyTurnInCheck,
} from '../src';
import { loadSample, rawSample } from './helpers';

const tree = loadSample();
const SPEC = 'course-a-pied';
const quest = (id: string): TreeQuest => tree.quests!.find((q) => q.id === id)!;
const def = (id: string) => treeQuestDefinition(SPEC, quest(id));
const lookupWith =
  (ranks: Ranks): TreeLookup =>
  (specId) =>
    specId === SPEC ? { tree, ranks } : undefined;
const READY: QuestProgress = { stepsDone: 0, stepsTotal: 0, ready: true };

describe('schéma des quêtes', () => {
  it('accepte la fixture avec ses quêtes, et un arbre sans quêtes', () => {
    expect(tree.quests).toHaveLength(3);
    const raw = rawSample();
    delete raw.quests;
    const res = parseTree(raw);
    expect(res.ok && res.tree.quests).toBeUndefined();
  });

  it('refuse une quête dupliquée, un talent inconnu ou en double', () => {
    const raw = rawSample();
    raw.quests.push({ ...raw.quests[0] });
    raw.quests[1].talents = ['fractionne', 'inconnu', 'fractionne'];
    const res = parseTree(raw);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.errors).toEqual([
      'quests[1].talents[1] : talent récompensé "inconnu" inexistant',
      'quests[1].talents[2] : talent récompensé "fractionne" en double',
      'quests[3].id : quête "sorties-regulieres" dupliquée',
    ]);
  });

  it('refuse une quête sans talent, un rythme ou des étapes hors bornes', () => {
    const raw = rawSample();
    raw.quests[0].talents = [];
    raw.quests[0].recurrence = { times: 0, per: 'year', periods: 1 };
    raw.quests[1].steps = Array.from({ length: 11 }, (_, i) => `étape ${i}`);
    const res = parseTree(raw);
    expect(!res.ok && res.errors.map((e) => e.split(' : ')[0])).toEqual([
      'quests[0].talents',
      'quests[0].recurrence.times',
      'quests[0].recurrence.per',
      'quests[1].steps',
    ]);
  });

  it('quête personnelle : taille obligatoire sans talent, interdite avec, pas de doublon', () => {
    expect(CustomQuestSchema.safeParse({ name: 'Ranger le garage', size: 'medium' }).success).toBe(
      true,
    );
    const issues = (input: unknown) => {
      const res = CustomQuestSchema.safeParse(input);
      return res.success ? [] : res.error.issues.map((i) => i.message);
    };
    expect(issues({ name: 'Ranger le garage' })).toEqual([
      'une quête sans talent doit avoir une taille (small, medium, large)',
    ]);
    const ref = { specializationId: SPEC, talentId: 'endurance' };
    expect(issues({ name: 'Courir', talents: [ref], size: 'small' })).toEqual([
      "la taille ne s'applique qu'à une quête sans talent",
    ]);
    expect(issues({ name: 'Courir', talents: [ref, ref] })).toEqual([
      'talent "course-a-pied/endurance" en double',
    ]);
  });
});

describe('définitions', () => {
  it('convertit une quête proposée en références de talents', () => {
    expect(def('preparer-le-semi')).toEqual({
      name: 'Préparer le semi',
      description: 'Boucler un semi-marathon en soignant la récupération.',
      talents: [
        { specializationId: SPEC, talentId: 'recuperation' },
        { specializationId: SPEC, talentId: 'semi-marathon' },
      ],
      steps: [],
    });
  });

  it('convertit une quête personnelle avec ses valeurs par défaut', () => {
    const q = CustomQuestSchema.parse({ name: 'Ranger le garage', size: 'large' });
    expect(customQuestDefinition(q)).toEqual({
      name: 'Ranger le garage',
      description: '',
      talents: [],
      steps: [],
      size: 'large',
    });
  });
});

describe("barème d'or", () => {
  it('or par talent selon le palier, bonus ultime', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((tier) => talentGold({ tier }))).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4,
    ]);
    expect(talentGold({ tier: 7, ultimate: true })).toBe(6);
  });

  it('additionne talents, rythme, étapes et taille', () => {
    const lookup = lookupWith({});
    expect(questGold(def('sorties-regulieres'), lookup)).toBe(1 + 3); // 3 x 4 semaines
    expect(questGold(def('seance-piste'), lookup)).toBe(1 + 1); // 3 étapes
    expect(questGold(def('preparer-le-semi'), lookup)).toBe(1 + 4); // ultime palier 3
    const daily: QuestDefinition = {
      name: 'Méditer',
      description: '',
      talents: [],
      steps: [],
      size: 'small',
      recurrence: { times: 1, per: 'day', periods: 30 },
    };
    expect(questGold(daily, lookup)).toBe(1 + 8);
  });

  it('ne compte pas un talent introuvable mais rapporte au moins 1 or', () => {
    const orphan: QuestDefinition = {
      name: 'Orpheline',
      description: '',
      talents: [{ specializationId: 'disparue', talentId: 'x' }],
      steps: [],
    };
    expect(questGold(orphan, lookupWith({}))).toBe(1);
  });

  it("ne compte pas l'or d'un talent déjà au rang max", () => {
    // endurance max 3, palier 1 : 1 or ; rythme 3 x 4 : +3
    expect(questGold(def('sorties-regulieres'), lookupWith({ endurance: 2 }))).toBe(1 + 3);
    expect(questGold(def('sorties-regulieres'), lookupWith({ endurance: 3 }))).toBe(3);
    // récupération (max 1) achevée, semi-marathon ultime palier 3 encore dû
    expect(questGold(def('preparer-le-semi'), lookupWith({ recuperation: 1 }))).toBe(4);
    // tous au max, sans rythme ni étapes : plancher de 1 or
    expect(
      questGold(def('preparer-le-semi'), lookupWith({ recuperation: 1, 'semi-marathon': 1 })),
    ).toBe(1);
  });

  it('solde = somme des événements', () => {
    expect(goldBalance([{ amount: 5 }, { amount: 2 }, { amount: -3 }])).toBe(4);
    expect(goldBalance([])).toBe(0);
  });
});

describe('périodes', () => {
  it('jour, semaine ISO (lundi) et mois, en UTC', () => {
    expect(periodKey('2026-11-19T22:30:00.000Z', 'day')).toBe('2026-11-19');
    expect(periodKey('2026-11-19T10:00:00.000Z', 'week')).toBe('2026-11-16');
    expect(periodKey('2026-11-16T00:00:00.000Z', 'week')).toBe('2026-11-16');
    expect(periodKey('2026-11-22T23:59:59.000Z', 'week')).toBe('2026-11-16');
    expect(periodKey('2027-01-01T12:00:00.000Z', 'week')).toBe('2026-12-28');
    expect(periodKey('2026-11-19T10:00:00.000Z', 'month')).toBe('2026-11');
  });

  it("échéance proposée : fin de la dernière période à partir de l'acceptation", () => {
    const at = '2026-11-19T10:00:00.000Z';
    expect(suggestedDeadline({ times: 1, per: 'day', periods: 30 }, at)).toBe('2026-12-18');
    expect(suggestedDeadline({ times: 3, per: 'week', periods: 4 }, at)).toBe('2026-12-13');
    expect(suggestedDeadline({ times: 2, per: 'month', periods: 3 }, at)).toBe('2027-01-31');
    expect(suggestedDeadline({ times: 2, per: 'month', periods: 1 }, '2028-02-10T00:00:00Z')).toBe(
      '2028-02-29',
    );
  });

  it("en retard seulement après le jour d'échéance", () => {
    expect(isOverdue('2026-11-19', '2026-11-19T23:00:00.000Z')).toBe(false);
    expect(isOverdue('2026-11-19', '2026-11-20T00:00:00.000Z')).toBe(true);
    expect(isOverdue(null, '2030-01-01T00:00:00.000Z')).toBe(false);
  });
});

describe('progression', () => {
  const rec = { times: 3, per: 'week' as const, periods: 2 };
  const at = '2026-11-19T10:00:00.000Z'; // jeudi, semaine du 16
  const ticks = (...days: string[]) => days.map((d) => ({ occurredAt: `${d}T08:00:00.000Z` }));

  it('compte les périodes réussies, consécutives ou non, et ignore les occurrences antérieures', () => {
    const p = recurrenceProgress(
      rec,
      at,
      ticks(
        '2026-11-10', // avant la semaine d'acceptation : ignorée
        '2026-11-16',
        '2026-11-20',
        '2026-11-22', // semaine du 16 : réussie
        '2026-11-24', // semaine du 23 : ratée
        '2026-12-01',
        '2026-12-02',
      ),
      '2026-12-02T20:00:00.000Z',
    );
    expect(p).toEqual({
      times: 3,
      per: 'week',
      successfulPeriods: 1,
      requiredPeriods: 2,
      currentCount: 2,
      done: false,
    });
    const done = recurrenceProgress(
      rec,
      at,
      ticks('2026-11-16', '2026-11-20', '2026-11-22', '2026-12-01', '2026-12-02', '2026-12-06'),
      '2026-12-07T08:00:00.000Z',
    );
    expect(done.successfulPeriods).toBe(2);
    expect(done.currentCount).toBe(0);
    expect(done.done).toBe(true);
  });

  it('prête quand toutes les étapes sont cochées et le rythme atteint', () => {
    const steps = def('seance-piste');
    expect(questProgress(steps, { acceptedAt: at, stepsDone: [0, 2, 2, 7] }, [], at)).toEqual({
      stepsDone: 2,
      stepsTotal: 3,
      ready: false,
    });
    expect(questProgress(steps, { acceptedAt: at, stepsDone: [0, 1, 2] }, [], at).ready).toBe(true);
    expect(
      questProgress(def('preparer-le-semi'), { acceptedAt: at, stepsDone: [] }, [], at).ready,
    ).toBe(true);
    const recurring = questProgress(
      def('sorties-regulieres'),
      { acceptedAt: at, stepsDone: [] },
      [],
      at,
    );
    expect(recurring.ready).toBe(false);
    expect(recurring.recurrence?.requiredPeriods).toBe(4);
  });
});

describe('disponibilité des quêtes proposées', () => {
  it('disponible quand les talents sont débloqués et pas tous au max', () => {
    expect(treeQuestAvailability(tree, {}, quest('sorties-regulieres'))).toEqual({ ok: true });
    expect(treeQuestAvailability(tree, { endurance: 3 }, quest('sorties-regulieres'))).toEqual({
      ok: false,
      reason: 'tous les talents récompensés sont au rang max',
    });
    expect(treeQuestAvailability(tree, {}, quest('seance-piste'))).toEqual({
      ok: false,
      reason: 'talent(s) verrouillé(s) : Fractionné',
    });
  });

  it("reste disponible tant qu'un talent récompensé peut encore monter", () => {
    const ranks = { endurance: 3, fractionne: 2, cadence: 1, recuperation: 1 };
    expect(treeQuestAvailability(tree, ranks, quest('preparer-le-semi'))).toEqual({ ok: true });
    expect(
      treeQuestAvailability(tree, { ...ranks, 'semi-marathon': 1 }, quest('preparer-le-semi')).ok,
    ).toBe(false);
  });
});

describe('rendu', () => {
  it('refuse une quête incomplète', () => {
    const progress = { stepsDone: 1, stepsTotal: 3, ready: false };
    expect(planTurnIn(def('seance-piste'), progress, lookupWith({ endurance: 3 }))).toEqual({
      ok: false,
      reason: 'quête incomplète : étapes ou rythme non atteints',
    });
  });

  it('accorde les rangs, en ignorant un talent au max, et ordonne parent avant enfant', () => {
    const ranks = { endurance: 3, fractionne: 2, cadence: 1, recuperation: 1 };
    expect(planTurnIn(def('preparer-le-semi'), READY, lookupWith(ranks))).toEqual({
      ok: true,
      grants: [{ specializationId: SPEC, talentId: 'semi-marathon' }],
      skipped: [
        {
          ref: { specializationId: SPEC, talentId: 'recuperation' },
          reason: '"Récupération" est déjà au rang max',
        },
      ],
    });
    // fractionne (palier 2) avant semi-marathon (palier 3), même listés à l'envers
    const chained: QuestDefinition = {
      name: 'Chaîne',
      description: '',
      steps: [],
      talents: [
        { specializationId: SPEC, talentId: 'semi-marathon' },
        { specializationId: SPEC, talentId: 'fractionne' },
      ],
    };
    const plan = planTurnIn(
      chained,
      READY,
      lookupWith({ endurance: 3, fractionne: 1, cadence: 1 }),
    );
    expect(plan.ok && plan.grants.map((g) => g.talentId)).toEqual(['fractionne', 'semi-marathon']);
  });

  it('refuse un talent verrouillé et ignore un talent introuvable', () => {
    expect(planTurnIn(def('seance-piste'), READY, lookupWith({}))).toEqual({
      ok: false,
      reason: 'Fractionné : prérequis manquants : Endurance de base 0/2',
    });
    const orphan: QuestDefinition = {
      name: 'Orpheline',
      description: '',
      steps: [],
      size: 'small',
      talents: [{ specializationId: 'disparue', talentId: 'x' }],
    };
    expect(planTurnIn(orphan, READY, lookupWith({}))).toEqual({
      ok: true,
      grants: [],
      skipped: [
        { ref: { specializationId: 'disparue', talentId: 'x' }, reason: 'talent introuvable' },
      ],
    });
  });

  it('ne modifie pas les rangs reçus', () => {
    const ranks = { endurance: 2 };
    planTurnIn(def('sorties-regulieres'), READY, lookupWith(ranks));
    expect(ranks).toEqual({ endurance: 2 });
  });
});

describe("annulation d'un rendu", () => {
  const grants = [{ specializationId: SPEC, talentId: 'endurance' }];

  it('autorisée si les rangs peuvent être retirés et le solde suffit', () => {
    expect(canUndoTurnIn(grants, 4, 4, lookupWith({ endurance: 1 }))).toEqual({ ok: true });
  });

  it("refusée si le solde d'or deviendrait négatif", () => {
    expect(canUndoTurnIn(grants, 4, 3, lookupWith({ endurance: 1 }))).toEqual({
      ok: false,
      reason: "solde d'or insuffisant : 3 or, ce rendu en a rapporté 4",
    });
  });

  it('refusée si un enfant dépend du rang ou si le rang a déjà été retiré', () => {
    expect(canUndoTurnIn(grants, 1, 10, lookupWith({ endurance: 2, fractionne: 1 }))).toEqual({
      ok: false,
      reason: 'impossible : "Fractionné" dépend(ent) de ce rang',
    });
    expect(canUndoTurnIn(grants, 1, 10, lookupWith({})).ok).toBe(false);
  });

  it('retire enfant avant parent quand les deux viennent du même rendu', () => {
    const both = [
      { specializationId: SPEC, talentId: 'fractionne' },
      { specializationId: SPEC, talentId: 'semi-marathon' },
    ];
    const ranks = { endurance: 3, fractionne: 2, cadence: 1, 'semi-marathon': 1 };
    expect(canUndoTurnIn(both, 3, 10, lookupWith(ranks))).toEqual({ ok: true });
  });

  it('ignore une progression orpheline', () => {
    const orphan = [{ specializationId: 'disparue', talentId: 'x' }];
    expect(canUndoTurnIn(orphan, 1, 1, lookupWith({}))).toEqual({ ok: true });
  });
});

describe('diff des quêtes', () => {
  it('nouvel arbre : toutes les quêtes ajoutées', () => {
    expect(diffTrees(null, tree).quests.added.map((q) => q.id)).toEqual([
      'sorties-regulieres',
      'seance-piste',
      'preparer-le-semi',
    ]);
  });

  it('signale ajouts, suppressions et champs modifiés', () => {
    const next = structuredClone(tree);
    next.quests = [
      { ...next.quests![0]!, recurrence: { times: 4, per: 'week', periods: 4 } },
      next.quests![1]!,
      { id: 'nouvelle', name: 'Nouvelle', description: 'd', talents: ['cadence'] },
    ];
    expect(diffTrees(tree, next).quests).toEqual({
      added: [{ id: 'nouvelle', name: 'Nouvelle' }],
      removed: [{ id: 'preparer-le-semi', name: 'Préparer le semi' }],
      modified: [{ id: 'sorties-regulieres', name: 'Sorties régulières', fields: ['recurrence'] }],
    });
  });

  it('aucune quête des deux côtés : diff vide', () => {
    const a = structuredClone(tree);
    delete a.quests;
    expect(diffTrees(a, structuredClone(a)).quests).toEqual({
      added: [],
      removed: [],
      modified: [],
    });
  });
});

describe('limiteur hebdomadaire des quêtes personnelles', () => {
  it('semaine ISO : du lundi au dimanche, en UTC', () => {
    expect(isoWeekStart('2026-11-23T08:00:00.000Z')).toBe('2026-11-23'); // lundi
    expect(isoWeekStart('2026-11-29T23:59:59.000Z')).toBe('2026-11-23'); // dimanche
  });

  it('refuse un second rendu la même semaine, accepte le lundi suivant', () => {
    const done = ['2026-11-23T10:00:00.000Z'];
    const res = weeklyTurnInCheck(done, '2026-11-29T20:00:00.000Z');
    expect(res).toEqual({
      ok: false,
      reason: 'quête personnelle déjà rendue cette semaine, de nouveau possible le lundi 30/11',
    });
    expect(weeklyTurnInCheck(done, '2026-11-30T00:00:00.000Z').ok).toBe(true);
    expect(weeklyTurnInCheck(done, '2026-11-22T23:00:00.000Z').ok).toBe(true); // semaine d'avant
  });

  it('sans rendu antérieur (ou rendu annulé, exclu par l’appelant) : accepté', () => {
    expect(weeklyTurnInCheck([], '2026-11-23T10:00:00.000Z').ok).toBe(true);
  });
});
