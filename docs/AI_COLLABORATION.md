# AI Collaboration Protocol

Dokumen ini mengatur koordinasi manusia dan AI coding agent yang bekerja paralel
pada repository SIGAP. Tujuannya adalah mencegah dua pekerja mengubah branch,
file, migration, atau environment yang sama tanpa mengetahui pekerjaan pihak
lain.

Dokumen ini tidak dapat mendeteksi proses AI lain secara langsung. Koordinasi
harus menggunakan jejak bersama yang dapat dilihat semua pekerja: GitHub Issue,
draft pull request, remote branch, commit, dan komentar handoff.

## 1. Sumber Koordinasi

Gunakan sumber berikut berdasarkan urutan prioritas:

1. GitHub Issue yang sudah ada untuk pekerjaan tersebut.
2. Draft pull request dari branch pekerjaan.
3. Remote branch dan commit terbaru.
4. Perubahan lokal pada worktree yang sedang digunakan.

Jangan memakai file `ACTIVE_TASK.md` sebagai lock utama. File status lokal mudah
basi, tidak terlihat sebelum di-push, dan dapat menjadi titik konflik baru.

## 2. Pemeriksaan Sebelum Mulai

Setiap pekerja wajib melakukan pemeriksaan berikut sebelum mengubah file:

```powershell
git fetch origin --prune
git status --short --branch
git worktree list
git branch -r --sort=-committerdate
gh pr list --state open
gh issue list --state open
```

Setelah itu:

1. Baca root `AGENTS.md` dan `docs/FEATURE_RELEASE_MAP.md`.
2. Pastikan tidak ada Issue, PR, branch, atau worktree aktif dengan cakupan sama.
3. Periksa perubahan tracked dan untracked. Jangan menghapus atau menimpa
   perubahan yang tidak dibuat sendiri.
4. Jika pekerjaan bertabrakan pada file atau migration yang sama, hentikan
   perubahan dan minta keputusan pemilik pekerjaan atau pengguna.
5. Jika pekerjaan tidak bertabrakan, gunakan branch dan worktree terpisah.

## 3. Klaim Pekerjaan

Untuk pekerjaan nontrivial, gunakan Issue yang ada atau buat Issue dengan
informasi berikut:

```text
Status: active
Owner: <nama manusia atau agent/tool>
Branch: <feature|fix|docs|refactor>/<nama-singkat>
Base/target: <main atau staging>
Environment: <local, staging, atau production>
Feature ID: <ID dari FEATURE_RELEASE_MAP.md>
Scope: <hasil yang dikerjakan>
Likely files: <daftar file atau area>
Started: <timestamp dan zona waktu>
```

Jika Issue tidak dapat dibuat, push branch lebih awal dan buka draft PR dengan
informasi yang sama. Branch lokal tanpa Issue, draft PR, atau push bukan klaim
yang dapat dilihat pekerja lain.

## 4. Kepemilikan dan Isolasi

1. Satu branch hanya memiliki satu pemilik aktif pada satu waktu.
2. Satu worktree digunakan untuk satu branch pekerjaan.
3. Jangan melanjutkan branch milik pekerja lain tanpa handoff eksplisit.
4. Jangan bekerja langsung pada `main` atau `staging`.
5. Jangan memakai branch yang sama untuk pekerjaan yang dapat dipisahkan.
6. Push commit kecil yang sudah konsisten agar progres terlihat, tetapi jangan
   push kode rusak hanya untuk menandai aktivitas.
7. Migration menggunakan timestamp unik dan harus dikoordinasikan sebelum dibuat.
8. Deployment dan perubahan database mengikuti izin environment pada `AGENTS.md`.

## 5. Saat Menemukan Pekerjaan Paralel

Gunakan keputusan berikut:

| Kondisi | Tindakan |
| --- | --- |
| Branch berbeda, file berbeda | Lanjutkan pada worktree sendiri |
| Branch berbeda, file sama | Koordinasikan urutan atau bagi kepemilikan file |
| Branch sama, pemilik berbeda | Jangan push; minta handoff atau buat branch baru |
| Ada perubahan lokal tidak dikenal | Jangan revert; periksa scope dan hindari file tersebut |
| Migration/schema sama | Hentikan dan sepakati migration tunggal atau urutan forward-only |
| Deployment sedang berlangsung | Jangan deploy paralel ke environment yang sama |
| Konflik langsung tidak dapat dipisahkan | Hentikan pekerjaan dan minta keputusan pengguna |

## 6. Handoff

Saat pekerjaan dipindahkan ke pekerja lain, tulis komentar pada Issue atau PR:

```text
Status: handoff
Last commit: <SHA>
Completed: <ringkasan>
Remaining: <langkah tersisa>
Verification: <command dan hasil>
Known failures: <kegagalan yang ada>
Uncommitted files: <daftar atau none>
Environment changes: <daftar atau none>
Do not modify: <area yang masih dimiliki pekerja lain>
```

Penerima handoff wajib fetch ulang dan memverifikasi status branch sebelum
melanjutkan.

## 7. Penyelesaian

1. Jalankan quality gate yang relevan.
2. Push seluruh commit yang dimaksud.
3. Perbarui Issue atau PR menjadi `ready for review`, `blocked`, atau `completed`.
4. Catat deployment dan smoke test bila dilakukan.
5. Jangan menghapus branch fitur yang masih diperlukan untuk selective release.
6. Bersihkan worktree hanya setelah memastikan tidak ada perubahan lokal dan
   branch tidak lagi digunakan.

## 8. Dukungan Tool AI

Tidak semua AI otomatis membaca file yang sama:

| Tool atau mekanisme | Discovery umum |
| --- | --- |
| OpenCode di repository ini | Root `AGENTS.md` |
| Agent yang hanya membaca dokumentasi | Harus diarahkan ke file ini |
| Cursor, Claude Code, GitHub Copilot, dan tool lain | Memerlukan konfigurasi/instruction file masing-masing |
| AI eksternal tanpa akses repository/GitHub | Tidak dapat melihat protokol ini |

Karena itu, root `AGENTS.md` menjadi entry point untuk agent yang mendukungnya.
Jika tool AI baru dipakai, tambahkan instruction file native tool tersebut yang
mengarahkan agent ke `AGENTS.md`, `docs/AI_COLLABORATION.md`, dan
`docs/FEATURE_RELEASE_MAP.md`.
