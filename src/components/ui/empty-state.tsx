import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Inbox,
  FileX,
  SearchX,
  AlertCircle,
  Plus,
  RefreshCw,
  Settings
} from 'lucide-react'

type EmptyVariant = 'default' | 'no-data' | 'no-results' | 'error' | 'empty-list'

interface EmptyStateProps {
  variant?: EmptyVariant
  title?: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  icon?: React.ReactNode
  className?: string
}

const PRESETS: Record<EmptyVariant, {
  icon: React.ReactNode
  defaultTitle: string
  defaultDescription: string
  iconBg: string
  iconColor: string
}> = {
  default: {
    icon: <Inbox className="w-8 h-8" />,
    defaultTitle: 'Tidak ada data',
    defaultDescription: 'Data belum tersedia saat ini.',
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
  },
  'no-data': {
    icon: <FileX className="w-8 h-8" />,
    defaultTitle: 'Belum Ada Data',
    defaultDescription: 'Mulai dengan menambahkan data baru.',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
  },
  'no-results': {
    icon: <SearchX className="w-8 h-8" />,
    defaultTitle: 'Tidak Ditemukan',
    defaultDescription: 'Coba ubah kata kunci pencarian Anda.',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-500',
  },
  error: {
    icon: <AlertCircle className="w-8 h-8" />,
    defaultTitle: 'Terjadi Kesalahan',
    defaultDescription: 'Gagal memuat data. Silakan coba lagi.',
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-500',
  },
  'empty-list': {
    icon: <Inbox className="w-8 h-8" />,
    defaultTitle: 'Daftar Kosong',
    defaultDescription: 'Belum ada item di sini.',
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
  },
}

const QuickActions: Record<string, { icon: React.ReactNode; label: string }> = {
  'Tambah': { icon: <Plus className="w-4 h-4" />, label: 'Tambah Baru' },
  'Refresh': { icon: <RefreshCw className="w-4 h-4" />, label: 'Muat Ulang' },
  'Pengaturan': { icon: <Settings className="w-4 h-4" />, label: 'Pengaturan' },
}

export function EmptyState({
  variant = 'default',
  title,
  description,
  action,
  icon,
  className
}: EmptyStateProps) {
  const preset = PRESETS[variant]

  // Handle quick action labels
  let actionConfig = action
  if (action?.label && QuickActions[action.label]) {
    const quickAction = QuickActions[action.label]
    actionConfig = {
      ...action,
      label: quickAction.label,
    }
  }

  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-12 px-4 text-center',
      className
    )}>
      {/* Icon */}
      <div className={cn(
        'w-16 h-16 rounded-2xl flex items-center justify-center mb-4',
        preset.iconBg
      )}>
        <div className={preset.iconColor}>
          {icon || preset.icon}
        </div>
      </div>

      {/* Title */}
      <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">
        {title || preset.defaultTitle}
      </h3>

      {/* Description */}
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-6">
        {description || preset.defaultDescription}
      </p>

      {/* Action Button */}
      {actionConfig && (
        <Button
          onClick={actionConfig.onClick}
          className="gap-2"
        >
          {QuickActions[action.label]?.icon || <Plus className="w-4 h-4" />}
          {actionConfig.label}
        </Button>
      )}
    </div>
  )
}

// Specialized Empty States for common scenarios
export function EmptyList({
  title = 'Belum Ada Item',
  description = 'Daftar masih kosong. Tambahkan item baru untuk memulai.',
  onAdd,
  addLabel = 'Tambah'
}: {
  title?: string
  description?: string
  onAdd?: () => void
  addLabel?: string
}) {
  return (
    <EmptyState
      variant="empty-list"
      title={title}
      description={description}
      action={onAdd ? { label: addLabel, onClick: onAdd } : undefined}
    />
  )
}

export function NoSearchResults({
  searchQuery,
  onClear,
  onReset
}: {
  searchQuery: string
  onClear?: () => void
  onReset?: () => void
}) {
  return (
    <EmptyState
      variant="no-results"
      title={`Tidak Ditemukan: "${searchQuery}"`}
      description="Coba gunakan kata kunci yang berbeda atau periksa ejaan."
      action={onReset ? { label: 'Reset Pencarian', onClick: onReset } : undefined}
    />
  )
}

export function ErrorState({
  message = 'Terjadi kesalahan saat memuat data.',
  onRetry
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <EmptyState
      variant="error"
      title="Gagal Memuat Data"
      description={message}
      action={onRetry ? { label: 'Coba Lagi', onClick: onRetry } : undefined}
    />
  )
}

// Skeleton for list loading
export function EmptyListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4 py-8">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 bg-card rounded-xl border">
          <div className="w-12 h-12 rounded-lg bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
            <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

// Card skeleton
export function EmptyCardSkeleton() {
  return (
    <div className="bg-card rounded-xl border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-6 w-24 bg-muted rounded animate-pulse" />
        <div className="h-6 w-16 bg-muted rounded animate-pulse" />
      </div>
      <div className="h-4 w-full bg-muted rounded animate-pulse" />
      <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
      <div className="flex gap-2 pt-2">
        <div className="h-10 w-24 bg-muted rounded-lg animate-pulse" />
        <div className="h-10 w-24 bg-muted rounded-lg animate-pulse" />
      </div>
    </div>
  )
}

// Grid skeleton for monitoring pages
export function EmptyGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <EmptyCardSkeleton key={i} />
      ))}
    </div>
  )
}