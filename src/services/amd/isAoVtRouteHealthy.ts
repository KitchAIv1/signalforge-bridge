/**
 * AO VT health for AMD arming: omega must have an active vtmarkets_ao_live route.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { OMEGA_AO_VT_BROKER_ID } from '../../core/alphaOmega/alphaOmegaConstants.js';
import { loadExecutionRoutes } from '../broker/brokerLinkService.js';

/** True when AO's MetaApi VT book is linked and client-constructible. */
export async function isAoVtRouteHealthy(supabase: SupabaseClient): Promise<boolean> {
  const routes = await loadExecutionRoutes(supabase, 'omega');
  return routes.some((route) => route.brokerId === OMEGA_AO_VT_BROKER_ID);
}
