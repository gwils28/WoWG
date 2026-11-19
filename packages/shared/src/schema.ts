import { z } from 'zod';

const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'identifiant attendu en kebab-case (ex. "endurance-de-base")');

const icon = z
  .string()
  .regex(
    /^[a-z0-9-]+:[a-z0-9-]+$/,
    'icône attendue au format "collection:nom" (ex. "game-icons:run")',
  );

export const PrerequisiteSchema = z.object({
  talentId: slug,
  /** Rang requis du parent. Absent : rang max du parent. */
  rank: z.number().int().min(1).optional(),
});

export const TalentSchema = z.object({
  id: slug,
  name: z.string().min(1),
  description: z.string().min(1),
  icon,
  tier: z.number().int().min(1),
  column: z.number().int().min(1),
  maxRank: z.number().int().min(1).max(5),
  /** Critère concret pour obtenir chaque rang. Longueur = maxRank. */
  ranks: z.array(z.string().min(1)).min(1).max(5),
  prerequisites: z.array(PrerequisiteSchema).default([]),
  ultimate: z.boolean().optional(),
});

export const QUEST_MAX_STEPS = 10;

/** Rythme d'une quête répétable : `times` fois par `per`, pendant `periods` périodes réussies. */
export const QuestRecurrenceSchema = z.object({
  times: z.number().int().min(1).max(20),
  per: z.enum(['day', 'week', 'month']),
  periods: z.number().int().min(1).max(52),
});

const questSteps = z.array(z.string().min(1)).max(QUEST_MAX_STEPS);

/** Quête proposée, définie dans un fichier d'arbre. Chaque talent récompensé gagne +1 rang. */
export const TreeQuestSchema = z.object({
  id: slug,
  name: z.string().min(1),
  description: z.string().min(1),
  talents: z.array(slug).min(1),
  steps: questSteps.optional(),
  recurrence: QuestRecurrenceSchema.optional(),
});

export const QuestSizeSchema = z.enum(['small', 'medium', 'large']);

export const QuestTalentRefSchema = z.object({ specializationId: slug, talentId: slug });

/**
 * Définition figée dans un suivi à l'acceptation (quête proposée ou personnelle) : modifier ou
 * supprimer la quête ensuite ne change pas un suivi en cours.
 */
export const QuestDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  talents: z.array(QuestTalentRefSchema),
  steps: z.array(z.string()),
  recurrence: QuestRecurrenceSchema.optional(),
  size: QuestSizeSchema.optional(),
});

/** Quête personnelle, écrite dans l'app. Sans talent, elle ne rapporte que de l'or (selon `size`). */
export const CustomQuestSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().default(''),
    talents: z.array(QuestTalentRefSchema).default([]),
    steps: questSteps.default([]),
    recurrence: QuestRecurrenceSchema.optional(),
    size: QuestSizeSchema.optional(),
  })
  .superRefine((q, ctx) => {
    const seen = new Set<string>();
    q.talents.forEach((t, i) => {
      const key = `${t.specializationId}/${t.talentId}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['talents', i],
          message: `talent "${key}" en double`,
        });
      }
      seen.add(key);
    });
    if (q.talents.length === 0 && !q.size) {
      ctx.addIssue({
        code: 'custom',
        path: ['size'],
        message: 'une quête sans talent doit avoir une taille (small, medium, large)',
      });
    }
    if (q.talents.length > 0 && q.size) {
      ctx.addIssue({
        code: 'custom',
        path: ['size'],
        message: "la taille ne s'applique qu'à une quête sans talent",
      });
    }
  });

/**
 * Structure seule, sans règles croisées. Sert à relire un arbre déjà stocké : une règle ajoutée
 * plus tard ne doit pas rendre illisibles les données existantes.
 */
export const TreeFileStructureSchema = z.object({
  schemaVersion: z.literal(1),
  domain: z.object({ id: slug, name: z.string().min(1), icon }),
  specialization: z.object({
    id: slug,
    name: z.string().min(1),
    description: z.string().min(1),
    icon,
  }),
  grid: z.object({
    tiers: z.number().int().min(1).max(10),
    columns: z.number().int().min(1).max(6),
  }),
  talents: z.array(TalentSchema).min(1),
  /** Facultatif : absent plutôt que vide, pour ne pas réécrire les arbres qui n'en ont pas. */
  quests: z.array(TreeQuestSchema).optional(),
});

export const TreeFileSchema = TreeFileStructureSchema.superRefine((tree, ctx) => {
  const byId = new Map<string, z.infer<typeof TalentSchema>>();
  const positions = new Map<string, string>();

  tree.talents.forEach((t, i) => {
    const path = ['talents', i];
    if (byId.has(t.id)) {
      ctx.addIssue({ code: 'custom', path: [...path, 'id'], message: `id "${t.id}" dupliqué` });
    }
    byId.set(t.id, t);

    if (t.tier > tree.grid.tiers) {
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'tier'],
        message: `palier ${t.tier} hors de la grille (${tree.grid.tiers} paliers)`,
      });
    }
    if (t.column > tree.grid.columns) {
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'column'],
        message: `colonne ${t.column} hors de la grille (${tree.grid.columns} colonnes)`,
      });
    }
    const pos = `${t.tier}:${t.column}`;
    const other = positions.get(pos);
    if (other) {
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'column'],
        message: `case palier ${t.tier} colonne ${t.column} déjà occupée par "${other}"`,
      });
    } else {
      positions.set(pos, t.id);
    }
    if (t.ranks.length !== t.maxRank) {
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'ranks'],
        message: `${t.ranks.length} critère(s) pour maxRank ${t.maxRank} : il en faut exactement ${t.maxRank}`,
      });
    }
  });

  const ultimates = tree.talents.filter((t) => t.ultimate);
  if (ultimates.length > 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['talents'],
      message: `un seul talent ultime autorisé (trouvés : ${ultimates.map((t) => t.id).join(', ')})`,
    });
  }

  tree.talents.forEach((t, i) => {
    if (t.ultimate && t.tier !== tree.grid.tiers) {
      ctx.addIssue({
        code: 'custom',
        path: ['talents', i, 'tier'],
        message: `le talent ultime doit être au dernier palier (${tree.grid.tiers})`,
      });
    }
    t.prerequisites.forEach((p, j) => {
      const path = ['talents', i, 'prerequisites', j];
      const parent = byId.get(p.talentId);
      if (!parent) {
        ctx.addIssue({ code: 'custom', path, message: `prérequis "${p.talentId}" inexistant` });
        return;
      }
      if (parent.tier >= t.tier) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: `le prérequis "${p.talentId}" (palier ${parent.tier}) doit être à un palier inférieur à "${t.id}" (palier ${t.tier})`,
        });
      }
      if (p.rank !== undefined && p.rank > parent.maxRank) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'rank'],
          message: `rang requis ${p.rank} supérieur au rang max de "${p.talentId}" (${parent.maxRank})`,
        });
      }
      if (parent.tier < t.tier) {
        const blocked = arrowCells(parent, t)
          .map((cell) => positions.get(`${cell.tier}:${cell.column}`))
          .filter((id): id is string => id !== undefined);
        if (blocked.length > 0) {
          ctx.addIssue({
            code: 'custom',
            path,
            message: `la flèche "${p.talentId}" → "${t.id}" traverse ${blocked.map((b) => `"${b}"`).join(', ')} : déplace l'un des talents`,
          });
        }
      }
    });
  });

  const questIds = new Set<string>();
  tree.quests?.forEach((q, i) => {
    const path = ['quests', i];
    if (questIds.has(q.id)) {
      ctx.addIssue({ code: 'custom', path: [...path, 'id'], message: `quête "${q.id}" dupliquée` });
    }
    questIds.add(q.id);
    const rewarded = new Set<string>();
    q.talents.forEach((id, j) => {
      if (!byId.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'talents', j],
          message: `talent récompensé "${id}" inexistant`,
        });
      }
      if (rewarded.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'talents', j],
          message: `talent récompensé "${id}" en double`,
        });
      }
      rewarded.add(id);
    });
  });
});

type Cell = { tier: number; column: number };

/**
 * Cases traversées par la flèche parent → enfant (extrémités exclues), selon le tracé de l'UI :
 * même colonne, descente verticale ; sinon horizontale sur la ligne du parent jusqu'à la colonne
 * de l'enfant, puis descente.
 */
export function arrowCells(parent: Cell, child: Cell): Cell[] {
  const cells: Cell[] = [];
  if (parent.column !== child.column) {
    const step = child.column > parent.column ? 1 : -1;
    for (let c = parent.column + step; c !== child.column + step; c += step) {
      cells.push({ tier: parent.tier, column: c });
    }
  }
  for (let tier = parent.tier + 1; tier < child.tier; tier++) {
    cells.push({ tier, column: child.column });
  }
  return cells;
}

export type Prerequisite = z.infer<typeof PrerequisiteSchema>;
export type Talent = z.infer<typeof TalentSchema>;
export type TreeFile = z.infer<typeof TreeFileSchema>;
export type TreeFileInput = z.input<typeof TreeFileSchema>;
export type QuestRecurrence = z.infer<typeof QuestRecurrenceSchema>;
export type QuestPeriod = QuestRecurrence['per'];
export type TreeQuest = z.infer<typeof TreeQuestSchema>;
export type QuestSize = z.infer<typeof QuestSizeSchema>;
export type QuestTalentRef = z.infer<typeof QuestTalentRefSchema>;
export type CustomQuest = z.infer<typeof CustomQuestSchema>;
export type CustomQuestInput = z.input<typeof CustomQuestSchema>;
export type QuestDefinition = z.infer<typeof QuestDefinitionSchema>;

/** Rend les erreurs de validation lisibles : "talents[3].ranks : message". */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path
      .map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`))
      .join('');
    return path ? `${path} : ${issue.message}` : issue.message;
  });
}

export type ParseResult = { ok: true; tree: TreeFile } | { ok: false; errors: string[] };

/** Valide une valeur déjà désérialisée ou une chaîne JSON. */
export function parseTree(input: unknown): ParseResult {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch (e) {
      return { ok: false, errors: [`JSON invalide : ${(e as Error).message}`] };
    }
  }
  const res = TreeFileSchema.safeParse(value);
  return res.success
    ? { ok: true, tree: res.data }
    : { ok: false, errors: formatIssues(res.error) };
}

/** JSON Schema pour la skill generate-tree (les règles croisées restent dans superRefine). */
export function treeJsonSchema() {
  return z.toJSONSchema(TreeFileStructureSchema, { io: 'input' });
}
