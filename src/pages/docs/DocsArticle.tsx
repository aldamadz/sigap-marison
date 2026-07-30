import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Info,
  ListChecks,
  TriangleAlert,
} from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ALL_DOCS,
  DOCS_OVERVIEW_SLUG,
  getDocsEntryPath,
  getDocsEntrySections,
  getDocsSectionSlug,
  type DocsEntry,
  type DocsSection,
} from "./docsContent";

const SECTION_RELATED_TITLES: Record<string, string[]> = {
  "Nomor surat, counter, dan draft": [
    "Penomoran Surat",
    "Master Entitas",
    "Master Jenis Surat",
    "Master Proyek",
  ],
  "Alur registrasi dokumen": ["Persetujuan", "Status Pengajuan", "Dokumen dan Lampiran"],
  "Pilihan kategori": ["Kegunaan Form", "Form dan Template", "Master Jenis Surat"],
  "Jika pengajuan Unit": ["Master Proyek", "Kegunaan Form", "Persetujuan"],
  "Scope kandidat signer": ["User Organization", "Master Kantor Cabang", "Master Departemen"],
  "Konfigurasi counter": ["Registrasi Surat", "Master Entitas", "Master Jenis Surat", "Master Proyek"],
  "Jenis surat per departemen": ["Registrasi Surat", "Penomoran Surat"],
};

const ENTRY_RELATED_TITLES: Record<string, string[]> = {
  dashboard: ["Agenda", "Status Pengajuan", "Persetujuan", "Riwayat Terlibat"],
  agenda: ["Kalender", "Dashboard"],
  calendar: ["Agenda", "Dashboard"],
  "surat-registration": ["Status Pengajuan", "Persetujuan", "Dokumen dan Lampiran", "Penomoran Surat"],
  "approval-inbox": ["Status Pengajuan", "Dokumen dan Lampiran", "Riwayat Terlibat", "SLA Departemen"],
  monitoring: ["Registrasi Surat", "Persetujuan", "Dokumen dan Lampiran", "Riwayat Terlibat"],
  "documents-attachments": ["Registrasi Surat", "Status Pengajuan", "Monitoring Admin"],
  history: ["Persetujuan", "Status Pengajuan"],
  settings: ["User Organization", "Login dan akses ditolak"],
  "admin-users": ["Hirarki Organisasi", "Master Departemen", "Master Kantor Cabang", "Audit Log"],
  "admin-hierarchy": ["User Organization", "Master Kantor Cabang"],
  "admin-departments": ["User Organization", "Kegunaan Form", "Email Notification"],
  "admin-entities": ["Penomoran Surat", "Registrasi Surat"],
  "admin-letter-types": ["Penomoran Surat", "Registrasi Surat", "Kegunaan Form"],
  "admin-offices": ["User Organization", "Hirarki Organisasi", "Kegunaan Form"],
  "admin-projects": ["Registrasi Surat", "Persetujuan", "Penomoran Surat"],
  "admin-forms": ["Kegunaan Form", "Registrasi Surat", "Alur Persetujuan"],
  "admin-workflows": ["Kegunaan Form", "Form dan Template"],
  "admin-form-usages": ["Form dan Template", "Master Jenis Surat", "User Organization", "Persetujuan"],
  "admin-integration": ["User Organization", "Master Kantor Cabang", "Master Proyek"],
  "admin-numbering": ["Registrasi Surat", "Master Entitas", "Master Jenis Surat", "Master Proyek"],
  "admin-job-title-labels": ["User Organization", "Form dan Template"],
  "admin-sla": ["Persetujuan", "Riwayat Terlibat", "Monitoring Admin"],
  "admin-monitoring": ["Status Pengajuan", "Dokumen dan Lampiran", "Audit Log"],
  "admin-audit": ["User Organization", "Kegunaan Form", "Monitoring Admin"],
  "admin-email": ["Master Departemen", "Persetujuan", "Dokumen dan Lampiran"],
  "login-access": ["User Organization", "Settings"],
  "document-file": ["Dokumen dan Lampiran", "Monitoring Admin"],
  notification: ["Persetujuan", "SLA Departemen"],
};

const resolveRelatedEntry = (label: string) =>
  ALL_DOCS.find(
    (item) =>
      item.title.toLowerCase() === label.toLowerCase() ||
      item.menu.toLowerCase().includes(label.toLowerCase()),
  ) ?? null;

const getRelatedEntries = (entry: DocsEntry, activeSection: DocsSection | null) => {
  const labels = [
    ...(activeSection ? SECTION_RELATED_TITLES[activeSection.title] ?? [] : []),
    ...(entry.related ?? []),
    ...(ENTRY_RELATED_TITLES[entry.id] ?? []),
  ];
  const seen = new Set<string>();

  return labels
    .map(resolveRelatedEntry)
    .filter((item): item is DocsEntry => Boolean(item) && item.id !== entry.id)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
};

const SectionHeading = ({
  title,
  description,
}: {
  title: string;
  description?: string;
}) => (
  <div className="mb-4">
    <h2 className="text-lg font-semibold text-foreground sm:text-xl">{title}</h2>
    {description ? (
      <p className="mt-1.5 max-w-4xl text-sm leading-6 text-muted-foreground">{description}</p>
    ) : null}
  </div>
);

const Callout = ({
  section,
}: {
  section: Extract<DocsSection, { type: "callout" }>;
}) => {
  const Icon =
    section.tone === "warning"
      ? TriangleAlert
      : section.tone === "success"
        ? CheckCircle2
        : Info;

  return (
    <section
      className={cn(
        "rounded-lg border px-4 py-4 sm:px-5",
        section.tone === "warning" && "border-amber-500/30 bg-amber-500/10",
        section.tone === "success" && "border-emerald-500/30 bg-emerald-500/10",
        (!section.tone || section.tone === "info") && "border-primary/25 bg-primary/10",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            "mt-0.5 h-5 w-5 shrink-0",
            section.tone === "warning" && "text-amber-600 dark:text-amber-400",
            section.tone === "success" && "text-emerald-600 dark:text-emerald-400",
            (!section.tone || section.tone === "info") && "text-primary",
          )}
        />
        <div>
          <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{section.description}</p>
        </div>
      </div>
    </section>
  );
};

const DocsSectionView = ({
  section,
  hideHeading = false,
}: {
  section: DocsSection;
  hideHeading?: boolean;
}) => {
  if (section.type === "group") {
    return (
      <section id={`docs-section-${getDocsSectionSlug(section)}`} className="scroll-mt-24">
        {!hideHeading ? <SectionHeading title={section.title} description={section.description} /> : null}
        <div className={cn("space-y-8", hideHeading && section.sections[0]?.type === "callout" && "space-y-7")}>
          {section.sections.map((childSection) => (
            <DocsSectionView key={childSection.title} section={childSection} />
          ))}
        </div>
      </section>
    );
  }

  if (section.type === "callout") {
    if (hideHeading) return null;

    return (
      <div id={`docs-section-${getDocsSectionSlug(section)}`} className="scroll-mt-24">
        <Callout section={section} />
      </div>
    );
  }

  if (section.type === "feature-grid") {
    return (
      <section id={`docs-section-${getDocsSectionSlug(section)}`} className="scroll-mt-24">
        {!hideHeading ? <SectionHeading title={section.title} description={section.description} /> : null}
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 xl:grid-cols-3">
          {section.items.map((item) => (
            <div key={item.title} className="bg-card p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (section.type === "steps") {
    return (
      <section id={`docs-section-${getDocsSectionSlug(section)}`} className="scroll-mt-24">
        {!hideHeading ? <SectionHeading title={section.title} description={section.description} /> : null}
        <ol className="relative space-y-0">
          {section.items.map((item, index) => (
            <li key={item} className="relative flex gap-4 pb-5 last:pb-0">
              {index < section.items.length - 1 ? (
                <span className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-border" />
              ) : null}
              <span className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-background text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <p className="pt-1 text-sm leading-6 text-muted-foreground">{item}</p>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (section.type === "table") {
    return (
      <section id={`docs-section-${getDocsSectionSlug(section)}`} className="scroll-mt-24">
        {!hideHeading ? <SectionHeading title={section.title} description={section.description} /> : null}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[620px] border-collapse text-left text-sm">
            <thead className="bg-muted/55">
              <tr>
                {section.columns.map((column) => (
                  <th key={column} className="border-b border-border px-4 py-3 font-semibold text-foreground">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {section.rows.map((row, rowIndex) => (
                <tr key={`${section.title}-${rowIndex}`} className="bg-card align-top">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${cell}-${cellIndex}`}
                      className={cn(
                        "px-4 py-3 leading-6 text-muted-foreground",
                        cellIndex === 0 && "font-medium text-foreground",
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (section.type === "troubleshooting") {
    return (
      <section id={`docs-section-${getDocsSectionSlug(section)}`} className="scroll-mt-24">
        {!hideHeading ? <SectionHeading title={section.title} description={section.description} /> : null}
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {section.items.map((item) => (
            <div key={item.problem} className="grid gap-2 bg-card p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-5 sm:p-5">
              <div className="flex items-start gap-2 font-medium text-foreground">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>{item.problem}</span>
              </div>
              <div className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-primary" />
                <span>{item.solution}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section id={`docs-section-${getDocsSectionSlug(section)}`} className="scroll-mt-24">
      {!hideHeading ? <SectionHeading title={section.title} description={section.description} /> : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {section.items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-muted-foreground">
            <ListChecks className="mt-1 h-4 w-4 shrink-0 text-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

const DocsOverview = ({
  entry,
  sections,
}: {
  entry: DocsEntry;
  sections: DocsSection[];
}) => (
  <div className="space-y-8">
    {sections.length ? (
      <section>
        <SectionHeading
          title="Pilih bagian yang ingin dibaca"
          description="Setiap bagian berisi penjelasan operasional yang bisa langsung dipakai untuk membaca data, melakukan aksi, atau mengecek masalah."
        />
        <div className="grid gap-3 md:grid-cols-2">
          {sections.map((section) => {
            const slug = getDocsSectionSlug(section);
            return (
              <Link
                key={slug}
                to={getDocsEntryPath(entry, slug)}
                className="group rounded-lg border border-border bg-background/70 p-4 transition-colors hover:border-primary/30 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                    {section.description ? (
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.description}</p>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Buka bagian ini untuk membaca detail yang spesifik.
                      </p>
                    )}
                  </div>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    ) : (
      <section>
        <SectionHeading title="Ringkasan penggunaan" description={entry.summary} />
        <div className="grid gap-3 md:grid-cols-3">
          {[...entry.whenToUse, ...entry.steps, ...entry.examples].slice(0, 6).map((item) => (
            <div key={item} className="rounded-lg border border-border bg-background/70 p-4 text-sm leading-6 text-muted-foreground">
              {item}
            </div>
          ))}
        </div>
      </section>
    )}
  </div>
);

export const DocsArticle = ({
  entry,
  activeSectionSlug = DOCS_OVERVIEW_SLUG,
}: {
  entry: DocsEntry;
  activeSectionSlug?: string;
}) => {
  const Icon = entry.icon;
  const sections = getDocsEntrySections(entry);
  const isOverview = activeSectionSlug === DOCS_OVERVIEW_SLUG;
  const activeSection = isOverview
    ? null
    : sections.find((section) => getDocsSectionSlug(section) === activeSectionSlug) ?? null;
  const pageTitle = activeSection?.title ?? entry.title;
  const pageSummary = activeSection?.description ?? entry.summary;
  const relatedEntries = getRelatedEntries(entry, activeSection);
  const activeSectionIndex = activeSection
    ? sections.findIndex((section) => getDocsSectionSlug(section) === activeSectionSlug)
    : -1;
  const isRecommendationGuide = entry.id === "recommendation-tasks";
  const nextSection = isRecommendationGuide && activeSectionIndex >= 0
    ? sections[activeSectionIndex + 1] ?? null
    : null;
  const recommendationGuideCompleted = isRecommendationGuide && activeSectionIndex === sections.length - 1;
  const showRelatedEntries = isRecommendationGuide
    ? recommendationGuideCompleted
    : relatedEntries.length > 0;

  return (
    <article className="min-w-0 rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <header id={`docs-section-${DOCS_OVERVIEW_SLUG}`} className="scroll-mt-24 border-b border-border px-5 py-5 sm:px-7 sm:py-6 lg:px-9">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <Badge variant="secondary" className="rounded-md px-2 py-1 text-[11px]">
            {entry.menu}
          </Badge>
          <Badge variant="outline" className="rounded-md px-2 py-1 text-[11px]">
            {entry.version}
          </Badge>
          {!isOverview && activeSection ? (
            <Badge variant="outline" className="rounded-md px-2 py-1 text-[11px]">
              {entry.title}
            </Badge>
          ) : null}
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-foreground sm:text-3xl">{pageTitle}</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
          {pageSummary}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">Diperbarui {entry.updatedAt}</p>
      </header>

      <div className="space-y-8 px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
        {isOverview ? <DocsOverview entry={entry} sections={sections} /> : null}
        {!isOverview && activeSection ? <DocsSectionView section={activeSection} hideHeading /> : null}

        {nextSection ? (
          <nav aria-label="Lanjut ke bagian rekomendasi berikutnya" className="border-t border-border pt-6">
            <Link
              to={getDocsEntryPath(entry, getDocsSectionSlug(nextSection))}
              className="group flex min-h-14 w-full items-center justify-between gap-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5"
            >
              <span className="min-w-0">
                <span className="block text-xs font-medium text-muted-foreground">
                  Selanjutnya · Bagian {activeSectionIndex + 2} dari {sections.length}
                </span>
                <span className="mt-1 block text-sm font-semibold text-foreground sm:text-base">
                  {nextSection.title}
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
            </Link>
          </nav>
        ) : null}

        {showRelatedEntries && relatedEntries.length ? (
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold text-foreground">Topik terkait</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {relatedEntries.map((item) => (
                <Link
                  key={item.id}
                  to={getDocsEntryPath(item)}
                  className="group rounded-lg border border-border bg-muted/30 px-3 py-3 transition-colors hover:border-primary/30 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block text-sm font-semibold text-foreground">{item.title}</span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                    {item.summary}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
};
