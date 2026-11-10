import { Link, useLocation } from 'react-router'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isBreadcrumbDestination, routeBreadcrumbs, type BreadcrumbItem } from '@/lib/breadcrumb-routes'

interface BreadcrumbsProps {
  items?: BreadcrumbItem[]
  showHome?: boolean
  className?: string
}

export function Breadcrumbs({ items, showHome = true, className }: BreadcrumbsProps) {
  const location = useLocation()
  const breadcrumbs = (items || routeBreadcrumbs(location.pathname, showHome)).map(item => ({
    ...item,
    href: isBreadcrumbDestination(item.href) ? item.href : undefined,
  }))

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
            {index === 0 && showHome && item.label === 'Beranda' && item.href === '/dashboard' ? (
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
                aria-current={isLast ? 'page' : undefined}
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
