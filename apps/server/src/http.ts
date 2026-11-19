import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { formatIssues } from '@wowg/shared';

function fail(status: 400 | 404 | 409, errors: string[]): never {
  throw new HTTPException(status, { res: Response.json({ errors }, { status }) });
}

export function badRequest(errors: string[]): never {
  fail(400, errors);
}
export function notFound(message: string): never {
  fail(404, [message]);
}
export function conflict(message: string): never {
  fail(409, [message]);
}

export async function readBody<T extends z.ZodType>(
  c: Context,
  schema: T,
  optional = false,
): Promise<z.infer<T>> {
  let raw: unknown = {};
  const text = await c.req.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      badRequest(['corps JSON invalide']);
    }
  } else if (!optional) {
    badRequest(['corps JSON attendu']);
  }
  const res = schema.safeParse(raw);
  if (!res.success) badRequest(formatIssues(res.error));
  return res.data;
}

export const toIso = (d?: string) => (d ? new Date(d).toISOString() : undefined);

/** Date seule ou horodatage avec fuseau, comme pour un rang. */
export const DateInput = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
