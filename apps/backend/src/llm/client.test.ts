import { describe, expect, it } from 'vitest';
import { parseArgs } from './client';

describe('parseArgs', () => {
  it('parses a JSON object', () => {
    expect(parseArgs('{"ms":1000}')).toEqual({ args: { ms: 1000 } });
  });

  it('reports broken JSON instead of throwing', () => {
    const r = parseArgs('{"ms":');
    expect(r.args).toEqual({});
    expect(r.parseError).toBeTruthy();
  });

  it('rejects JSON that is not an object', () => {
    expect(parseArgs('[1,2]').parseError).toContain('object');
    expect(parseArgs('null').parseError).toContain('object');
  });
});
