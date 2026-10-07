import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ParsedMaterialSchema } from '@coach/contracts';
import { toProviderJsonSchema } from './json-schema.js';

type Json = Record<string, unknown>;

/** Every object node in a schema tree. */
function objects(node: unknown, found: Json[] = []): Json[] {
  if (Array.isArray(node)) node.forEach((n) => objects(n, found));
  else if (node && typeof node === 'object') {
    const n = node as Json;
    if (n['type'] === 'object') found.push(n);
    Object.values(n).forEach((v) => objects(v, found));
  }
  return found;
}

describe('toProviderJsonSchema', () => {
  const schema = toProviderJsonSchema(ParsedMaterialSchema);

  it('makes every object strict: all properties required, no extras', () => {
    const all = objects(schema);
    expect(all.length).toBeGreaterThanOrEqual(4); // root, item, form, exercise
    for (const object of all) {
      expect(object['additionalProperties']).toBe(false);
      expect(object['required']).toEqual(Object.keys(object['properties'] as Json));
    }
  });

  it('drops validation keywords strict mode rejects, and the $schema marker', () => {
    const text = JSON.stringify(schema);
    for (const keyword of ['"minLength"', '"maxLength"', '"minItems"', '"maxItems"', '"$schema"', '"format"']) {
      expect(text).not.toContain(keyword);
    }
  });

  it('keeps enums and nullability, which carry the real constraints', () => {
    const text = JSON.stringify(schema);
    expect(text).toContain('"IRREGULAR_VERB"');
    expect(text).toContain('"null"'); // nullable fields
    expect(text).toContain('"high"');
  });

  it('works for a small ad-hoc schema too', () => {
    const json = toProviderJsonSchema(z.object({ a: z.string().min(2), b: z.number().nullable() }));
    expect(json['required']).toEqual(['a', 'b']);
    expect(json['additionalProperties']).toBe(false);
  });
});
