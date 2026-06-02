import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StepMapping {
  step_id: string;
  step_title: string;
  funnel_stage: string;
}

export type StepMappingsMap = Map<string, string>; // step_id -> funnel_stage

export function useStepMappings(clientId?: string) {
  const [mappings, setMappings] = useState<StepMappingsMap>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId) {
      setMappings(new Map());
      return;
    }

    setLoading(true);
    supabase
      .from('client_step_mappings')
      .select('step_id, funnel_stage')
      .eq('client_id', clientId)
      .then(({ data }) => {
        const map = new Map<string, string>();
        (data || []).forEach((row: any) => {
          map.set(row.step_id, row.funnel_stage);
        });
        setMappings(map);
        setLoading(false);
      });
  }, [clientId]);

  return { mappings, loading };
}
