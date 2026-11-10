import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, matchPath } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { BREADCRUMB_ALIASES, BREADCRUMB_OPTIONAL_LEAVES, BREADCRUMB_ROUTES, isBreadcrumbDestination, routeBreadcrumbs } from '@/lib/breadcrumb-routes'

afterEach(cleanup)

function declaredRoutes() {
  const source = ts.createSourceFile('App.tsx', readFileSync('src/App.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const routes = new Set<string>()
  const pathFor = (attributes: ts.JsxAttributes, parent: string) => {
    const attr = attributes.properties.find((property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(source) === 'path')
    const path = attr?.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : undefined
    if (!path) return parent
    const resolved = path.startsWith('/') ? path : `${parent.endsWith('/') ? parent.slice(0, -1) : parent}/${path}`
    if (path !== '*') routes.add(resolved)
    return resolved
  }
  const visit = (node: ts.Node, parent = '') => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'Route') {
      const path = pathFor(node.openingElement.attributes, parent)
      node.children.forEach(child => visit(child, path))
    } else if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'Route') {
      pathFor(node.attributes, parent)
    } else {
      ts.forEachChild(node, child => visit(child, parent))
    }
  }
  visit(source)
  return [...routes]
}

describe('application-wide breadcrumb destinations', () => {
  it('keeps labels and aliases aligned with every real App route, including nested configuration', () => {
    const actual = declaredRoutes().sort()
    const documented = [...Object.keys(BREADCRUMB_ROUTES), ...Object.keys(BREADCRUMB_ALIASES),
      ...Object.keys(BREADCRUMB_OPTIONAL_LEAVES).filter(path => actual.includes(path))].sort()
    expect(documented).toEqual(actual)
    for (const target of Object.values(BREADCRUMB_ALIASES)) expect(actual).toContain(target)
  })

  it('never generates an ancestor link that cannot resolve to a declared route', () => {
    const actual = declaredRoutes()
    for (const route of actual) {
      const path = route.replace(':topicSlug', 'test-topic').replace(':sectionSlug', 'test-section')
      for (const crumb of routeBreadcrumbs(path)) {
        if (crumb.href) expect(actual.some(pattern => matchPath({ path: pattern, end: true }, crumb.href!)), `${path}: ${crumb.href}`).toBe(true)
      }
    }
  })

  it.each<[string, string[]]>([
    ['/surat/registrasi', ['Beranda', 'Buat Pengajuan']],
    ['/surat/inbox', ['Beranda', 'Persetujuan']],
    ['/surat/rekomendasi/registrasi', ['Beranda', 'Rekomendasi', 'Buat Rekomendasi']],
    ['/admin/users/hierarchy', ['Beranda', 'Manajemen Karyawan', 'Hirarki Organisasi']],
    ['/admin/configuration/maintenance', ['Beranda', 'Konfigurasi', 'Pemeliharaan Sistem']],
    ['/notifications/open', ['Beranda', 'Notifikasi']],
    ['/settings/department-sla/', ['Beranda', 'Pengaturan', 'SLA Departemen']],
  ])('renders only real hierarchy for %s', (path, labels) => {
    render(<MemoryRouter initialEntries={[path]}><Breadcrumbs /></MemoryRouter>)
    const nav = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    for (const label of labels) expect(nav.getByText(label)).toBeInTheDocument()
    expect(nav.queryByRole('link', { name: 'Surat' })).not.toBeInTheDocument()
    expect(nav.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
    expect(nav.getByText(labels[labels.length - 1])).toHaveAttribute('aria-current', 'page')
  })

  it('retains real nested parent links and query/hash destinations', () => {
    expect(routeBreadcrumbs('/admin/configuration/access')).toContainEqual({ label: 'Konfigurasi', href: '/admin/configuration' })
    expect(routeBreadcrumbs('/surat/rekomendasi/registrasi')).toContainEqual({ label: 'Rekomendasi', href: '/surat/rekomendasi' })
    expect(isBreadcrumbDestination('/admin/configuration?view=form#main')).toBe(true)
    expect(isBreadcrumbDestination('/docs/test-topic')).toBe(true)
    expect(isBreadcrumbDestination('/surat/monitoring?status=DONE')).toBe(true)
    for (const path of Object.keys(BREADCRUMB_OPTIONAL_LEAVES)) {
      expect(routeBreadcrumbs(path).at(-1)).toEqual({ label: BREADCRUMB_OPTIONAL_LEAVES[path], href: undefined })
      expect(isBreadcrumbDestination(path)).toBe(false)
    }
  })

  it('does not create dead or external links from explicit breadcrumb items or replace the first label', () => {
    render(<MemoryRouter><Breadcrumbs items={[
      { label: 'Administrasi', href: '/admin' },
      { label: 'Konfigurasi', href: '/admin/configuration#main' },
      { label: 'Surat', href: '/surat' },
      { label: 'Tidak Aman', href: '//attacker.example' },
      { label: 'Saat Ini' },
    ]} /></MemoryRouter>)
    expect(screen.getByText('Administrasi')).toBeInTheDocument()
    expect(screen.queryByText('Beranda')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Konfigurasi' })).toHaveAttribute('href', '/admin/configuration#main')
    for (const path of ['/admin', '/surat', '/notifications', '/admin/settings', '/hierarchy', '/missing', '//evil.test', '/\\evil.test', 'javascript:alert(1)']) {
      expect(isBreadcrumbDestination(path), path).toBe(false)
    }
  })
})
