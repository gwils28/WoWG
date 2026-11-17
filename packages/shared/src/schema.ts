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

const TreeFileBaseSchema = z.object({
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
});

export const TreeFileSchema = TreeFileBaseSchema.superRefine((tree, ctx) => {
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
    });
  });
});

export type Prerequisite = z.infer<typeof PrerequisiteSchema>;
export type Talent = z.infer<typeof TalentSchema>;
export type TreeFile = z.infer<typeof TreeFileSchema>;
export type TreeFileInput = z.input<typeof TreeFileSchema>;

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
  return z.toJSONSchema(TreeFileBaseSchema, { io: 'input' });
}
