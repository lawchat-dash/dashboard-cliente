// Helpers de score / prioridade / avatar para a Auditoria de Atendimentos

export const STAGE_WEIGHT: Record<string, number> = {
  'SDR': 35, 'CLOSER': 60, 'ANALISE MANUAL': 55, 'CONTRATO': 80,
  'ETAPA DE ASSINATURA': 90, 'CONTRATO FECHADO': 100, 'DESQUALIFICADO': 10,
};

export const STAGE_COLORS: Record<string, string> = {
  'SDR': 'hsl(var(--kpi-blue))',
  'CLOSER': 'hsl(var(--kpi-cyan))',
  'ANALISE MANUAL': 'hsl(var(--kpi-indigo))',
  'CONTRATO': 'hsl(var(--kpi-amber))',
  'ETAPA DE ASSINATURA': 'hsl(var(--kpi-violet))',
  'CONTRATO FECHADO': 'hsl(var(--kpi-emerald))',
  'DESQUALIFICADO': 'hsl(var(--kpi-rose))',
};

const AVATAR_PALETTES = [
  { bg: 'bg-blue-100 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-300' },
  { bg: 'bg-emerald-100 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-300' },
  { bg: 'bg-violet-100 dark:bg-violet-500/20', text: 'text-violet-600 dark:text-violet-300' },
  { bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-300' },
  { bg: 'bg-pink-100 dark:bg-pink-500/20', text: 'text-pink-600 dark:text-pink-300' },
  { bg: 'bg-cyan-100 dark:bg-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-300' },
];

export function avatarPalette(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

export function initialOf(name: string) {
  const clean = (name || '').replace(/[^\p{L}\p{N} ]/gu, '').trim();
  return (clean[0] || '?').toUpperCase();
}

export function computeScore(stage: string, tagCount: number, hasPhone: boolean, hasCampaign: boolean): number {
  let score = STAGE_WEIGHT[stage] ?? 30;
  score += Math.min(tagCount * 4, 12);
  if (hasPhone) score += 4;
  if (hasCampaign) score += 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function priorityOf(score: number, stage: string): { label: string; color: string; dot: string } {
  if (stage === 'DESQUALIFICADO') return { label: 'Baixa', color: 'text-muted-foreground', dot: 'bg-muted-foreground/40' };
  if (score >= 75) return { label: 'Alta', color: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' };
  if (score >= 50) return { label: 'Média', color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' };
  return { label: 'Baixa', color: 'text-muted-foreground', dot: 'bg-muted-foreground/40' };
}

export function scoreColor(score: number): { bg: string; text: string } {
  if (score >= 75) return { bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400' };
  if (score >= 50) return { bg: 'bg-amber-100 dark:bg-amber-500/15', text: 'text-amber-700 dark:text-amber-400' };
  return { bg: 'bg-slate-100 dark:bg-slate-500/15', text: 'text-slate-600 dark:text-slate-400' };
}
