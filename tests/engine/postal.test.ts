import { describe, expect, it } from 'vitest';
import { parsePostalCode } from '@/lib/engine/postal';

describe('parsePostalCode', () => {
  it.each([
    ['M5V 2T6', 'M5V 2T6', 'M5V'],
    ['m5v2t6', 'M5V 2T6', 'M5V'],
    ['  k1a-0b1 ', 'K1A 0B1', 'K1A'],
    ['V6B  1A1', 'V6B 1A1', 'V6B'],
    ['H2X 1Y4', 'H2X 1Y4', 'H2X'],
  ])('normalizes %j → %s (FSA %s)', (input, postalCode, fsa) => {
    expect(parsePostalCode(input)).toEqual({ ok: true, postalCode, fsa });
  });

  it.each([
    ['', /required/],
    ['   ', /required/],
    ['90210', /not a valid/], // US ZIP
    ['M5V 2T', /not a valid/], // too short
    ['M5V 2T66', /not a valid/], // too long
    ['D5V 2T6', /not a valid/], // D never used
    ['M5V 2O6', /not a valid/], // O never used
    ['W5V 2T6', /not a valid/], // W not allowed first
    ['Z5V 2T6', /not a valid/], // Z not allowed first
    ['55V 2T6', /not a valid/], // wrong pattern
  ])('rejects %j', (input, message) => {
    const result = parsePostalCode(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });

  it('allows W and Z outside the first position', () => {
    expect(parsePostalCode('T2W 1Z9').ok).toBe(true);
  });
});
