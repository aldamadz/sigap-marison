import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Filter,
  GitBranch,
  Layers,
  MapPin,
  Network,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getUsers } from '@/services/user.service';
import { supabase } from '@/lib/supabase';
import type { User } from '@/types/agenda';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { exportRowsToXlsx } from '@/lib/excel';

type HierarchyNode = {
  user: User;
  children: HierarchyNode[];
  level: number;
  path: string[];
  issueCodes: string[];
  descendantCount: number;
  directCount: number;
};

const ROOT_ID = '__root__';

const isActive = (user: User) => (user as any).is_active !== false;

const getInitials = (name?: string) =>
  String(name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

const normalize = (value: unknown) =>
  String(value || '').toLowerCase().trim();

const hierarchyRank = (user: User) => {
  const title = normalize(`${user.jobTitle || ''} ${(user as any).departmentName || ''}`);
  if (title.includes('direktur utama')) return 7;
  if (title.includes('direktur')) return 6;
  if (title.includes('manager') && !title.includes('assistant')) return 5;
  if (title.includes('assistant manager') || title.includes('assistant branch manager')) return 4;
  if (title.includes('supervisor')) return 3;
  if (title.includes('pelaksana')) return 1;
  return 2;
};

const visualLevel = (user: User) => Math.max(0, 7 - hierarchyRank(user));

const issueLabel: Record<string, string> = {
  self_parent: 'Atasan adalah dirinya sendiri',
  parent_missing: 'Atasan tidak ditemukan',
  parent_inactive: 'Atasan nonaktif',
  cycle: 'Relasi atasan membentuk siklus',
};

const collectDescendantCount = (node: HierarchyNode): number => {
  const total = node.children.reduce((sum, child) => sum + 1 + collectDescendantCount(child), 0);
  node.descendantCount = total;
  node.directCount = node.children.length;
  return total;
};

const buildHierarchy = (users: User[]) => {
  const byId = new Map(users.map((user) => [String(user.id), user]));
  const childIdsByParent = new Map<string, string[]>();
  const issueMap = new Map<string, Set<string>>();

  const addIssue = (userId: string, issue: string) => {
    const current = issueMap.get(userId) || new Set<string>();
    current.add(issue);
    issueMap.set(userId, current);
  };

  users.forEach((user) => {
    const userId = String(user.id);
    const parentId = user.parentId ? String(user.parentId) : ROOT_ID;

    if (parentId === userId) {
      addIssue(userId, 'self_parent');
      childIdsByParent.set(ROOT_ID, [...(childIdsByParent.get(ROOT_ID) || []), userId]);
      return;
    }

    if (parentId !== ROOT_ID && !byId.has(parentId)) {
      addIssue(userId, 'parent_missing');
      childIdsByParent.set(ROOT_ID, [...(childIdsByParent.get(ROOT_ID) || []), userId]);
      return;
    }

    if (parentId !== ROOT_ID && byId.has(parentId) && !isActive(byId.get(parentId)!)) {
      addIssue(userId, 'parent_inactive');
    }

    childIdsByParent.set(parentId, [...(childIdsByParent.get(parentId) || []), userId]);
  });

  users.forEach((user) => {
    const seen = new Set<string>();
    let cursor: string | null = user.parentId ? String(user.parentId) : null;
    while (cursor) {
      if (cursor === user.id || seen.has(cursor)) {
        addIssue(String(user.id), 'cycle');
        break;
      }
      seen.add(cursor);
      cursor = byId.get(cursor)?.parentId ? String(byId.get(cursor)?.parentId) : null;
    }
  });

  const buildNode = (userId: string, path: string[], visited = new Set<string>()): HierarchyNode | null => {
    const user = byId.get(userId);
    if (!user) return null;
    const level = visualLevel(user);
    if (visited.has(userId)) {
      addIssue(userId, 'cycle');
      return {
        user,
        children: [],
        level,
        path: [...path, user.fullName],
        issueCodes: Array.from(issueMap.get(userId) || ['cycle']),
        descendantCount: 0,
        directCount: 0,
      };
    }

    const nextVisited = new Set(visited);
    nextVisited.add(userId);
    const children = (childIdsByParent.get(userId) || [])
      .sort((a, b) => normalize(byId.get(a)?.fullName).localeCompare(normalize(byId.get(b)?.fullName)))
      .map((childId) => buildNode(childId, [...path, user.fullName], nextVisited))
      .filter(Boolean) as HierarchyNode[];

    const node: HierarchyNode = {
      user,
      children,
      level,
      path: [...path, user.fullName],
      issueCodes: Array.from(issueMap.get(userId) || []),
      descendantCount: 0,
      directCount: children.length,
    };
    collectDescendantCount(node);
    return node;
  };

  const roots = (childIdsByParent.get(ROOT_ID) || [])
    .sort((a, b) => normalize(byId.get(a)?.fullName).localeCompare(normalize(byId.get(b)?.fullName)))
    .map((id) => buildNode(id, []))
    .filter(Boolean) as HierarchyNode[];

  const flat: HierarchyNode[] = [];
  const walk = (node: HierarchyNode) => {
    flat.push(node);
    node.children.forEach(walk);
  };
  roots.forEach(walk);

  return { roots, flat };
};

const nodeMatches = (node: HierarchyNode, query: string, dept: string, office: string, status: string) => {
  const user = node.user;
  const text = [
    user.fullName,
    user.email,
    user.nik,
    user.jobTitle,
    user.departmentName,
    user.officeName,
  ].map(normalize).join(' ');
  const matchesText = !query || text.includes(normalize(query));
  const matchesDept = dept === 'all' || user.departmentName === dept;
  const matchesOffice = office === 'all' || user.officeName === office;
  const matchesStatus = status === 'all' || (status === 'active' ? isActive(user) : !isActive(user));
  return matchesText && matchesDept && matchesOffice && matchesStatus;
};

const filterTree = (
  nodes: HierarchyNode[],
  query: string,
  dept: string,
  office: string,
  status: string,
): HierarchyNode[] =>
  nodes
    .map((node) => {
      const children = filterTree(node.children, query, dept, office, status);
      const selfMatches = nodeMatches(node, query, dept, office, status);
      if (!selfMatches && children.length === 0) return null;
      return { ...node, children };
    })
    .filter(Boolean) as HierarchyNode[];

const sortHierarchyNodes = (nodes: HierarchyNode[]) =>
  nodes.sort((a, b) => {
    const rankDiff = hierarchyRank(b.user) - hierarchyRank(a.user);
    if (rankDiff !== 0) return rankDiff;
    return normalize(a.user.fullName).localeCompare(normalize(b.user.fullName));
  });

const refreshScopedNode = (node: HierarchyNode, path: string[] = []): HierarchyNode => {
  node.path = [...path, node.user.fullName];
  node.children = sortHierarchyNodes(node.children).map((child) => refreshScopedNode(child, node.path));
  collectDescendantCount(node);
  return node;
};

const filterOfficeScopedTree = (
  flat: HierarchyNode[],
  query: string,
  dept: string,
  office: string,
  status: string,
): HierarchyNode[] => {
  const clones = new Map<string, HierarchyNode>();

  flat.forEach((node) => {
    if (!nodeMatches(node, query, dept, office, status)) return;
    clones.set(node.user.id, {
      ...node,
      children: [],
      path: [node.user.fullName],
      descendantCount: 0,
      directCount: 0,
    });
  });

  const roots: HierarchyNode[] = [];
  clones.forEach((node) => {
    const parentId = node.user.parentId;
    const parent = parentId ? clones.get(parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return sortHierarchyNodes(roots).map((node) => refreshScopedNode(node));
};

const flattenNodes = (nodes: HierarchyNode[]) => {
  const result: HierarchyNode[] = [];
  const walk = (node: HierarchyNode) => {
    result.push(node);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return result;
};

const findNodeById = (nodes: HierarchyNode[], id: string): HierarchyNode | null => {
  for (const node of nodes) {
    if (node.user.id === id) return node;
    const child = findNodeById(node.children, id);
    if (child) return child;
  }
  return null;
};

const relevelNode = (node: HierarchyNode, baseLevel = node.level): HierarchyNode => ({
  ...node,
  level: node.level - baseLevel,
  children: node.children.map((child) => relevelNode(child, baseLevel)),
});

const NodeCard = ({
  node,
  compact = false,
  onFocus,
  onSelect,
}: {
  node: HierarchyNode;
  compact?: boolean;
  onFocus?: (id: string) => void;
  onSelect?: (node: HierarchyNode) => void;
}) => {
  const active = isActive(node.user);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(node)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.(node);
        }
      }}
      className={cn(
        'relative w-full rounded-xl border bg-card/90 text-left shadow-sm backdrop-blur transition-all hover:border-primary/40 hover:shadow-glow focus:outline-none focus:ring-2 focus:ring-primary/50',
        'cursor-pointer',
        compact ? 'w-[230px] p-3' : 'p-4',
        !active && 'opacity-60',
        node.issueCodes.length > 0 ? 'border-amber-500/40' : 'border-border/70',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className={cn('shrink-0 border border-primary/20', compact ? 'h-9 w-9' : 'h-11 w-11')}>
          <AvatarImage src={node.user.photoUrl} />
          <AvatarFallback className="bg-primary/10 text-xs font-black text-primary">
            {getInitials(node.user.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-black text-foreground">{node.user.fullName}</p>
            {!active && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Nonaktif" />}
          </div>
          <p className="truncate text-[11px] font-semibold text-muted-foreground">{node.user.jobTitle || 'Staff'}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {node.user.departmentName && (
              <Badge variant="secondary" className="rounded-md px-1.5 text-[9px] font-black uppercase text-primary">
                {node.user.departmentName}
              </Badge>
            )}
            {node.user.officeName && (
              <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                <MapPin className="mr-1 h-2.5 w-2.5" /> {node.user.officeName}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-[10px] font-bold uppercase text-muted-foreground">
        <span>{node.directCount} langsung</span>
        <span>{node.descendantCount} total</span>
        {onFocus && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onFocus(node.user.id);
            }}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-primary hover:bg-primary/10"
          >
            <Eye className="h-3 w-3" /> Fokus
          </button>
        )}
      </div>
      {node.issueCodes.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300">
          {node.issueCodes.map((issue) => issueLabel[issue] || issue).join(', ')}
        </div>
      )}
    </div>
  );
};

const ChartPersonNode = ({
  node,
  onClick,
}: {
  node: HierarchyNode;
  onClick: (node: HierarchyNode) => void;
}) => {
  const active = isActive(node.user);
  return (
    <motion.button
      layout
      type="button"
      onClick={() => onClick(node)}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      className={cn(
        'group relative flex w-[132px] flex-col items-center rounded-2xl border bg-card/90 px-3 py-3 text-center shadow-lg backdrop-blur transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-glow',
        node.issueCodes.length > 0 ? 'border-amber-400/50' : 'border-white/10',
        !active && 'opacity-60',
      )}
      title={node.user.fullName}
    >
      <div className="relative">
        <Avatar className="h-14 w-14 border-2 border-primary/25 ring-4 ring-background/80">
          <AvatarImage src={node.user.photoUrl} />
          <AvatarFallback className="bg-primary/10 text-sm font-black text-primary">
            {getInitials(node.user.fullName)}
          </AvatarFallback>
        </Avatar>
        {!active && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-red-500" />}
        {node.issueCodes.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-background">
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 min-h-[34px] text-xs font-black leading-tight text-foreground">
        {node.user.fullName}
      </p>
      {node.directCount > 0 && (
        <span className="mt-2 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase text-primary">
          {node.directCount} bawahan
        </span>
      )}
    </motion.button>
  );
};

const PyramidNode = ({
  node,
  onSelect,
}: {
  node: HierarchyNode;
  onSelect: (node: HierarchyNode) => void;
}) => {
  const hasChildren = node.children.length > 0;
  const maxLevelGap = hasChildren
    ? Math.max(1, ...node.children.map((child) => Math.max(1, child.level - node.level)))
    : 1;
  const connectorHeight = maxLevelGap * 28;
  return (
    <motion.div layout transition={{ type: 'spring', stiffness: 360, damping: 34 }} className="flex flex-col items-center">
      <ChartPersonNode node={node} onClick={onSelect} />
      {hasChildren && (
        <>
          <div className="w-px bg-primary/35" style={{ height: connectorHeight }} />
          <div className="relative flex items-start justify-center gap-5 px-4" style={{ paddingTop: connectorHeight }}>
            <div className="absolute left-1/2 right-1/2 top-0 h-px bg-primary/25" />
            {node.children.length > 1 && (
              <div className="absolute top-0 h-px bg-primary/25" style={{ left: 66, right: 66 }} />
            )}
            {node.children.map((child) => (
              <div
                key={child.user.id}
                className="relative flex flex-col items-center"
                style={{ marginTop: Math.max(0, child.level - node.level - 1) * 28 }}
              >
                <span className="absolute w-px bg-primary/25" style={{ top: -connectorHeight, height: connectorHeight }} />
                <PyramidNode node={child} onSelect={onSelect} />
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
};

const TreeRow = ({
  node,
  expanded,
  toggle,
  onFocus,
  onSelect,
}: {
  node: HierarchyNode;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onFocus: (id: string) => void;
  onSelect: (node: HierarchyNode) => void;
}) => {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.user.id);
  return (
    <motion.div layout transition={{ type: 'spring', stiffness: 360, damping: 34 }} className="relative">
      <div className="flex items-start gap-3">
        <div style={{ width: node.level * 24 }} className="hidden shrink-0 sm:block" />
        <button
          type="button"
          onClick={() => hasChildren && toggle(node.user.id)}
          className={cn(
            'mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background/80 text-muted-foreground',
            !hasChildren && 'opacity-40',
          )}
        >
          {hasChildren ? (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />}
        </button>
        <div className="min-w-0 flex-1">
          <NodeCard node={node} onFocus={onFocus} onSelect={onSelect} />
        </div>
      </div>
      {hasChildren && isOpen && (
        <div className="ml-6 mt-3 space-y-3 border-l border-dashed border-primary/20 pl-3 sm:ml-12">
          {node.children.map((child) => (
            <TreeRow key={child.user.id} node={child} expanded={expanded} toggle={toggle} onFocus={onFocus} onSelect={onSelect} />
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default function OrganizationHierarchyPage() {
  const queryClient = useQueryClient();
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: getUsers });
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<HierarchyNode | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const chartViewportRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef({
    active: false,
    startX: 0,
    scrollLeft: 0,
    moved: false,
    suppressClick: false,
  });

  const { roots, flat } = useMemo(() => buildHierarchy(users), [users]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshUsers = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['users'], type: 'active' });
      }, 250);
    };

    const channel = supabase
      .channel('organization-hierarchy-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refreshUsers)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const departments = useMemo(() =>
    Array.from(new Set(users.map((user) => user.departmentName).filter(Boolean))).sort() as string[],
  [users]);

  const offices = useMemo(() =>
    Array.from(new Set(users.map((user) => user.officeName).filter(Boolean))).sort() as string[],
  [users]);

  const scopedRoots = useMemo(() => {
    if (focusedId) {
      const target = findNodeById(roots, focusedId);
      return target ? [relevelNode(target)] : [];
    }
    if (officeFilter !== 'all') {
      return filterOfficeScopedTree(flat, query, deptFilter, officeFilter, statusFilter);
    }
    return filterTree(roots, query, deptFilter, officeFilter, statusFilter);
  }, [roots, flat, query, deptFilter, officeFilter, statusFilter, focusedId]);

  const visibleFlat = useMemo(() => flattenNodes(scopedRoots), [scopedRoots]);
  useEffect(() => {
    if (expanded.size === 0 && flat.length > 0) {
      setExpanded(new Set(flat.map((node) => node.user.id)));
    }
  }, [flat, expanded.size]);

  const totalIssues = flat.reduce((sum, node) => sum + node.issueCodes.length, 0);
  const activeCount = users.filter(isActive).length;
  const rootCount = roots.length;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    const rows = visibleFlat.map((node) => ({
      Level: hierarchyRank(node.user),
      Nama: node.user.fullName,
      NIK: node.user.nik || '',
      Email: node.user.email || '',
      Jabatan: node.user.jobTitle || '',
      Departemen: node.user.departmentName || '',
      Kantor: node.user.officeName || '',
      Status: isActive(node.user) ? 'Aktif' : 'Nonaktif',
      Atasan: node.path[node.path.length - 2] || '',
      Path: node.path.join(' > '),
      'Bawahan Langsung': node.directCount,
      'Total Bawahan': node.descendantCount,
      Masalah: node.issueCodes.map((issue) => issueLabel[issue] || issue).join('; '),
    }));

    await exportRowsToXlsx(
      rows,
      'Hirarki',
      `hirarki-organisasi-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [8, 28, 16, 30, 24, 24, 14, 28, 40, 16, 14, 24]
    );
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const generatedAt = new Date();
    const filterInfo = [
      `Status: ${statusFilter === 'all' ? 'Semua' : statusFilter === 'active' ? 'Aktif' : 'Nonaktif'}`,
      `Departemen: ${deptFilter === 'all' ? 'Semua' : deptFilter}`,
      `Kantor: ${officeFilter === 'all' ? 'Semua' : officeFilter}`,
      query ? `Pencarian: ${query}` : null,
      focusedId ? 'Mode: Fokus karyawan' : null,
    ].filter(Boolean);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Hirarki Organisasi', 40, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Dibuat: ${generatedAt.toLocaleString('id-ID')}`, 40, 60);
    doc.text(filterInfo.join(' | '), 40, 76, { maxWidth: 760 });

    autoTable(doc, {
      startY: 96,
      head: [['Level', 'Nama', 'NIK', 'Jabatan', 'Departemen', 'Kantor', 'Atasan', 'Status']],
      body: visibleFlat.map((node) => [
        String(hierarchyRank(node.user)),
        node.user.fullName || '',
        node.user.nik || '',
        node.user.jobTitle || '',
        node.user.departmentName || '',
        node.user.officeName || '',
        node.path[node.path.length - 2] || '',
        isActive(node.user) ? 'Aktif' : 'Nonaktif',
      ]),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: [18, 86, 104], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 36, halign: 'center' },
        1: { cellWidth: 130 },
        2: { cellWidth: 58 },
        3: { cellWidth: 120 },
        4: { cellWidth: 120 },
        5: { cellWidth: 110 },
        6: { cellWidth: 130 },
        7: { cellWidth: 54, halign: 'center' },
      },
      didDrawPage: () => {
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Halaman ${pageCount}`, doc.internal.pageSize.getWidth() - 80, doc.internal.pageSize.getHeight() - 20);
      },
    });

    doc.save(`hirarki-organisasi-${generatedAt.toISOString().slice(0, 10)}.pdf`);
  };

  const handleChartPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !chartViewportRef.current) return;
    if ((event.target as HTMLElement).closest('button')) return;
    panRef.current = {
      active: true,
      startX: event.clientX,
      scrollLeft: chartViewportRef.current.scrollLeft,
      moved: false,
      suppressClick: false,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleChartPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current.active || !chartViewportRef.current) return;
    const deltaX = event.clientX - panRef.current.startX;
    if (Math.abs(deltaX) > 6) {
      panRef.current.moved = true;
      panRef.current.suppressClick = true;
    }
    chartViewportRef.current.scrollLeft = panRef.current.scrollLeft - deltaX;
  };

  const handleChartPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current.active) return;
    panRef.current.active = false;
    setIsPanning(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can already be released when the pointer leaves the viewport.
    }
    if (panRef.current.moved) {
      window.setTimeout(() => {
        panRef.current.suppressClick = false;
      }, 120);
    }
  };

  const handleSelectChartNode = (node: HierarchyNode) => {
    if (panRef.current.suppressClick) return;
    setSelectedNode(node);
  };

  if (isLoading) {
    return (
      <div className="space-y-5 p-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-[1800px] space-y-5">
        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Network className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Hirarki Organisasi</h1>
                <p className="mt-1 max-w-3xl text-sm font-medium text-muted-foreground">
                  Pantau struktur karyawan dalam mode daftar hirarki atau chart piramid, lengkap dengan filter dan export.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-xl">
                <Link to="/admin/users">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
                </Link>
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleExportPdf} variant="outline" className="rounded-xl">
                  <Download className="mr-2 h-4 w-4" /> Export PDF
                </Button>
                <Button onClick={handleExport} className="rounded-xl">
                  <Download className="mr-2 h-4 w-4" /> Export XLSX
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total karyawan', value: users.length, icon: Users, cls: 'text-primary' },
            { label: 'Aktif', value: activeCount, icon: UserCheck, cls: 'text-emerald-400' },
            { label: 'Root/level atas', value: rootCount, icon: Layers, cls: 'text-cyan-300' },
            { label: 'Catatan struktur', value: totalIssues, icon: AlertTriangle, cls: totalIssues > 0 ? 'text-amber-300' : 'text-muted-foreground' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-border/60 bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{item.label}</p>
                <item.icon className={cn('h-4 w-4', item.cls)} />
              </div>
              <p className="mt-2 text-2xl font-black text-foreground">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4">
          <div className="grid gap-3 lg:grid-cols-12">
            <div className="relative lg:col-span-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama, NIK, jabatan, departemen..."
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="lg:col-span-2">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Nonaktif</SelectItem>
              </SelectContent>
            </Select>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="lg:col-span-3">
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="h-4 w-4 text-primary" />
                  <SelectValue placeholder="Departemen" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Departemen</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department} value={department}>{department}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={officeFilter} onValueChange={setOfficeFilter}>
              <SelectTrigger className="lg:col-span-3">
                <div className="flex items-center gap-2 truncate">
                  <MapPin className="h-4 w-4 text-primary" />
                  <SelectValue placeholder="Kantor" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kantor</SelectItem>
                {offices.map((office) => (
                  <SelectItem key={office} value={office}>{office}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            <span>Menampilkan {visibleFlat.length} dari {users.length} karyawan.</span>
            {focusedId && (
              <Button size="sm" variant="ghost" onClick={() => setFocusedId(null)} className="h-7 rounded-lg px-2 text-xs text-primary">
                Hapus fokus
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="tree" className="space-y-4">
          <TabsList className="h-11 w-full justify-start rounded-xl bg-card p-1 lg:w-auto">
            <TabsTrigger value="tree" className="rounded-lg px-4">
              <GitBranch className="mr-2 h-4 w-4" /> Tree List
            </TabsTrigger>
            <TabsTrigger value="chart" className="rounded-lg px-4">
              <Network className="mr-2 h-4 w-4" /> Chart Node
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tree">
            <div className="rounded-xl border border-border/70 bg-card p-3 sm:p-5">
              {scopedRoots.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground">Tidak ada data sesuai filter.</div>
              ) : (
                <div className="space-y-4">
                  {scopedRoots.map((node) => (
                    <TreeRow key={node.user.id} node={node} expanded={expanded} toggle={toggle} onFocus={setFocusedId} onSelect={setSelectedNode} />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="chart">
            <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card p-3 sm:p-5">
              <div className="relative z-10">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-foreground">Chart Node Piramid</p>
                  <p className="text-xs font-medium text-muted-foreground">Klik-tahan lalu geser untuk pan. Klik node untuk membuka detail.</p>
                </div>
              </div>
              <div
                ref={chartViewportRef}
                onPointerDown={handleChartPointerDown}
                onPointerMove={handleChartPointerMove}
                onPointerUp={handleChartPointerUp}
                onPointerCancel={handleChartPointerUp}
                className={cn(
                  'select-none overflow-x-auto overflow-y-visible rounded-xl border border-border/60 bg-background/80 p-4 pb-8',
                  isPanning ? 'cursor-grabbing' : 'cursor-grab',
                )}
              >
                <div className="flex min-w-max justify-center gap-12">
                  {scopedRoots.map((node) => (
                    <div key={node.user.id} style={{ marginTop: node.level * 28 }}>
                      <PyramidNode node={node} onSelect={handleSelectChartNode} />
                    </div>
                  ))}
                </div>
              </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!selectedNode} onOpenChange={() => setSelectedNode(null)}>
        <DialogContent className="max-w-md overflow-hidden rounded-2xl p-0">
          {selectedNode && (
            <div>
              <div className="border-b border-border bg-primary/10 px-6 py-5">
                <div className="flex items-center gap-4 pr-8">
                  <Avatar className="h-16 w-16 border-2 border-primary/30">
                    <AvatarImage src={selectedNode.user.photoUrl} />
                    <AvatarFallback className="bg-primary/10 text-lg font-black text-primary">
                      {getInitials(selectedNode.user.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <DialogTitle className="truncate text-lg font-black text-foreground">
                      {selectedNode.user.fullName}
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-sm font-semibold text-muted-foreground">
                      {selectedNode.user.jobTitle || 'Staff'}
                    </DialogDescription>
                  </div>
                </div>
              </div>
              <div className="space-y-3 px-6 py-5 text-sm">
                {[
                  ['NIK', selectedNode.user.nik || '-'],
                  ['Email', selectedNode.user.email || '-'],
                  ['Departemen', selectedNode.user.departmentName || '-'],
                  ['Kantor', selectedNode.user.officeName || '-'],
                  ['Status', isActive(selectedNode.user) ? 'Aktif' : 'Nonaktif'],
                  ['Level', String(hierarchyRank(selectedNode.user))],
                  ['Bawahan langsung', String(selectedNode.directCount)],
                  ['Total bawahan', String(selectedNode.descendantCount)],
                  ['Atasan', selectedNode.path[selectedNode.path.length - 2] || '-'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 border-b border-border/50 pb-2 last:border-0">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
                    <span className="max-w-[240px] text-right font-bold text-foreground">{value}</span>
                  </div>
                ))}
                {selectedNode.issueCodes.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-300">
                    {selectedNode.issueCodes.map((issue) => issueLabel[issue] || issue).join(', ')}
                  </div>
                )}
              </div>
              <div className="flex gap-2 border-t border-border bg-muted/20 px-6 py-4">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => {
                    setFocusedId(selectedNode.user.id);
                    setSelectedNode(null);
                  }}
                >
                  Fokus ke user ini
                </Button>
                <Button className="flex-1 rounded-xl" onClick={() => setSelectedNode(null)}>
                  Tutup
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
