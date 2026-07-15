import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from "@/lib/supabase";
import { CheckCircle2, Clock, XCircle, Inbox, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// ── Status resolver — identik dengan MonitoringPage ───────────────────────────
type DocStatusType = 'PROSES' | 'SELESAI' | 'DITOLAK';

const resolveStatusType = (surat: any, sigs: any[]): DocStatusType => {
  const hasRejectedSig = sigs.some((s: any) => s.status === 'REJECTED');
  const allSigned = sigs.length > 0 && sigs.every((s: any) => s.is_signed);

  if (hasRejectedSig || surat.status === 'REJECTED') return 'DITOLAK';
  if (allSigned || surat.status === 'DONE') return 'SELESAI';
  return 'PROSES';
};

const CARDS = [
  {
    key: 'total',
    label: 'Total Pengajuan',
    icon: Inbox,
    color: 'text-foreground',
    iconBg: 'bg-muted/60',
    iconColor: 'text-muted-foreground',
    border: 'border-border hover:border-primary/40',
    barColor: null as string | null,
    statusParam: null as string | null,
  },
  {
    key: 'selesai',
    label: 'Selesai',
    icon: CheckCircle2,
    color: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-400',
    border: 'border-emerald-500/20 hover:border-emerald-500/50',
    barColor: 'bg-emerald-500',
    statusParam: 'SELESAI',
  },
  {
    key: 'proses',
    label: 'Diproses',
    icon: Clock,
    color: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-400',
    border: 'border-amber-500/20 hover:border-amber-500/50',
    barColor: 'bg-amber-400',
    statusParam: 'PROSES',
  },
  {
    key: 'ditolak',
    label: 'Ditolak',
    icon: XCircle,
    color: 'text-red-400',
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-400',
    border: 'border-red-500/20 hover:border-red-500/50',
    barColor: 'bg-red-500',
    statusParam: 'DITOLAK',
  },
];

interface SuratSummaryCardsProps {
  dateFrom?: Date;
  dateTo?: Date;
}

export const SuratSummaryCards = ({ dateFrom, dateTo }: SuratSummaryCardsProps = {}) => {
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['surat-stats-dashboard', dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      let q = supabase
        .from('surat_registrasi')
        .select('id, status, surat_signatures ( is_signed, status )')
        .eq('created_by', session.user.id);

      if (dateFrom) q = q.gte('created_at', dateFrom.toISOString());
      if (dateTo)   q = q.lte('created_at', dateTo.toISOString());

      const { data, error } = await q;
      if (error) throw error;

      let selesai = 0, proses = 0, ditolak = 0;
      for (const s of data ?? []) {
        const sigs = (s.surat_signatures ?? []) as any[];
        const type = resolveStatusType(s, sigs);
        if      (type === 'SELESAI') selesai++;
        else if (type === 'DITOLAK') ditolak++;
        else                         proses++;
      }

      return { total: (data ?? []).length, selesai, proses, ditolak };
    },
  });

  if (isLoading) return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-lg bg-muted/40" />
      ))}
    </div>
  );

  if (!stats) return null;

  const values: Record<string, number> = {
    total:   stats.total,
    selesai: stats.selesai,
    proses:  stats.proses,
    ditolak: stats.ditolak,
  };

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {CARDS.map((card, i) => {
        const value = values[card.key] ?? 0;
        const pct   = stats.total > 0 ? (value / stats.total) * 100 : 0;

        return (
          <motion.button
            key={card.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, type: 'spring', stiffness: 260, damping: 22 }}
            onClick={() => navigate(
              card.statusParam
                ? `/surat/monitoring?status=${card.statusParam}`
                : '/surat/monitoring'
            )}
            className={cn(
              'group relative flex min-h-[132px] cursor-pointer flex-col overflow-hidden rounded-lg border bg-card p-5 text-left',
              'shadow-[var(--shadow-card)] transition-all duration-200',
              'hover:border-primary/35 active:translate-y-0 active:shadow-sm',
              card.border,
            )}
          >
            {/* Icon + arrow */}
            <div className="flex items-start justify-between mb-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', card.iconBg)}>
                <card.icon className={cn('w-4 h-4', card.iconColor)} strokeWidth={2.5} />
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-transparent -translate-x-1 group-hover:translate-x-0 group-hover:text-muted-foreground/40 transition-all duration-200" />
            </div>

            {/* Label */}
            <p className="mb-2 text-xs font-semibold leading-none text-muted-foreground">
              {card.label}
            </p>

            {/* Value + pct */}
            <div className="flex items-baseline gap-2 mt-auto">
              <span className={cn('text-3xl font-semibold tracking-tight tabular-nums leading-none', card.color)}>
                {value}
              </span>
              {card.barColor && stats.total > 0 && (
                <span className="text-xs font-medium text-muted-foreground leading-none">
                  {Math.round(pct)}%
                </span>
              )}
            </div>

            <p className="mt-1 text-xs font-medium text-muted-foreground">
              dari {stats.total} pengajuan
            </p>

            {/* Animated progress bar */}
            {card.barColor && (
              <div className="absolute bottom-0 left-0 w-full h-[3px] bg-muted/60">
                <motion.div
                  className={card.barColor}
                  style={{ height: '100%' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: i * 0.08 + 0.3, duration: 0.9, ease: 'easeOut' }}
                />
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};
