import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBrokerClient } from './brokerFactory.js';
import { OMEGA_AO_SHADOW_BROKER_ID } from '../../core/alphaOmega/alphaOmegaConstants.js';

describe('createBrokerClient paper guard', () => {
  it('returns null for ao_shadow_paper / paper type', () => {
    const client = createBrokerClient(
      {
        broker_id: OMEGA_AO_SHADOW_BROKER_ID,
        broker_type: 'paper',
        account_id: null,
        is_active: false,
      },
      'omega',
    );
    assert.equal(client, null);
  });
});
