import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  History,
  Laptop,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import { useTheme } from "next-themes";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/services/user-ui.service";
import type { User } from "@/types/agenda";
import { DocsArticle } from "./DocsArticle";
import {
  ADMIN_DOCS,
  ALL_DOCS,
  DOCS_CHANGELOG,
  DOCS_OVERVIEW_SLUG,
  DOCS_PRINCIPLES,
  DOCS_UPDATED_AT,
  DOCS_VERSION,
  TROUBLESHOOTING_DOCS,
  USER_DOCS,
  getDocsEntryPath,
  getDocsEntrySections,
  getDocsEntrySlug,
  getDocsSectionSlug,
  getDocsVersionPath,
  type DocsAudience,
  type DocsEntry,
  type DocsSection,
} from "./docsContent";

type DocsTab = "user" | "admin" | "troubleshooting" | "version";
type ThemeChoice = "system" | "light" | "dark";

interface PublicDocsPageProps {
  embedded?: boolean;
}

const TAB_CONFIG: Array<{
  id: DocsTab;
  label: string;
  description: string;
  icon: typeof BookOpenText;
}> = [
  { id: "user", label: "Pengguna", description: "Panduan kerja harian", icon: Users },
  { id: "admin", label: "Admin", description: "Konfigurasi dan kontrol data", icon: ShieldCheck },
  { id: "troubleshooting", label: "Bantuan", description: "Solusi kendala umum", icon: Wrench },
  { id: "version", label: "Versi", description: "Riwayat pembaruan", icon: History },
];

const docsByTab: Record<Exclude<DocsTab, "version">, DocsEntry[]> = {
  user: USER_DOCS,
  admin: ADMIN_DOCS,
  troubleshooting: TROUBLESHOOTING_DOCS,
};

const tabByAudience: Record<DocsAudience, Exclude<DocsTab, "version">> = {
  user: "user",
  admin: "admin",
  troubleshooting: "troubleshooting",
};

const audienceLabel: Record<DocsAudience, string> = {
  user: "Pengguna",
  admin: "Admin",
  troubleshooting: "Bantuan",
};

const defaultDocsEntry = USER_DOCS[0];
const VERSION_TOPIC_SLUG = "versi";
const VERSION_SECTION_SLUG = "changelog";

const THEME_OPTIONS: Array<{
  value: ThemeChoice;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "system", label: "Ikuti sistem", icon: Laptop },
  { value: "light", label: "Terang", icon: Sun },
  { value: "dark", label: "Gelap", icon: Moon },
];

const getAvatarUrl = (profile: User | null, email?: string) => {
  if (profile?.photoUrl) return profile.photoUrl;
  const name = profile?.fullName || email || "User";
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D9488&color=fff`;
};

const sectionSearchText = (section: DocsSection) => {
  if (section.type === "group") {
    return section.sections
      .map((childSection) => `${childSection.title} ${childSection.description ?? ""} ${sectionSearchText(childSection)}`)
      .join(" ");
  }
  if (section.type === "feature-grid") {
    return section.items.map((item) => `${item.title} ${item.description}`).join(" ");
  }
  if (section.type === "table") {
    return `${section.columns.join(" ")} ${section.rows.flat().join(" ")}`;
  }
  if (section.type === "callout") return section.description;
  if (section.type === "troubleshooting") {
    return section.items.map((item) => `${item.problem} ${item.solution}`).join(" ");
  }
  return section.items.join(" ");
};

const getSearchValue = (entry: DocsEntry) =>
  [
    entry.title,
    entry.menu,
    entry.summary,
    ...entry.whenToUse,
    ...entry.steps,
    ...entry.examples,
    ...entry.troubleshooting,
    ...(entry.related ?? []),
    ...getDocsEntrySections(entry).flatMap((section) => [
      section.title,
      section.description ?? "",
      sectionSearchText(section),
    ]),
  ].join(" ");

const resolveDocsRoute = (topicSlug?: string, sectionSlug?: string) => {
  if (!topicSlug) {
    return {
      activeTab: "user" as DocsTab,
      activeEntry: defaultDocsEntry,
      activeSectionSlug: DOCS_OVERVIEW_SLUG,
      redirectPath: defaultDocsEntry ? getDocsEntryPath(defaultDocsEntry) : undefined,
    };
  }

  if (topicSlug === VERSION_TOPIC_SLUG) {
    const activeSectionSlug = sectionSlug || VERSION_SECTION_SLUG;
    return {
      activeTab: "version" as DocsTab,
      activeEntry: null,
      activeSectionSlug,
      redirectPath: activeSectionSlug === VERSION_SECTION_SLUG ? undefined : getDocsVersionPath(),
    };
  }

  const activeEntry = ALL_DOCS.find((entry) => getDocsEntrySlug(entry) === topicSlug);
  if (!activeEntry) {
    return {
      activeTab: "user" as DocsTab,
      activeEntry: defaultDocsEntry,
      activeSectionSlug: DOCS_OVERVIEW_SLUG,
      redirectPath: defaultDocsEntry ? getDocsEntryPath(defaultDocsEntry) : "/docs",
    };
  }

  const availableSections = new Set([
    DOCS_OVERVIEW_SLUG,
    ...getDocsEntrySections(activeEntry).map((section) => getDocsSectionSlug(section)),
  ]);
  const activeSectionSlug = sectionSlug || DOCS_OVERVIEW_SLUG;

  return {
    activeTab: tabByAudience[activeEntry.audience] as DocsTab,
    activeEntry,
    activeSectionSlug: availableSections.has(activeSectionSlug) ? activeSectionSlug : DOCS_OVERVIEW_SLUG,
    redirectPath: availableSections.has(activeSectionSlug) ? undefined : getDocsEntryPath(activeEntry),
  };
};

const SearchTrigger = ({
  onClick,
  compact = false,
}: {
  onClick: () => void;
  compact?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex w-full items-center gap-2 rounded-lg border border-border bg-muted/35 text-left text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      compact ? "h-10 px-3" : "h-11 px-3.5",
    )}
    aria-label="Buka pencarian dokumentasi"
  >
    <Search className="h-4 w-4 shrink-0" />
    <span className="min-w-0 flex-1 truncate text-sm">Cari dokumentasi...</span>
    <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
      Ctrl K
    </kbd>
  </button>
);

const VersionPanel = () => (
  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
    <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <History className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Riwayat dokumentasi</h1>
          <p className="text-sm text-muted-foreground">Perubahan isi dan cara penggunaan dokumentasi SIGAP.</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {DOCS_CHANGELOG.map((item) => (
          <div key={item.version} className="rounded-lg border border-border bg-background/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-md px-2 py-1">{item.version}</Badge>
              <span className="text-sm font-medium text-foreground">{item.date}</span>
            </div>
            <ul className="mt-4 space-y-2">
              {item.changes.map((change) => (
                <li key={change} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>

    <aside className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <h2 className="text-base font-semibold text-foreground">Standar isi dokumentasi</h2>
      <ul className="mt-4 space-y-3">
        {DOCS_PRINCIPLES.map((principle) => (
          <li key={principle} className="flex gap-3 text-sm leading-6 text-muted-foreground">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{principle}</span>
          </li>
        ))}
      </ul>
    </aside>
  </div>
);

const DocsQuickSearch = ({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (entry: DocsEntry) => void;
}) => {
  const renderGroup = (audience: DocsAudience) => (
    <CommandGroup heading={audienceLabel[audience]}>
      {ALL_DOCS.filter((entry) => entry.audience === audience).map((entry) => {
        const Icon = entry.icon;
        return (
          <CommandItem
            key={entry.id}
            value={getSearchValue(entry)}
            onSelect={() => onSelect(entry)}
            className="items-start gap-3 rounded-lg px-3 py-3"
          >
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{entry.title}</span>
              <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                {entry.summary}
              </span>
            </span>
            <CommandShortcut className="hidden max-w-[180px] truncate text-[10px] normal-case tracking-normal sm:block">
              {entry.menu}
            </CommandShortcut>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        motion="docs"
        overlayClassName="bg-black/60 backdrop-blur-sm"
        className="max-w-[640px] gap-0 overflow-hidden border-border/80 bg-popover p-0 shadow-[0_24px_80px_-28px_rgba(0,0,0,0.72)] sm:rounded-lg [&>button]:hidden"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Cari dokumentasi</DialogTitle>
          <DialogDescription>Cari menu, masalah, atau alur kerja SIGAP.</DialogDescription>
        </DialogHeader>
        <Command shouldFilter>
          <CommandInput placeholder="Cari menu, masalah, atau alur kerja..." className="h-14 text-sm" />
          <CommandList className="max-h-[min(500px,calc(100dvh-9rem))] overflow-y-auto px-2 py-2">
            <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">
              Topik tidak ditemukan.
            </CommandEmpty>
            {renderGroup("user")}
            {renderGroup("admin")}
            {renderGroup("troubleshooting")}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};

const DocsHeader = ({
  session,
  profile,
  onSearchOpen,
  onLogout,
  onThemeChange,
  currentTheme,
  resolvedTheme,
}: {
  session: Session | null;
  profile: User | null;
  onSearchOpen: () => void;
  onLogout: () => void;
  onThemeChange: (theme: ThemeChoice) => void;
  currentTheme?: string;
  resolvedTheme?: string;
}) => {
  const isAuth = Boolean(session);
  const activeTheme = (currentTheme || "system") as ThemeChoice;
  const ThemeIcon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="flex h-16 w-full items-center gap-3 px-4 sm:px-6 lg:px-8 xl:px-10">
        <Link to={defaultDocsEntry ? getDocsEntryPath(defaultDocsEntry) : "/docs"} className="flex min-w-0 items-center gap-3">
          <img src="/marison-sigap-logo-v2.png" alt="Marison SIGAP" className="h-9 w-9 shrink-0 object-contain" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-none text-foreground sm:text-base">
              Marison - SIGAP <span className="text-primary">Docs</span>
            </p>
            <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
              {DOCS_VERSION} · {DOCS_UPDATED_AT}
            </p>
          </div>
        </Link>

        <div className="ml-auto hidden w-full max-w-sm lg:block">
          <SearchTrigger onClick={onSearchOpen} compact />
        </div>

        <Button asChild size="sm" className="ml-auto hidden shrink-0 sm:inline-flex lg:ml-0">
          <Link to={isAuth ? "/dashboard" : "/"}>
            {isAuth ? (
              <>
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </>
            ) : (
              <>
                Login
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Link>
        </Button>

        {isAuth && (
          <Button asChild size="icon" className="ml-auto h-10 w-10 shrink-0 sm:hidden" aria-label="Buka dashboard">
            <Link to="/dashboard">
              <LayoutDashboard className="h-4 w-4" />
            </Link>
          </Button>
        )}

        {!isAuth ? (
          <Button asChild size="icon" className="ml-auto h-10 w-10 shrink-0 sm:hidden" aria-label="Login">
            <Link to="/">
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-lg" aria-label="Atur tema">
                  <ThemeIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Tema</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {THEME_OPTIONS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={item.value}
                      onClick={() => onThemeChange(item.value)}
                      className="cursor-pointer"
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      <span>{item.label}</span>
                      {activeTheme === item.value ? <CheckCircle2 className="ml-auto h-4 w-4 text-primary" /> : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-2 text-left shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Menu profil"
                >
                  <img
                    src={getAvatarUrl(profile, session?.user.email || undefined)}
                    alt={profile?.fullName || session?.user.email || "Profil"}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                  <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={getAvatarUrl(profile, session?.user.email || undefined)}
                      alt={profile?.fullName || session?.user.email || "Profil"}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{profile?.fullName || "Pengguna SIGAP"}</p>
                      <p className="truncate text-xs font-normal text-muted-foreground">{session?.user.email}</p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="cursor-pointer sm:hidden">
                  <Link to="/dashboard">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="text-muted-foreground">
                  <UserRound className="mr-2 h-4 w-4" />
                  {profile?.jobTitle || "Profil aktif"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </header>
  );
};

export default function PublicDocsPage({ embedded = false }: PublicDocsPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { topicSlug, sectionSlug } = useParams<{ topicSlug?: string; sectionSlug?: string }>();
  const queryClient = useQueryClient();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [commandOpen, setCommandOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const { activeTab, activeEntry, activeSectionSlug, redirectPath } = useMemo(
    () => resolveDocsRoute(topicSlug, sectionSlug),
    [topicSlug, sectionSlug],
  );

  useEffect(() => {
    let active = true;

    const hydrate = async (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession?.user) {
        setProfile(null);
        return;
      }
      const user = await getCurrentUser();
      if (active) setProfile(user);
    };

    supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      hydrate(nextSession);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (embedded || !location.hash) return;
    const legacyId = location.hash.replace("#", "");
    const legacyEntry = ALL_DOCS.find((entry) => entry.id === legacyId);
    if (legacyEntry) {
      navigate(getDocsEntryPath(legacyEntry), { replace: true });
    }
  }, [embedded, location.hash, navigate]);

  useEffect(() => {
    if (embedded || !redirectPath) return;
    navigate(redirectPath, { replace: true });
  }, [embedded, navigate, redirectPath]);

  useEffect(() => {
    if (embedded || redirectPath) return;
    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
  }, [activeEntry?.id, activeSectionSlug, embedded, redirectPath]);

  const activeEntries = activeTab === "version" ? [] : docsByTab[activeTab];
  const activeSectionItems = activeEntry
    ? [
        { slug: DOCS_OVERVIEW_SLUG, title: "Overview" },
        ...getDocsEntrySections(activeEntry).map((section) => ({
          slug: getDocsSectionSlug(section),
          title: section.title,
        })),
      ]
    : [];

  const selectEntry = (entry: DocsEntry) => {
    setCommandOpen(false);
    navigate(getDocsEntryPath(entry));
  };

  const selectTab = (tab: DocsTab) => {
    if (tab === "version") {
      navigate(getDocsVersionPath());
      return;
    }
    const nextEntry = docsByTab[tab][0];
    if (nextEntry) navigate(getDocsEntryPath(nextEntry));
  };

  const handleThemeChange = async (nextTheme: ThemeChoice) => {
    setTheme(nextTheme);
    if (!session?.user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ theme_preference: nextTheme })
      .eq("id", session.user.id);
    if (error) console.error("Failed to update docs theme preference:", error);
  };

  const handleLogout = async () => {
    await supabase.removeAllChannels();
    await supabase.auth.signOut();
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("sb-remember");
    queryClient.clear();
    setSession(null);
    setProfile(null);
    navigate(defaultDocsEntry ? getDocsEntryPath(defaultDocsEntry) : "/docs", { replace: true });
  };

  return (
    <div className={cn(embedded ? "space-y-5" : "min-h-dvh bg-background text-foreground")}>
      {!embedded ? (
        <DocsHeader
          session={session}
          profile={profile}
          onSearchOpen={() => setCommandOpen(true)}
          onLogout={handleLogout}
          onThemeChange={handleThemeChange}
          currentTheme={theme}
          resolvedTheme={resolvedTheme}
        />
      ) : null}

      <DocsQuickSearch open={commandOpen} onOpenChange={setCommandOpen} onSelect={selectEntry} />

      <div className={cn(!embedded && "w-full px-4 py-5 sm:px-6 lg:px-8 xl:px-10")}>
        <div className="mb-5 flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Dokumentasi SIGAP</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Versi {DOCS_VERSION} · diperbarui {DOCS_UPDATED_AT}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCommandOpen(true)} className="w-full sm:w-auto lg:hidden">
            <Search className="mr-2 h-4 w-4" />
            Cari dokumentasi
          </Button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start">
            <div className="hidden xl:block">
              <SearchTrigger onClick={() => setCommandOpen(true)} />
            </div>

            <div className="grid gap-1 rounded-xl border border-border bg-card p-2 shadow-[var(--shadow-card)] sm:grid-cols-2 xl:grid-cols-1">
              {TAB_CONFIG.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => selectTab(tab.id)}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{tab.label}</span>
                      <span className="block truncate text-xs opacity-80">{tab.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {activeTab !== "version" ? (
              <nav className="rounded-xl border border-border bg-card p-2 shadow-[var(--shadow-card)]">
                <p className="px-2 pb-2 pt-1 text-xs font-semibold text-muted-foreground">Topik</p>
                <div className="flex max-h-[280px] gap-1 overflow-x-auto overflow-y-auto xl:block xl:max-h-[calc(100dvh-330px)]">
                  {activeEntries.map((entry) => (
                    <div key={entry.id} className="min-w-max xl:min-w-0">
                    <Link
                      key={entry.id}
                      to={getDocsEntryPath(entry)}
                      className={cn(
                        "block rounded-md px-3 py-2 text-left text-sm transition-colors xl:w-full",
                        activeEntry?.id === entry.id
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {entry.title}
                    </Link>
                    {activeEntry?.id === entry.id && activeSectionItems.length > 1 ? (
                      <div className="mt-1 hidden space-y-0.5 border-l border-border pl-3 xl:block">
                        {activeSectionItems.map((section) => (
                          <Link
                            key={`${entry.id}-${section.slug}`}
                            to={getDocsEntryPath(entry, section.slug)}
                            className={cn(
                              "block rounded-md px-3 py-1.5 text-xs leading-5 transition-colors",
                              activeSectionSlug === section.slug
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                            )}
                          >
                            {section.title}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                    </div>
                  ))}
                </div>
              </nav>
            ) : null}
          </aside>

          <main className="min-w-0">
            {activeTab !== "version" && activeEntry && activeSectionItems.length > 1 ? (
              <div className="mb-4 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)] xl:hidden">
                <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                  Bagian dokumentasi
                </label>
                <Select
                  value={activeSectionSlug}
                  onValueChange={(nextSlug) => navigate(getDocsEntryPath(activeEntry, nextSlug))}
                >
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pilih subtopik" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeSectionItems.map((section) => (
                      <SelectItem key={section.slug} value={section.slug}>
                        {section.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {activeTab === "version" ? (
              <VersionPanel />
            ) : activeEntry ? (
              <DocsArticle entry={activeEntry} activeSectionSlug={activeSectionSlug} />
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
