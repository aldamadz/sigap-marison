import { supabase } from "@/lib/supabase";

export const getSuratStorageRelativePath = (url: string): string => {
  if (!url) return "";
  const parts = url.split("/dokumen_surat/");
  const path = parts.length < 2 ? url : parts[1];
  return decodeURIComponent(path.split("?")[0]);
};

export const downloadSuratStorageFile = async (pathOrUrl: string, bucket = "dokumen_surat") => {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const response = await fetch(pathOrUrl);
    if (!response.ok) throw new Error("Gagal download file.");
    return response.blob();
  }
  const relativePath = getSuratStorageRelativePath(pathOrUrl);
  const { data, error } = await supabase.storage.from(bucket).download(relativePath);
  if (error || !data) throw new Error(error?.message || "Gagal download file.");
  return data;
};
