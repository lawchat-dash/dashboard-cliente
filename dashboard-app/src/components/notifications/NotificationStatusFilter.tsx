import { Radio, User, CheckCircle } from 'lucide-react';

export type StatusFilterValue = 'all' | 'new' | 'urgent' | 'assigned' | 'read' | 'resolved';

const tabConfig: { value: StatusFilterValue; label: string; icon: typeof Radio }[] = [
  { value: 'new', label: 'Novas', icon: Radio },
  { value: 'assigned', label: 'Minhas', icon: User },
  { value: 'resolved', label: 'Resolvidas', icon: CheckCircle },
];

interface Props {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
  counts?: Record<string, number>;
}

export const NotificationStatusFilter = ({ value, onChange, counts }: Props) => {
  return (
    <div className="flex flex-wrap gap-2">
      {tabConfig.map((tab) => {
        const Icon = tab.icon;
        const isActive = value === tab.value;
        const count = counts?.[tab.value] ?? 0;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
              isActive
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border/50 bg-card/50 text-muted-foreground hover:border-border hover:bg-card'
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
            {count > 0 && (
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs ${
                isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
