import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[]
  showHome?: boolean
  className?: string
}

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/agenda': 'Agenda',
  '/calendar': 'Kalender',
  '/surat': 'Surat',
  '/surat/registrasi': 'Registrasi Surat',
  '/surat/inbox': 'Inbox Approval',
  '/surat/monitoring': 'Monitoring Surat',
  '/surat/riwayat': 'Riwayat',
  '/admin': 'Admin',
  '/admin/users': 'Manajemen User',
  '/admin/users/hierarchy': 'Hirarki Organisasi',
  '/admin/configuration': 'Configuration',
  '/admin/configuration/forms': 'Form & Template',
  '/admin/configuration/workflows': 'Alur Persetujuan',
  '/admin/configuration/kpi': 'SLA Departemen',
  '/admin/settings': 'Pengaturan',
  '/audit-logs': 'Audit Log',
  '/settings': 'Pengaturan',
  '/hierarchy': 'Struktur Organisasi',
}

export function Breadcrumbs({ items, showHome = true, className }: BreadcrumbsProps) {
  const location = useLocation()

  // Generate breadcrumbs from route path
  const generateFromRoute = (): BreadcrumbItem[] => {
    const segments = location.pathname.split('/').filter(Boolean)
    const crumbs: BreadcrumbItem[] = []

    if (showHome) {
      crumbs.push({ label: 'Beranda', href: '/dashboard' })
    }

    let currentPath = ''
    for (const segment of segments) {
      currentPath += `/${segment}`
      const label = ROUTE_LABELS[currentPath] || segment.charAt(0).toUpperCase() + segment.slice(1)
      const isLast = currentPath === location.pathname
      crumbs.push({
        label,
        href: isLast ? undefined : currentPath,
      })
    }

    return crumbs
  }

  const breadcrumbs = items || generateFromRoute()

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center gap-1.5 text-sm flex-wrap', className)}
    >
      {breadcrumbs.map((item, index) => {
        const isLast = index === breadcrumbs.length - 1

        return (
          <div key={index} className="flex items-center gap-1.5">
            {/* Chevron separator - tampil sebelum item, bukan setelah */}
            {index > 0 && (
              <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
            )}

            {/* Home icon atau breadcrumb item */}
            {index === 0 && showHome ? (
              <Link
                to="/dashboard"
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors font-medium"
              >
                <Home className="w-4 h-4" />
                <span>Beranda</span>
              </Link>
            ) : item.href && !isLast ? (
              <Link
                to={item.href}
                className="text-muted-foreground hover:text-foreground transition-colors font-medium whitespace-nowrap"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn(
                  isLast ? 'text-foreground font-semibold whitespace-nowrap' : 'text-muted-foreground'
                )}
              >
                {item.label}
              </span>
            )}
          </div>
        )
      })}
    </nav>
  )
}

// Simple Page Title with breadcrumbs
interface PageHeaderProps {
  title: string
  subtitle?: string
  breadcrumbs?: BreadcrumbItem[]
  children?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  children,
  className
}: PageHeaderProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}

      {/* Title & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>

        {/* Actions slot */}
        {children && (
          <div className="flex items-center gap-3">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

// Back button for detail pages
interface BackButtonProps {
  to?: string
  onClick?: () => void
  label?: string
}

export function BackButton({ to, onClick, label = 'Kembali' }: BackButtonProps) {
  const content = (
    <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
      <ChevronRight className="w-4 h-4 rotate-180" />
      {label}
    </span>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {content}
      </button>
    )
  }

  if (to) {
    return (
      <Link
        to={to}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
    >
      {content}
    </button>
  )
}
