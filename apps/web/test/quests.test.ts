import { describe, expect, it } from 'vitest';
import { parseTree } from '@wowg/shared';
import { readFileSync } from 'node:fs';
import type { QuestOffer, QuestRun } from '../src/lib/api';
import {
  groupOffers,
  progressLabel,
  recurrenceLabel,
  stepsFromText,
  talentQuestMarks,
} from '../src/lib/quests';

const FIXTURE = new URL('../../../packages/shared/test/fixtures/sample.json', import.meta.url);
const res = parseTree(readFileSync(FIXTURE, 'utf-8'));
if (!res.ok) throw new Error(res.errors.join('\n'));
const tree = res.tree;

describe('marqueurs de quêtes sur l’arbre', () => {
  it('ignore les quêtes indisponibles et garde le marqueur le plus fort', () => {
    const marks = talentQuestMarks(tree, [
      { id: 'sorties-regulieres', talents: ['endurance'], state: 'available', runId: null },
      { id: 'seance-piste', talents: ['fractionne'], state: 'unavailable', runId: null },
      {
        id: 'preparer-le-semi',
        talents: ['recuperation', 'semi-marathon'],
        state: 'active',
        runId: 3,
      },
      { id: 'autre', talents: ['recuperation'], state: 'ready', runId: 4 },
    ]);
    expect(Object.keys(marks).sort()).toEqual(['endurance', 'recuperation', 'semi-marathon']);
    expect(marks.endurance).toEqual({
      mark: 'available',
      quests: [{ id: 'sorties-regulieres', name: 'Sorties régulières', state: 'available' }],
    });
    expect(marks.recuperation?.mark).toBe('ready');
    expect(marks.recuperation?.quests.map((q) => q.name)).toEqual(['Préparer le semi', 'autre']);
    expect(marks['semi-marathon']?.mark).toBe('active');
    expect(talentQuestMarks(tree)).toEqual({});
  });
});

describe('libellés', () => {
  it('rythme et progression', () => {
    expect(recurrenceLabel({ times: 3, per: 'week', periods: 4 })).toBe(
      '3 fois par semaine pendant 4 semaines',
    );
    expect(recurrenceLabel({ times: 1, per: 'month', periods: 1 })).toBe(
      '1 fois par mois pendant 1 mois',
    );
    const run = (progress: QuestRun['progress']) => ({ progress });
    expect(
      progressLabel(
        run({
          stepsDone: 1,
          stepsTotal: 3,
          ready: false,
          recurrence: {
            times: 3,
            per: 'week',
            successfulPeriods: 1,
            requiredPeriods: 4,
            currentCount: 2,
            done: false,
          },
        }),
      ),
    ).toBe('1/3 étapes · 1/4 semaines');
    expect(progressLabel(run({ stepsDone: 0, stepsTotal: 0, ready: true }))).toBe('');
  });

  it('étapes saisies une par ligne', () => {
    expect(stepsFromText('  a \n\n b\n')).toEqual(['a', 'b']);
    expect(stepsFromText(Array.from({ length: 12 }, (_, i) => `e${i}`).join('\n'))).toHaveLength(
      10,
    );
  });
});

describe('regroupement des quêtes disponibles', () => {
  const offer = (domain: string, questId: string): QuestOffer =>
    ({
      source: 'tree',
      specializationId: `${domain}-spe`,
      questId,
      origin: { domain: { id: domain, name: domain.toUpperCase(), icon: 'x:y' } },
    }) as unknown as QuestOffer;
  const custom = { source: 'custom', customQuestId: 1 } as unknown as QuestOffer;

  it('classes épinglées d’abord, puis par nom, quêtes personnelles à la fin', () => {
    const groups = groupOffers(
      [custom, offer('zen', 'a'), offer('boxe', 'b'), offer('cuisine', 'c'), offer('boxe', 'd')],
      ['zen'],
    );
    expect(groups.map((g) => [g.key, g.offers.length])).toEqual([
      ['zen', 1],
      ['boxe', 2],
      ['cuisine', 1],
      ['custom', 1],
    ]);
    expect(groupOffers([], [])).toEqual([]);
  });
});
