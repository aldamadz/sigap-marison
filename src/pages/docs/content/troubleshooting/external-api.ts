import { Database } from "lucide-react";
import type { DocsEntry } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const externalApiDocs: DocsEntry = {
    id: "external-api",
    title: "External API",
    menu: "Operasional",
    audience: "troubleshooting",
    icon: Database,
    version: DOCS_VERSION,
    updatedAt: DOCS_UPDATED_AT,
    summary: "Panduan memakai API eksternal SIGAP untuk surat dan master data onboarding akun.",
    whenToUse: [
      "Sistem lain perlu membaca data surat yang sudah disetujui atau sedang dipantau.",
      "Sistem lain perlu menampilkan pilihan Kantor Pusat, KC, KCP, dan Departemen saat user login pertama kali.",
      "Partner perlu menguji access token, signature, dan endpoint master data tanpa membuka dashboard SIGAP.",
    ],
    steps: [
      "Minta `client_id` dan `client_secret` dari admin SIGAP.",
      "Generate access token melalui `POST /api/access-token` dari backend partner.",
      "Buat signature setiap request dengan access token, path, body hash, dan timestamp.",
      "Untuk onboarding akun, panggil `GET /api/onboarding/options` agar pilihan kantor dan departemen tersedia dalam satu response.",
      "Gunakan endpoint master terpisah jika aplikasi hanya butuh daftar KC, KCP, atau Departemen tertentu.",
    ],
    examples: [
      "User memilih Kantor Pusat: tampilkan daftar `departments` dari response onboarding.",
      "User memilih KC: tampilkan daftar `offices.kc`.",
      "User memilih KCP: tampilkan daftar `offices.kcp`.",
      "Endpoint master data tidak mengirim email kantor/departemen dan tidak mengirim data user.",
    ],
    troubleshooting: [
      "Jika response `Unauthorized`, cek access token, `X-Timestamp`, dan `X-Signature`.",
      "Jika daftar kosong, pastikan master kantor/departemen sudah aktif dan tipe kantor terisi benar.",
      "Jika partner hanya butuh satu daftar, pakai endpoint filter seperti `/api/master/offices?type=kc`.",
    ],
    related: ["Deploy production", "Master Kantor Cabang", "Master Departemen"],
    sections: [
      {
        type: "table",
        title: "Endpoint master data",
        columns: ["Endpoint", "Dipakai untuk"],
        rows: [
          ["GET /api/onboarding/options", "Mengambil tipe kantor, daftar Kantor Pusat/KC/KCP, dan Departemen pusat dalam satu response."],
          ["GET /api/master/offices?type=pusat", "Mengambil pilihan Kantor Pusat."],
          ["GET /api/master/offices?type=kc", "Mengambil pilihan KC."],
          ["GET /api/master/offices?type=kcp", "Mengambil pilihan KCP."],
          ["GET /api/master/departments?scope=pusat", "Mengambil pilihan Departemen untuk user Kantor Pusat."],
          ["GET /api/master/departments?scope=cabang", "Mengambil pilihan Departemen cabang jika partner membutuhkannya."],
        ],
      },
      {
        type: "table",
        title: "Field yang dikirim",
        columns: ["Data", "Field"],
        rows: [
          ["Kantor", "`id`, `code`, `name`, `type`, `type_label`, `parent_id`, `parent_code`, `parent_name`."],
          ["Departemen", "`id`, `code`, `name`, `dept_index`, `scope`."],
          ["Yang tidak dikirim", "Email, data user, secret, dan field internal lain."],
        ],
      },
    ],
  };
