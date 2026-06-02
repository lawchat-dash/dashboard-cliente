import { createContext, useContext, useCallback, ReactNode } from 'react';
import { useStepMappings, StepMappingsMap } from '@/hooks/useStepMappings';
import { classifyStep } from '@/utils/normalizeStep';
import { Card } from '@/api/helena';

interface StepMappingsContextValue {
  mappings: StepMappingsMap;
  loading: boolean;
  classify: (card: Card) => string;
  classifyRaw: (stepTitle: string, stepId?: string) => string;
}

const StepMappingsContext = createContext<StepMappingsContextValue>({
  mappings: new Map(),
  loading: false,
  classify: (card) => classifyStep(card.stepTitle),
  classifyRaw: (stepTitle) => classifyStep(stepTitle),
});

export function StepMappingsProvider({ clientId, children }: { clientId?: string; children: ReactNode }) {
  const { mappings, loading } = useStepMappings(clientId);

  const classify = useCallback(
    (card: Card) => classifyStep(card.stepTitle, card.stepId, mappings),
    [mappings]
  );

  const classifyRaw = useCallback(
    (stepTitle: string, stepId?: string) => classifyStep(stepTitle, stepId, mappings),
    [mappings]
  );

  return (
    <StepMappingsContext.Provider value={{ mappings, loading, classify, classifyRaw }}>
      {children}
    </StepMappingsContext.Provider>
  );
}

export function useClassify() {
  return useContext(StepMappingsContext);
}
