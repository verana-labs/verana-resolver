import { readFileSync } from 'node:fs';
import { z } from 'zod';

const ecosystemSchema = z.object({
  did: z.string(),
  name: z.string(),
});

const vprEntrySchema = z.object({
  id: z.string(),
  indexerUrl: z.string().url(),
  ecosystems: z.array(ecosystemSchema).min(1),
});

const vprAllowlistSchema = z.object({
  vprs: z.array(vprEntrySchema).min(1),
});

export type Ecosystem = z.infer<typeof ecosystemSchema>;
export type VprEntry = z.infer<typeof vprEntrySchema>;
export type VprAllowlist = z.infer<typeof vprAllowlistSchema>;

export function loadVprAllowlist(filePath: string): VprAllowlist {
  const raw = readFileSync(filePath, 'utf-8');
  const json: unknown = JSON.parse(raw);
  const result = vprAllowlistSchema.safeParse(json);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid VPR allowlist (${filePath}):\n${errors}`);
  }
  return result.data;
}
