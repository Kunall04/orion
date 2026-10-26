import { describe, expect, it } from 'vitest';
import { stripCorruptLineNumbers } from './fileContent';

describe('stripCorruptLineNumbers', () => {
  it('returns empty string or null untouched', () => {
    expect(stripCorruptLineNumbers('')).toBe('');
    expect(stripCorruptLineNumbers(null as any)).toBe(null);
  });

  it('strips double-nested line numbers like "1: 1: import"', () => {
    const corrupted = [
      '1: 1: import { useState } from "react";',
      '2: 2: import { PageMeta } from "@/components/PageMeta";',
      '3: 3: import { Link } from "react-router-dom";',
      '4: 4: ',
      '5: 5: export function App() {',
      '6: 6:   return <div>Hello</div>;',
      '7: 7: }',
    ].join('\n');

    const cleaned = stripCorruptLineNumbers(corrupted);
    expect(cleaned).toBe(
      [
        'import { useState } from "react";',
        'import { PageMeta } from "@/components/PageMeta";',
        'import { Link } from "react-router-dom";',
        '',
        'export function App() {',
        '  return <div>Hello</div>;',
        '}',
      ].join('\n')
    );
  });

  it('strips single sequential line numbers like "1: import"', () => {
    const singleCorrupted = [
      '1: import React from "react";',
      '2: export const x = 1;',
      '3: export const y = 2;',
      '4: ',
      '5: export default x;',
    ].join('\n');

    const cleaned = stripCorruptLineNumbers(singleCorrupted);
    expect(cleaned).toBe(
      [
        'import React from "react";',
        'export const x = 1;',
        'export const y = 2;',
        '',
        'export default x;',
      ].join('\n')
    );
  });

  it('preserves clean code without line numbers', () => {
    const cleanCode = [
      'import React from "react";',
      '',
      'export function Test() {',
      '  const x = 10;',
      '  return <div>{x}</div>;',
      '}',
    ].join('\n');

    expect(stripCorruptLineNumbers(cleanCode)).toBe(cleanCode);
  });

  it('preserves code with switch cases and colons', () => {
    const code = [
      'switch (val) {',
      '  case 1:',
      '    return "one";',
      '  case 2:',
      '    return "two";',
      '}',
    ].join('\n');

    expect(stripCorruptLineNumbers(code)).toBe(code);
  });
});
