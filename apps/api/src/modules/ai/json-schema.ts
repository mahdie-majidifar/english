import { z } from 'zod';

/** Validation keywords that strict structured-output modes reject. Zod re-validates the reply anyway. */
const UNSUPPORTED_KEYWORDS = [
  '$schema',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'default',
];

type Json = Record<string, unknown>;

function walk(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(walk);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const schema = node as Json;

  for (const key of UNSUPPORTED_KEYWORDS) delete schema[key];

  const properties = schema['properties'] as Json | undefined;
  if (schema['type'] === 'object' && properties) {
    // Strict mode: every property is required and no extras are allowed.
    schema['required'] = Object.keys(properties);
    schema['additionalProperties'] = false;
  }
  for (const value of Object.values(schema)) walk(value);
}

/**
 * Converts a Zod schema to the JSON Schema dialect structured-output APIs accept.
 * Design schemas with nullable (not optional) fields so "required" can be set on everything.
 */
export function toProviderJsonSchema(schema: z.ZodType): Json {
  const json = z.toJSONSchema(schema, { target: 'draft-7', io: 'output' }) as Json;
  walk(json);
  return json;
}
