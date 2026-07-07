'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export interface UseBrokerFilterOptionsConfig {
  /** Hidden from Activity broker dropdown (e.g. Lane B experiment broker). */
  excludeBrokerIds?: string[];
}

export function useBrokerFilterOptions(
  config: UseBrokerFilterOptionsConfig = {},
): {
  brokerOptions: Array<{ value: string; label: string }>;
  loading: boolean;
} {
  const excludeKey = (config.excludeBrokerIds ?? []).join(',');
  const [brokerOptions, setBrokerOptions] = useState<Array<{ value: string; label: string }>>([
    { value: '', label: 'All brokers' },
  ]);
  const [loading, setLoading] = useState(true);

  const fetchBrokers = useCallback(async () => {
    const excludeSet = new Set(config.excludeBrokerIds ?? []);
    const supabase = getSupabase();
    const { data } = await supabase
      .from('bridge_brokers')
      .select('broker_id, display_name')
      .order('broker_id');
    const options = [{ value: '', label: 'All brokers' }];
    for (const row of data ?? []) {
      const brokerId = row.broker_id as string;
      if (excludeSet.has(brokerId)) continue;
      options.push({
        value: brokerId,
        label: (row.display_name as string) ?? brokerId,
      });
    }
    setBrokerOptions(options);
    setLoading(false);
  }, [excludeKey, config.excludeBrokerIds]);

  useEffect(() => {
    void fetchBrokers();
  }, [fetchBrokers]);

  return { brokerOptions, loading };
}
