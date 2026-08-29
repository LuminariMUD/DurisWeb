import { describe, expect, it } from '@jest/globals';
import {
  validateCreateIncidentBody,
  validateUpdateIncidentBody,
} from '../incidentValidation.js';

const validCreate = {
  incident_type: 'maintenance',
  severity: 'minor',
  title: 'Scheduled maintenance',
  description: 'Routine maintenance window',
  started_at: '2026-08-28T22:00:00.000Z',
};

describe('incident write validation', () => {
  it('accepts a valid create payload', () => {
    expect(validateCreateIncidentBody(validCreate)).toBeNull();
  });

  it('rejects unknown create fields', () => {
    expect(validateCreateIncidentBody({ ...validCreate, is_admin: true })).toMatch(/Unknown field/);
  });

  it('rejects invalid enums and dates', () => {
    expect(validateCreateIncidentBody({ ...validCreate, incident_type: 'debug' })).toMatch(/incident_type/);
    expect(validateCreateIncidentBody({ ...validCreate, started_at: 'not-a-date' })).toMatch(/started_at/);
  });

  it('rejects truthy strings for boolean fields', () => {
    expect(validateCreateIncidentBody({ ...validCreate, resolved: 'true' })).toMatch(/resolved/);
    expect(validateCreateIncidentBody({ ...validCreate, public_visible: 1 })).toMatch(/public_visible/);
  });

  it('rejects oversized text before persistence', () => {
    expect(validateCreateIncidentBody({ ...validCreate, title: 'x'.repeat(256) })).toMatch(/title/);
  });

  it('accepts a valid partial update', () => {
    expect(validateUpdateIncidentBody({ resolved: true, resolution_notes: 'Resolved' })).toBeNull();
  });

  it('rejects empty and unknown partial updates', () => {
    expect(validateUpdateIncidentBody({})).toMatch(/At least one/);
    expect(validateUpdateIncidentBody({ arbitrary: 'value' })).toMatch(/Unknown field/);
  });

  it('validates forensic numeric and text fields', () => {
    expect(validateUpdateIncidentBody({ pid: 12.5 })).toMatch(/pid/);
    expect(validateUpdateIncidentBody({ backtrace: 'x'.repeat(100_001) })).toMatch(/backtrace/);
    expect(validateUpdateIncidentBody({ has_backtrace: 'yes' })).toMatch(/has_backtrace/);
  });
});
