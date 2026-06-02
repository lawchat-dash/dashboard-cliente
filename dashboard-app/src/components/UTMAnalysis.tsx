import { useMemo } from 'react';
import { Card } from '@/api/helena';
import { extractCampaign } from '@/utils/extractCampaign';
import { useClassify } from '@/contexts/StepMappingsContext';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Megaphone } from 'lucide-react';
import { motion } from 'framer-motion';

interface UTMAnalysisProps {
  cards: Card[];
}

const COLORS = ['#2563EB', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const UTMAnalysis = ({ cards }: UTMAnalysisProps) => {
  const { classify } = useClassify();
  const campaigns = useMemo(() => {
    const map = new Map<string, { total: number; converted: number; won: number; value: number }>();
    const nonArchived = cards.filter(c => !c.archived);

    nonArchived.forEach(card => {
      const campaign = extractCampaign(card);
      const existing = map.get(campaign) || { total: 0, converted: 0, won: 0, value: 0 };
      existing.total++;
      const step = classify(card);
      if (['CLOSER', 'CONTRATO', 'ETAPA DE ASSINATURA', 'CONTRATO FECHADO'].includes(step)) {
        existing.converted++;
      }
      if (step === 'CONTRATO FECHADO' || card.stepPhase === 'WON') {
        existing.won++;
      }
      existing.value += card.monetaryAmount || 0;
      map.set(campaign, existing);
    });

    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        ...data,
        conversionRate: data.total > 0 ? (data.won / data.total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [cards, classify]);

  const pieData = campaigns.map(c => ({ name: c.name, value: c.total }));

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <h3 className="mb-5 flex items-center gap-2 text-lg font-semibold text-foreground">
        <Megaphone className="h-5 w-5 text-muted-foreground" />
        Análise de Campanhas
      </h3>
      <div className="grid gap-6 lg:grid-cols-[1fr_200px]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Campanha</th>
                <th className="pb-2 text-right font-medium">Leads</th>
                <th className="pb-2 text-right font-medium">Conversão</th>
                <th className="pb-2 text-right font-medium">Fechados</th>
                <th className="pb-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c, i) => (
                <motion.tr
                  key={c.name}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="py-2.5 font-medium text-foreground">{c.name}</td>
                  <td className="py-2.5 text-right tabular-nums">{c.total}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatPercent(c.conversionRate)}</td>
                  <td className="py-2.5 text-right tabular-nums">{c.won}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatCurrency(c.value)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-center">
          <ResponsiveContainer width={180} height={180}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [value, 'Leads']}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default UTMAnalysis;
