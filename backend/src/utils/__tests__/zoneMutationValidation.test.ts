import { describe, expect, it } from '@jest/globals';
import {
  parseZoneNumber,
  validateBulkZoneUpdatePayload,
  validateZoneUpdatePayload,
} from '../zoneMutationValidation.js';

describe('zone mutation payload validation', () => {
  it('parses only canonical safe integer zone numbers', () => {
    expect(parseZoneNumber('12')).toBe(12);
    expect(parseZoneNumber('12abc')).toBeNull();
    expect(parseZoneNumber('1.5')).toBeNull();
    expect(parseZoneNumber('-1')).toBeNull();
  });

  it('rejects string coercion and unknown fields', () => {
    expect(validateZoneUpdatePayload({ taskZone: 'false' })).toContain('taskZone');
    expect(validateZoneUpdatePayload({ alignment: 1, unexpected: true })).toContain('Unknown field');
  });

  it('requires a bounded strict update object', () => {
    expect(validateZoneUpdatePayload({})).toContain('At least one');
    expect(validateZoneUpdatePayload({ alignment: 6 })).toContain('at most 5');
    expect(validateZoneUpdatePayload({ difficulty: 2.5 })).toContain('integer');
    expect(validateZoneUpdatePayload({ alignment: 2, taskZone: false })).toBeNull();
  });

  it('rejects partial/oversized bulk input and accepts valid bulk input', () => {
    expect(validateBulkZoneUpdatePayload({
      zoneNumbers: [1, '2'],
      data: { alignment: 1 },
    })).toContain('zoneNumbers[]');
    expect(validateBulkZoneUpdatePayload({
      zoneNumbers: Array.from({ length: 1001 }, (_, index) => index),
      data: { alignment: 1 },
    })).toContain('at most 1000');
    expect(validateBulkZoneUpdatePayload({
      zoneNumbers: [1, 2],
      data: { questZone: false, difficulty: 4 },
    })).toBeNull();
  });
});
