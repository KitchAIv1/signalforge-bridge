import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildInitialDetectionLockFields,
  shouldSkipAmdDetectionForLockedRow,
} from './amdDetectionLock.js';

describe('shouldSkipAmdDetectionForLockedRow', () => {
  it('returns true when detection_locked=true (runAmdDetection guard)', () => {
    assert.equal(
      shouldSkipAmdDetectionForLockedRow({
        detection_locked: true,
        detection_locked_at: '2026-05-28T10:31:00.000Z',
        detection_locked_reason: 'initial_10:31_detection',
      }),
      true,
    );
  });

  it('returns false when row missing or unlocked', () => {
    assert.equal(shouldSkipAmdDetectionForLockedRow(null), false);
    assert.equal(shouldSkipAmdDetectionForLockedRow(undefined), false);
    assert.equal(
      shouldSkipAmdDetectionForLockedRow({
        detection_locked: false,
        detection_locked_at: null,
        detection_locked_reason: null,
      }),
      false,
    );
  });
});

describe('buildInitialDetectionLockFields', () => {
  it('sets lock fields for atomic 10:31 upsert', () => {
    const fields = buildInitialDetectionLockFields('2026-05-28T10:31:05.000Z');
    assert.equal(fields.detection_locked, true);
    assert.equal(fields.detection_locked_at, '2026-05-28T10:31:05.000Z');
    assert.equal(fields.detection_locked_reason, 'initial_10:31_detection');
  });
});
