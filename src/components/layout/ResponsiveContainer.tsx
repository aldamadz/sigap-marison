import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface ResponsiveContainerProps {
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  padding?: boolean;
}

export function ResponsiveContainer({ 
  children, 
  className,
  size = 'full',
  padding = true 
}: ResponsiveContainerProps) {
  const sizeClasses = {
    sm: 'max-w-3xl',
    md: 'max-w-4xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
    full: ''
  };

  return (
    <div className={cn(
      'w-full mx-auto',
      sizeClasses[size],
      padding && 'px-0',
      className
    )}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, children, className }: PageHeaderProps) {
  return (
    <div className={cn(
      'mb-5 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between',
      className
    )}>
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl lg:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {subtitle}
          </p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 sm:gap-3">
          {children}
        </div>
      )}
    </div>
  );
}

interface ResponsiveGridProps {
  children: ReactNode;
  cols?: 1 | 2 | 3 | 4 | 5 | 6;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ResponsiveGrid({ 
  children, 
  cols = 3,
  gap = 'md',
  className 
}: ResponsiveGridProps) {
  const colClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'
  };

  const gapClasses = {
    sm: 'gap-3',
    md: 'gap-4 sm:gap-6',
    lg: 'gap-6 sm:gap-8'
  };

  return (
    <div className={cn(
      'grid',
      colClasses[cols],
      gapClasses[gap],
      className
    )}>
      {children}
    </div>
  );
}

interface MobileHideProps {
  children: ReactNode;
  className?: string;
}

export function MobileHide({ children, className }: MobileHideProps) {
  return (
    <div className={cn('hidden sm:block', className)}>
      {children}
    </div>
  );
}

interface DesktopHideProps {
  children: ReactNode;
  className?: string;
}

export function DesktopHide({ children, className }: DesktopHideProps) {
  return (
    <div className={cn('sm:hidden', className)}>
      {children}
    </div>
  );
}

interface ResponsiveTableProps {
  children: ReactNode;
  className?: string;
}

export function ResponsiveTable({ children, className }: ResponsiveTableProps) {
  return (
    <div className={cn(
      'overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0',
      className
    )}>
      <div className="min-w-full inline-block align-middle">
        {children}
      </div>
    </div>
  );
}

interface ActionButtonsProps {
  children: ReactNode;
  className?: string;
  mobileStack?: boolean;
}

export function ActionButtons({ 
  children, 
  className,
  mobileStack = true 
}: ActionButtonsProps) {
  return (
    <div className={cn(
      'flex items-center gap-2 sm:gap-3',
      mobileStack && 'flex-col sm:flex-row',
      className
    )}>
      {children}
    </div>
  );
}
