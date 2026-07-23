import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  inferMt5SymbolSuffixFromSymbols,
  normalizeMt5SymbolSuffix,
  resolveMt5SymbolSuffix,
} from './mt5SymbolSuffix.js';

describe('normalizeMt5SymbolSuffix', () => {
  it('accepts hyphen, underscore, and bare token forms', () => {
    assert.equal(normalizeMt5SymbolSuffix('-STD'), '-STD');
    assert.equal(normalizeMt5SymbolSuffix('STD'), '-STD');
    assert.equal(normalizeMt5SymbolSuffix('AUDUSD-STD'), '-STD');
    assert.equal(normalizeMt5SymbolSuffix('AUDUSD_STD'), '-STD');
    assert.equal(normalizeMt5SymbolSuffix('audusd-vip'), '-VIP');
  });

  it('rejects empty / garbage', () => {
    assert.equal(normalizeMt5SymbolSuffix(''), null);
    assert.equal(normalizeMt5SymbolSuffix('   '), null);
    assert.equal(normalizeMt5SymbolSuffix('!!!'), null);
  });
});

describe('inferMt5SymbolSuffixFromSymbols', () => {
  it('prefers -STD on live books that expose AUDUSD-STD', () => {
    assert.equal(
      inferMt5SymbolSuffixFromSymbols(['EURUSD', 'AUDUSD', 'AUDUSD-STD']),
      '-STD',
    );
  });

  it('prefers -VIP on demo VIP books', () => {
    assert.equal(
      inferMt5SymbolSuffixFromSymbols(['AUDUSD', 'AUDUSD-VIP']),
      '-VIP',
    );
  });

  it('returns null when only bare AUDUSD exists', () => {
    assert.equal(inferMt5SymbolSuffixFromSymbols(['AUDUSD', 'EURUSD']), null);
  });
});

describe('resolveMt5SymbolSuffix', () => {
  it('prefers DB over env over default', () => {
    assert.equal(
      resolveMt5SymbolSuffix({ dbSuffix: '-STD', envSuffix: '-VIP', defaultSuffix: '-ECN' }),
      '-STD',
    );
    assert.equal(
      resolveMt5SymbolSuffix({ dbSuffix: null, envSuffix: '-VIP', defaultSuffix: '-ECN' }),
      '-VIP',
    );
    assert.equal(
      resolveMt5SymbolSuffix({ dbSuffix: null, envSuffix: null }),
      '-STD',
    );
  });
});
