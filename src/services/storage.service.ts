import { supabase } from "@/lib/supabase";

type UploadInput = {
  bucket: string;
  path: string;
  file: Blob;
  upsert?: boolean;
  onProgress?: (progress: UploadProgress) => void;
};

export type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

export type UploadResult = {
  bucket: string;
  path: string;
  origin: string;
  publicUrl: string;
};

export const appStorageService = {
  async upload({ bucket, path, file, upsert = false, onProgress }: UploadInput): Promise<UploadResult> {
    const { data: { session } } = await supabase.auth.getSession({ force: true });
    if (!session) throw new Error("Tidak terautentikasi");

    const formData = new FormData();
    formData.set("bucket", bucket);
    formData.set("path", path);
    formData.set("upsert", String(upsert));
    formData.set("file", file);

    return new Promise<UploadResult>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/api/storage/upload");
      request.responseType = "json";
      request.setRequestHeader("Authorization", `Bearer ${session.access_token}`);

      onProgress?.({ loaded: 0, total: file.size, percent: 0 });
      request.upload.addEventListener("progress", (event) => {
        const requestTotal = event.lengthComputable && event.total > 0 ? event.total : file.size;
        const requestLoaded = Math.min(event.loaded, requestTotal);
        const ratio = requestTotal > 0 ? Math.min(requestLoaded / requestTotal, 1) : 0;
        const loaded = Math.round(file.size * ratio);
        onProgress?.({
          loaded,
          total: file.size,
          percent: Math.min(Math.round(ratio * 100), 100),
        });
      });

      request.addEventListener("load", () => {
        const payload = request.response && typeof request.response === "object"
          ? request.response as Record<string, unknown>
          : {};
        if (request.status < 200 || request.status >= 300) {
          reject(new Error(typeof payload.error === "string" ? payload.error : "Gagal upload file."));
          return;
        }
        onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
        resolve(payload as UploadResult);
      });
      request.addEventListener("error", () => {
        reject(new Error("Server upload tidak bisa dihubungi. Periksa koneksi dan coba kembali."));
      });
      request.addEventListener("abort", () => {
        reject(new Error("Upload dibatalkan."));
      });
      request.send(formData);
    });
  },

  getLegacyPublicUrl(bucket: string, path: string) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  },
};
