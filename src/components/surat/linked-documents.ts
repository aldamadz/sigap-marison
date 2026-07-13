import type { LinkedSuratDocument } from "@/services/surat.service";

export type LinkedDocumentListItem = {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  suratId: string;
  status: string | null;
};

export const getActiveRecommendationDocuments = (
  documents: LinkedSuratDocument[] | undefined | null
): LinkedDocumentListItem[] => {
  return (documents || [])
    .filter((document) => document.link_type === "recommendation" && document.status === "active")
    .map((document) => ({
      id: document.id,
      label: "Rekomendasi",
      title: document.child_judul_surat || document.child_no_surat || "Dokumen rekomendasi",
      subtitle: [
        document.child_no_surat || "Nomor diproses",
        document.child_status ? `Status ${document.child_status}` : null,
      ].filter(Boolean).join(" · "),
      suratId: document.child_surat_id,
      status: document.child_status,
    }));
};
