# Cleanup dan Hardening SIGAP

## Status

Cleanup production dilakukan pada branch `cleanup/deadcode-role-admin`.

Keputusan produk:

- Role aplikasi hanya `admin` dan `user`.
- Layanan inbound read-only terpisah telah dipensiunkan.
- Integrasi outbound MARISON tetap dipertahankan.
- Migration historis tidak boleh diubah atau dihapus.

## Kontrak yang Harus Dipertahankan

Cleanup tidak boleh merusak:

- Login dan reset password
- Dashboard, agenda, dan kalender
- Registrasi, inbox, approval, pemeriksaan, revisi, dan monitoring surat
- Rekomendasi aset dan riwayat keterlibatan
- PDF preview, regenerasi PDF, serta lampiran
- Upload avatar
- Konfigurasi dan seluruh halaman admin
- Audit log dan dokumentasi

## Aturan Repository

1. Hapus source, dependency, route, script, dan artefak yang tidak memiliki consumer.
2. Verifikasi static import, dynamic import, npm script, Docker/Compose, database path, dan kemungkinan caller eksternal sebelum menghapus.
3. Jangan menghapus compatibility path atau aset yang masih mungkin direferensikan data historis tanpa bukti database dan access log.
4. Jangan commit `.env*`, `dist/`, `node_modules/`, file temporary, atau `*.tsbuildinfo`.
5. Production build tidak boleh menghasilkan source map publik.
6. Toast aplikasi distandarkan pada Sonner.
7. Authorization admin harus ditegakkan di server/RLS, bukan hanya route guard UI.
8. Service-role hanya boleh digunakan pada server setelah autentikasi dan authorization resource.

## Quality Gate

Setelah setiap batch besar jalankan:

```bash
npm run typecheck
npm run lint
npm test
npm run test:document-layout
npm run test:pgd-pdf
npm audit --audit-level=moderate
npm run build
```

Batch dianggap gagal jika salah satu command gagal.

## Database

- Normalisasi data role dilakukan melalui migration baru.
- Constraint aktif hanya menerima `admin` dan `user`.
- Helper admin terbaru hanya memberikan hak administratif kepada akun `admin` yang aktif dan tidak dihapus.
- Kredensial layanan inbound yang dipensiunkan harus tetap tidak aktif dan tidak dapat diaktifkan kembali.
- Seluruh perubahan migration wajib diuji pada clone database sebelum production.

## Release Gate

Release hanya `PASS` jika:

- Quality gate hijau.
- Production build tidak mengandung `*.map`.
- Tidak ada dead source atau dependency yang telah disetujui untuk dihapus.
- Tidak ada route service-role tanpa autentikasi dan authorization.
- Login, surat, PDF, storage, admin, dan audit flow lulus smoke test.
- Container sehat dan tidak ada service yatim.

Jika salah satu syarat belum terbukti, status release adalah `BLOCKED`.
