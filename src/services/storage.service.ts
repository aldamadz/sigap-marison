import { supabase } from "@/lib/supabase";

type UploadInput = {
  bucket: string;
  path: string;
  file: Blob;
  upsert?: boolean;
};

type UploadResult = {
  bucket: string;
  path: string;
  origin: string;
  publicUrl: string;
};

export const appStorageService = {
  async upload({ bucket, path, file, upsert = false }: UploadInput): Promise<UploadResult> {
    const { data: { session } } = await supabase.auth.getSession({ force: true });
    if (!session) throw new Error("Tidak terautentikasi");

    const formData = new FormData();
    formData.set("bucket", bucket);
    formData.set("path", path);
    formData.set("upsert", String(upsert));
    formData.set("file", file);

    let response: Response;
    try {
      response = await fetch("/api/storage/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });
    } catch (error: any) {
      throw new Error(
        error?.message === "Failed to fetch" || error?.message === "fetch failed"
          ? "Server upload tidak bisa dihubungi. Periksa container production dan koneksi storage."
          : error?.message || "Server upload tidak bisa dihubungi."
      );
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "Gagal upload file.");
    return payload as UploadResult;
  },

  getLegacyPublicUrl(bucket: string, path: string) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  },
};
