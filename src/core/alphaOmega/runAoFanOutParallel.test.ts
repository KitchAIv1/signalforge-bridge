/**
 * Unit tests: AO fan-out partition + settled parallel runner.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  partitionAoFanOutRoutes,
  settleBrokerFanOutTasks,
  settleBrokerFanOutTasksWithFlags,
} from './runAoFanOutParallel.js';

describe('partitionAoFanOutRoutes', () => {
  it('splits Lane B AO books from Trail / other omega routes', () => {
    const routes = [
      { brokerId: 'oanda_phase2_demo' },
      { brokerId: 'oanda_practice' },
      { brokerId: 'vtmarkets_ao_live' },
      { brokerId: 'vtmarkets_omega_demo' },
    ];
    const { aoRoutes, otherRoutes } = partitionAoFanOutRoutes(routes);
    assert.deepEqual(
      aoRoutes.map((route) => route.brokerId),
      ['oanda_phase2_demo', 'vtmarkets_ao_live'],
    );
    assert.deepEqual(
      otherRoutes.map((route) => route.brokerId),
      ['oanda_practice', 'vtmarkets_omega_demo'],
    );
  });
});

describe('settleBrokerFanOutTasks', () => {
  it('runs tasks concurrently and keeps going if one rejects', async () => {
    const started: number[] = [];
    const order: string[] = [];
    await settleBrokerFanOutTasks('test', [
      async () => {
        started.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 40));
        order.push('a');
      },
      async () => {
        started.push(Date.now());
        throw new Error('route-b-fail');
      },
      async () => {
        started.push(Date.now());
        order.push('c');
      },
    ]);
    assert.ok(started.length === 3);
    assert.ok(Math.abs(started[0]! - started[1]!) < 25);
    assert.deepEqual(order.sort(), ['a', 'c']);
  });
});

describe('settleBrokerFanOutTasksWithFlags', () => {
  it('ORs fulfilled booleans and tolerates a rejection', async () => {
    const handled = await settleBrokerFanOutTasksWithFlags('test-flags', [
      async () => false,
      async () => {
        throw new Error('boom');
      },
      async () => true,
    ]);
    assert.equal(handled, true);
  });
});
