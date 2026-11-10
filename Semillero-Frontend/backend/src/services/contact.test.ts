import { describe, it, expect } from 'vitest';
import { normalizePhone } from './contact';

describe('normalizePhone', () => {
  it.each([
    ['300 123 4567', '+573001234567'],
    ['(+57) 300-123-4567', '+573001234567'],
    ['0057 3001234567', '+573001234567'],
    ['573001234567', '+573001234567'],
    ['601 234 5678', '+576012345678'],
    ['+1 (415) 555-0100', '+14155550100'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each([null, undefined, '', '12345', 'sin teléfono', '1234567890123456'])('descarta %s', (raw) => {
    expect(normalizePhone(raw as string | null | undefined)).toBeNull();
  });
});
