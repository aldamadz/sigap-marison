import { Database } from "lucide-react";
import type { DocsEntry } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const deployProductionDocs: DocsEntry = {
    id: "deploy-production",
    title: "Deploy staging dan production",
    menu: "Operasional",
    audience: "troubleshooting",
    icon: Database,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Panduan deploy SIGAP dengan aplikasi, database, dan datasource terpisah serta storage bersama yang dipisahkan berdasarkan namespace.",
    whenToUse: [
      "Mendeploy perubahan frontend, halaman dokumentasi, atau server aplikasi utama.",
      "Memastikan staging tidak membaca database atau datasource production dan hanya mengakses object storage dalam namespace staging/.",
      "Memastikan deploy memakai file env dan nama project Compose yang sesuai.",
      "Memutuskan apakah PDF worker perlu ikut diredeploy.",
    ],
    steps: [
      "Pastikan perubahan sudah dibuild atau sudah siap dideploy dari workspace.",
      "Pilih compose staging untuk domain testing atau compose production untuk domain production.",
      "Jalankan command dengan Docker context `ubuntu-server`, nama project `-p`, dan file env yang sesuai.",
      "Cek status service Compose pada environment yang dipilih sampai aplikasi healthy.",
      "Buka domain staging atau production yang sesuai dan periksa `/health/ready` serta route yang berubah.",
      "Redeploy PDF worker atau sync worker hanya jika source, runtime, atau konfigurasi worker tersebut berubah.",
    ],
    examples: [
      "Perubahan dokumentasi `/docs` cukup deploy app utama, tidak perlu deploy PDF worker.",
      "Domain testing memakai `docker-compose.staging.yml`; environment Marison terkunci ke staging.",
      "Domain production memakai `docker-compose.prod.yml`; environment Marison terkunci ke production.",
      "Production dibuka melalui `https://sigap.marisoncloud.com`, sedangkan staging melalui `https://sigap.marison-testing.biz.id`.",
      "Staging memiliki project Supabase dan worker PDF sendiri, tetapi memakai storage self-hosted yang sama melalui namespace staging/.",
      "Production memakai origin publik melalui Caddy; staging tetap melalui Cloudflare Tunnel.",
      "Pengembangan lokal dengan `npm run dev` menjalankan Vite dan BFF lokal bersama-sama, memakai `.env.local`, serta tetap menggunakan Supabase dan datasource Marison staging.",
      "Perubahan `backend/src` deploy app utama karena container app yang menjalankan server Fastify.",
      "Perubahan `pdf-worker.mjs` pada staging memakai service `agenda-pdf-worker-staging`; `docker-compose.worker.yml` hanya untuk PDF worker production.",
      "Deploy app-only staging tidak merestart PDF worker atau sync worker yang sudah berjalan.",
    ],
    troubleshooting: [
      "Jika container restart karena storage kosong, pastikan staging memakai `.env.staging` dengan `STORAGE_PATH_PREFIX=staging`, sedangkan production memakai `.env.production` tanpa prefix.",
      "Jika datasource salah environment, periksa compose yang dipakai dan nilai `MARISON_DEPLOYMENT_ENVIRONMENT` di container.",
      "Jika login lokal menampilkan 502 atau 403, restart `npm run dev` dan pastikan port 3010 tidak dipakai proses lain. Endpoint `/api` development harus menuju BFF lokal, bukan domain staging publik.",
      "Jika tautan email membuka domain yang salah, periksa `APP_PUBLIC_URL` pada container aktif; nilai ini dikunci oleh file Compose.",
      "Jika route production gagal, cek proxied A record, port forward 80/443, sertifikat Caddy, dan upstream `10.10.10.246:3010`.",
      "Jika route staging gagal, cek health container, Cloudflare Tunnel, dan cache browser.",
      "Pada jaringan multi-WAN, DDNS harus mengambil alamat WAN inbound dari router; IP keluar server tidak boleh dipakai sebagai sumber DDNS.",
      "Jika PDF baru tidak diproses setelah deploy app utama, cek apakah worker memang perlu redeploy atau cukup worker yang sedang running.",
    ],
    sections: [
      {
        type: "table",
        title: "Command deploy",
        columns: ["Kebutuhan", "Command"],
        rows: [
          [
            "Deploy app-only staging",
            "docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging up -d --build --no-deps agenda-flow-staging",
          ],
          [
            "Deploy seluruh stack staging",
            "docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging up -d --build",
          ],
          [
            "Deploy PDF worker staging",
            "docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging build agenda-flow-staging; docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging up -d --no-deps agenda-pdf-worker-staging",
          ],
          [
            "Deploy sync worker staging",
            "docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging build agenda-flow-staging; docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging up -d --no-deps agenda-marison-sync-staging",
          ],
          [
            "Deploy aplikasi production",
            "docker --context ubuntu-server compose -p agenda-flow-production -f docker-compose.prod.yml --env-file .env.production up -d --build",
          ],
          [
            "Deploy PDF worker production",
            "docker --context ubuntu-server compose -p agenda-flow-production-worker -f docker-compose.worker.yml --env-file .env.production up -d --build",
          ],
          [
            "Deploy External API",
            "docker --context ubuntu-server compose -f docker-compose.external.yml --env-file .env.production up -d --build",
          ],
        ],
      },
      {
        type: "table",
        title: "Kapan worker PDF ikut deploy",
        columns: ["Perubahan", "Deploy yang diperlukan"],
        rows: [
          ["Frontend, dokumentasi, route aplikasi, atau `backend/src`", "Deploy aplikasi utama saja; worker tetap berjalan tanpa restart."],
          ["`pdf-worker.mjs`, dependency/runtime PDF, font runtime, atau konfigurasi worker", "Redeploy PDF worker pada environment terkait."],
          ["`server/marison-sync-worker.mjs`, image/runtime, token, URL, jadwal, atau konfigurasi sync", "Redeploy sync worker staging."],
          ["Folder `external-api/` atau `docker-compose.external.yml`", "Deploy External API saja."],
          ["Env storage production", "Redeploy service yang membaca env tersebut dengan `--env-file .env.production`."],
        ],
      },
    ],
  };
