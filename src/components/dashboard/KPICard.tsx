import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, CheckCircle2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  data: {
    label: string;
    value: number;        // Jumlah yang sudah selesai (misal: 7)
    total?: number;       // Total pengajuan (misal: 15)
    change: number;      // Persentase porsi dari total
    trend: 'up' | 'down' | 'neutral';
    isProgressCard?: boolean; // Flag khusus untuk kartu "Selesai"
  };
  index: number;
}

export const KPICard = ({ data, index }: KPICardProps) => {
  if (!data) return null;

  const { label, value, total, change, trend, isProgressCard } = data;
  const progressPercent = total && total > 0 ? (value / total) * 100 : 0;
  const effectiveTrend: 'up' | 'down' | 'neutral' =
    isProgressCard && progressPercent === 0 ? 'neutral' : trend;
  const displayPercent = isProgressCard && total ? progressPercent : Math.abs(change);
  const showPercentBadge = label !== 'Total Agenda';

  const TrendIcon = effectiveTrend === 'up' ? TrendingUp : effectiveTrend === 'down' ? TrendingDown : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="sigap-panel min-h-[132px] p-5 transition-colors hover:border-primary/25"
    >
      <div className="space-y-4">
        {/* Header Label */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isProgressCard ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            ) : (
              <FileText className="w-3 h-3 text-primary" />
            )}
            <p className="text-xs font-semibold text-muted-foreground">
              {label}
            </p>
          </div>
          
          {/* Badge Persentase */}
          {showPercentBadge && (
            <div className={cn(
              "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border",
              effectiveTrend === 'up' && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
              effectiveTrend === 'down' && "bg-rose-500/10 text-rose-600 border-rose-500/20",
              effectiveTrend === 'neutral' && "bg-muted text-muted-foreground"
            )}>
              <TrendIcon className="w-2.5 h-2.5" />
              <span>{displayPercent.toFixed(0)}%</span>
            </div>
          )}
        </div>

        {/* Value Display */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
            {value}
          </span>
          {isProgressCard && total && (
            <span className="text-sm font-semibold text-muted-foreground">
              / {total}
            </span>
          )}
        </div>

        {/* Progress Visual - Tampil hanya jika isProgressCard */}
        {isProgressCard && total && (
          <div className="space-y-2 pt-2">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
              />
            </div>
            <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
              <span>Progress Penyelesaian</span>
              <span>{progressPercent.toFixed(0)}%</span>
            </div>
          </div>
        )}

        {!isProgressCard && <div className="pt-1" />}
      </div>
    </motion.div>
  );
};
