export function normalizeStepTitle(stepTitle: string): string {
  return stepTitle
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
    .replace(/[^a-zA-Z0-9À-ÿ\s]/g, '')
    .trim()
    .toUpperCase();
}

export const FUNNEL_STEPS = [
  'SDR',
  'CLOSER',
  'ANALISE MANUAL',
  'CONTRATO',
  'ETAPA DE ASSINATURA',
  'CONTRATO FECHADO',
  'DESQUALIFICADO',
  'NAO ASSINOU',
] as const;

export type FunnelStep = typeof FUNNEL_STEPS[number];

export const STEP_DISPLAY_NAMES: Record<string, string> = {
  'SDR': 'SDR',
  'CLOSER': 'Closer',
  'ANALISE MANUAL': 'Análise Manual',
  'CONTRATO': 'Confecção de Contrato',
  'ETAPA DE ASSINATURA': 'Aguardando Assinatura',
  'CONTRATO FECHADO': 'Contrato Assinado',
  'DESQUALIFICADO': 'Desqualificado',
  'NAO ASSINOU': 'Não Assinou',
};

export function getStepDisplayName(step: string): string {
  return STEP_DISPLAY_NAMES[step] || step;
}

export function classifyStep(stepTitle: string, stepId?: string, mappings?: Map<string, string>): string {
  // If client-specific mappings exist and contain this step_id, use that
  if (stepId && mappings && mappings.has(stepId)) {
    return mappings.get(stepId)!;
  }

  const normalized = normalizeStepTitle(stepTitle);
  if (normalized.includes('SDR')) return 'SDR';
  if (normalized.includes('CLOSER')) return 'CLOSER';
  if (normalized.includes('CONTRATO FECHADO') || normalized.includes('CONTRATO ASSINADO')) return 'CONTRATO FECHADO';
  if (normalized.includes('NAO SEGUIU COM O CONTRATO') || normalized.includes('FIZEMOS CONTRATO NAO ASSINOU') || normalized.includes('NAO ASSINOU')) return 'NAO ASSINOU';
  if (normalized.includes('ASSINATURA') || normalized.includes('AGUARDANDO ASSINATURA')) return 'ETAPA DE ASSINATURA';
  if (normalized.includes('CONTRATO') || normalized.includes('ELABORA') || normalized.includes('CONFECCAO')) return 'CONTRATO';
  if (normalized.includes('DESQUALIFICADO') || normalized.includes('DESCARTADO') || normalized.includes('NAO TEM INTERESSE')) return 'DESQUALIFICADO';
  if (normalized.includes('COMERCIAL')) return 'CLOSER';
  if (normalized.includes('ANALISE MANUAL')) return 'ANALISE MANUAL';
  return normalized;
}
