import { type DocsEntry, type DocsSection } from "./types";

export const DOCS_OVERVIEW_SLUG = "overview";

export const slugifyDocsSegment = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " dan ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const DOCS_ENTRY_SLUGS: Record<string, string> = {
  dashboard: "dashboard",
  agenda: "agenda",
  calendar: "kalender",
  "surat-registration": "registrasi-surat",
  "request-categories": "kategori-pengajuan",
  "approval-inbox": "persetujuan",
  "recommendation-tasks": "rekomendasi",
  monitoring: "status-pengajuan",
  "documents-attachments": "dokumen-lampiran",
  history: "riwayat-terlibat",
  settings: "pengaturan",
  "admin-users": "user-organization",
  "admin-hierarchy": "hirarki-organisasi",
  "admin-departments": "master-departemen",
  "admin-entities": "master-entitas",
  "admin-letter-types": "master-jenis-surat",
  "admin-offices": "master-kantor-cabang",
  "admin-projects": "master-proyek",
  "admin-form-usages": "kegunaan-form",
  "admin-integration": "integrasi-marison",
  "admin-numbering": "penomoran-surat",
  "admin-job-title-labels": "label-jabatan",
  "admin-sla": "sla-departemen",
  "admin-monitoring": "monitoring-admin",
  "admin-audit": "audit-log",
  "admin-email": "email-notification",
  "login-access": "login-akses",
  "document-file": "dokumen-lampiran-error",
  notification: "notifikasi-realtime",
  "external-api": "external-api",
  "deploy-production": "deploy-production",
};

export const DOCS_SECTION_SLUGS: Record<string, string> = {
  "Data yang ditampilkan": "data-yang-ditampilkan",
  "Bagian pada Dashboard": "bagian-dashboard",
  "Kontrol periode": "kontrol-periode",
  "Membaca ringkasan Pengajuan Surat": "ringkasan-pengajuan-surat",
  "Membaca KPI Agenda": "kpi-agenda",
  "Menelusuri pekerjaan dari Dashboard": "alur-dashboard",
  "Kendala pada Dashboard": "kendala-dashboard",
  "Nomor surat dan draft": "nomor-draft",
  "Alur registrasi dokumen": "alur-registrasi",
  "Pilihan kategori": "kategori-pengajuan",
  "Yang otomatis diisi sistem": "data-otomatis",
  "Masalah umum saat registrasi": "kendala-registrasi",
  "Area utama Persetujuan": "area-persetujuan",
  "Alur signer": "alur-signer",
  "Perbedaan signer dan tim pemeriksa": "signer-dan-tim-pemeriksa",
  "Jika pengajuan Unit": "pengajuan-unit",
  "Masalah umum saat approval": "kendala-approval",
  "Alur rekomendasi aset": "alur-rekomendasi-aset",
  "Mengisi dokumen rekomendasi": "mengisi-dokumen-rekomendasi",
  "Status dan lock rekomendasi": "status-lock-rekomendasi",
  "Masalah umum rekomendasi": "kendala-rekomendasi",
  "Membaca nomor surat": "membaca-nomor-surat",
  "Nomor surat, counter, dan draft": "nomor-surat-counter-draft",
  "Variasi format nomor": "variasi-format-nomor",
  "Scope dan reset nomor": "scope-reset-nomor",
  "Siklus draft dan nomor": "siklus-draft-nomor",
};

export const getDocsEntrySlug = (entry: DocsEntry) =>
  DOCS_ENTRY_SLUGS[entry.id] ?? slugifyDocsSegment(entry.title || entry.id);

export const getDocsSectionSlug = (section: DocsSection) =>
  DOCS_SECTION_SLUGS[section.title] ?? slugifyDocsSegment(section.title);

export const getDocsEntryPath = (entry: DocsEntry, sectionSlug = DOCS_OVERVIEW_SLUG) =>
  `/docs/${getDocsEntrySlug(entry)}/${sectionSlug}`;

export const getDocsVersionPath = () => "/docs/versi/changelog";
