import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { documentPreviewService } from "@/services/document-preview.service";

type PdfOpenOptions = {
  refresh?: boolean;
  signatureId?: string | null;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

export const documentOperationKey = {
  pdf: (suratId: string, suffix = "main") => `pdf:${suratId}:${suffix}`,
  file: (suratId: string, fileId: string) => `file:${suratId}:${fileId}`,
};

export function useDocumentOpener() {
  const [openingKeys, setOpeningKeys] = useState<Set<string>>(() => new Set());
  const locksRef = useRef(new Set<string>());

  const run = useCallback(async (key: string, operation: () => Promise<void>, fallbackMessage: string) => {
    if (locksRef.current.has(key)) return;
    locksRef.current.add(key);
    setOpeningKeys(previous => new Set(previous).add(key));
    try {
      await operation();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : fallbackMessage, {
        action: {
          label: "Coba lagi",
          onClick: () => void run(key, operation, fallbackMessage),
        },
      });
    } finally {
      locksRef.current.delete(key);
      setOpeningKeys(previous => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const openPdf = useCallback((suratId: string, key = documentOperationKey.pdf(suratId), options: PdfOpenOptions = {}) =>
    run(
      key,
      () => documentPreviewService.openGeneratedPdfInNewTab(suratId, options),
      "Gagal membuka PDF dokumen."
    ), [run]);

  const openFile = useCallback((suratId: string, path: string, key: string) =>
    run(
      key,
      () => documentPreviewService.openStoredFileInNewTab(suratId, path),
      "Gagal membuka lampiran."
    ), [run]);

  const isOpening = useCallback((key: string) => openingKeys.has(key), [openingKeys]);

  return { openPdf, openFile, isOpening, openingKeys };
}
