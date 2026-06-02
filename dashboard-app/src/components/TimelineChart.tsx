import { useMemo } from 'react';
import { Card } from '@/api/helena';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts';
import { TrendingUp, Info } from 'lucide-react';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface TimelineChartProps {
  cards: Card[];
}

const TimelineChart = ({ cards }: TimelineChartProps) => {
  const { data, total, avg } = useMemo(() => {
    const map = new Map<string, number>();
    const nonArchived = cards.filter(c => !c.archived);

    nonArchived.forEach(card => {
      const date = new Date(card.createdAt).toISOString().split('T')[0];
      map.set(date, (map.get(date) || 0) + 1);
    });

    const entries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const total = entries.reduce((s, [, c]) => s + c, 0);
    const days = entries.length || 1;

    const data = entries.map(([date, count]) => ({
      date: new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      cards: count,
    }));

    return { data, total, avg: (total / days).toFixed(1) };
  }, [cards]);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="mb-1 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Novos Chats</h3>
        <UITooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-[240px] text-xs">
            Quantidade de chats criados por dia no período. Total = soma de todos os chats. Média = total ÷ quantidade de dias.
          </TooltipContent>
        </UITooltip>
      </div>
      <p className="mb-5 text-xs text-muted-foreground">Número de chats criados no período selecionado</p>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'hsl(220, 9%, 46%)' }}
            axisLine={{ stroke: 'hsl(220, 13%, 91%)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'hsl(220, 9%, 46%)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(0, 0%, 100%)',
              border: '1px solid hsl(220, 13%, 91%)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Line
            type="monotone"
            dataKey="cards"
            stroke="hsl(134, 100%, 37%)"
            strokeWidth={2}
            dot={{ r: 4, fill: 'hsl(134, 100%, 37%)', strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          >
            <LabelList dataKey="cards" position="top" style={{ fontSize: 10, fill: 'hsl(220, 9%, 46%)' }} />
          </Line>
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-4 flex items-center gap-6 border-t border-border pt-3">
        <div>
          <span className="text-xs text-muted-foreground">Total de Leads</span>
          <p className="text-lg font-bold text-foreground">{total}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Média por dia</span>
          <p className="text-lg font-bold text-foreground">{avg}</p>
        </div>
      </div>
    </div>
  );
};

export default TimelineChart;
