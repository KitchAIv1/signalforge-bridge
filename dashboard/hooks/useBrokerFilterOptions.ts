'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export function useBrokerFilterOptions(): {
  brokerOptions: Array<{ value: string; label: string }>;
  loading: boolean;
} {
  const [brokerOptions, setBrokerOptions] = useState<Array<{ value: string; label: string }>>([
    { value: '', label: 'All brokers' },
  ]);
  const [loading, setLoading] = useState(true);

  const fetchBrokers = useCallback(async () => {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('bridge_brokers')
      .select('broker_id, display_name')
      .order('broker_id');
    const options = [{ value: '', label: 'All brokers' }];
    for (const row of data ?? []) {
      options.push({
        value: row.broker_id as string,
        label: (row.display_name as string) ?? (row.broker_id as string),
      });
    }
    setBrokerOptions(options);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchBrokers();
  }, [fetchBrokers]);

  return { brokerOptions, loading };
}
