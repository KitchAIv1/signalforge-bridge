import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrokerTimestamp } from './normalizeBrokerTimestamp.js';

describe('normalizeBrokerTimestamp', () => {
  it('converts ISO strings unchanged in meaning', () => {
    const iso = '2026-07-01T22:11:23.000Z';
    assert.equal(normalizeBrokerTimestamp(iso), iso);
  });

  it('converts JS Date toString formats to ISO', () => {
    const parsed = normalizeBrokerTimestamp('Wed Jul 01 2026 18:11:23 GMT-0400 (Eastern Daylight Time)');
    assert.equal(parsed, '2026-07-01T22:11:23.000Z');
  });

  it('converts Date objects to ISO', () => {
    const date = new Date('2026-07-01T22:11:23.000Z');
    assert.equal(normalizeBrokerTimestamp(date), '2026-07-01T22:11:23.000Z');
  });
});
