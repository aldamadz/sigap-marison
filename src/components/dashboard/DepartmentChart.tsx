// frontend/src/components/dashboard/DepartmentChart.tsx
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { DepartmentActivity } from '@/types/dashboard';

interface DepartmentChartProps {
  data: DepartmentActivity[];
  officeName?: string;
}

/**
 * Custom Tooltip dengan styling modern
 */
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-elevated)]">
        <p className="mb-2 border-b border-border pb-1 text-sm font-semibold text-foreground">
          {label}
        </p>
        <div className="space-y-2">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-6 text-xs">
              <div className="flex items-center gap-2">
                <div 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: entry.fill }} 
                />
                <span className="text-muted-foreground font-medium">{entry.name}</span>
              </div>
              <span className="rounded bg-muted px-1.5 font-mono font-semibold text-foreground">
                {entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const DepartmentChart = ({ data, officeName }: DepartmentChartProps) => {
  const hasData = data && data.length > 0;

  return (
    <div className="sigap-panel flex h-full min-h-[430px] flex-col p-5 sm:p-6">
      {/* Header Grafik */}
      <div className="flex flex-col mb-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            Aktivitas Departemen {officeName ? `— ${officeName}` : ''}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Jumlah agenda dan penyelesaian per divisi.
        </p>
      </div>

      <div className="flex-1 w-full mt-auto relative">
        {!hasData ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center opacity-50">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-md bg-muted">
              <span className="text-xl">📊</span>
            </div>
            <p className="text-xs font-medium text-muted-foreground">Belum ada data aktivitas divisi</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={data} 
              // Margin bottom ditambah untuk menampung rotasi label yang panjang
              margin={{ top: 10, right: 10, left: -20, bottom: 80 }}
              barGap={6}
            >
              <CartesianGrid 
                strokeDasharray="3 3" 
                vertical={false} 
                stroke="hsl(var(--border))" 
                opacity={0.4}
              />
              
              <XAxis 
                dataKey="name" 
                fontSize={9}
                tickLine={false}
                axisLine={false}
                stroke="hsl(var(--muted-foreground))"
                interval={0} 
                angle={-45}  
                textAnchor="end"
                dy={12}      
                className="font-medium"
              />
              
              <YAxis 
                fontSize={11}
                tickLine={false}
                axisLine={false}
                stroke="hsl(var(--muted-foreground))"
                allowDecimals={false}
              />
              
              <Tooltip 
                content={<CustomTooltip />} 
                cursor={{ fill: 'hsl(var(--muted)/0.15)' }}
                isAnimationActive={true}
                animationDuration={300}
              />

              <Legend 
                verticalAlign="top" 
                align="right"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ 
                  fontSize: '10px', 
                  paddingBottom: '20px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 700
                }}
              />
              
              <Bar 
                dataKey="tasks" 
                name="Total Agenda" 
                fill="hsl(var(--primary))" 
                radius={[4, 4, 0, 0]}
                barSize={14}
                animationDuration={1500}
                animationEasing="ease-out"
              />
              
              <Bar 
                dataKey="completed" 
                name="Selesai" 
                fill="#10b981" 
                radius={[4, 4, 0, 0]} 
                barSize={14}
                animationDuration={1500}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
