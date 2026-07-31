# Mapping Payload Marison Staging

MRN-16 memetakan record SIGAP trial ke record mirror hasil sinkronisasi Marison staging. Mapping tidak mengubah nama, NIK, kantor, atau proyek SIGAP dan tidak berlaku di production.

Status per 31 Juli 2026: migration dan aplikasi sudah diterapkan di staging. Acceptance backend rollback serta pemeriksaan UI desktop/mobile telah lulus tanpa mengubah antrean bisnis atau mengirim POST bisnis ke Marison.

## Katalog

- Employee: `profiles` dengan `marison_employee_id`, NIK valid, dan `marison_synced_at`.
- Kantor: `master_offices` dengan `marison_branch_id` dan `marison_synced_at`.
- Proyek: `master_projects` dengan `marison_project_id`, `marison_synced_at`, dan kantor mirror dengan branch ID/provenance valid.
- `marison_review_required` hanya status kelengkapan operasional SIGAP; tidak memblokir identitas external payload.
- UI mencari katalog lokal hasil sync, bukan memanggil API external per ketikan.

## Nilai Payload

Prioritas: mapping staging record terkait, lalu identitas external milik record hasil sync, lalu fail-closed.

Contoh user trial:

`TRIAL-001` milik Aldama tetap dipakai proses internal. Mapping ke employee mirror Agung dengan NIK `A 114` membuat `submitted_by` payload memakai `A 114`.

Setiap signer diselesaikan berdasarkan `signature.user_id`. Mapping pemohon tidak dipakai untuk signer lain. Signer tanpa mapping memakai NIK SIGAP hanya bila katalog employee valid; selain itu payload ditahan.

Contoh kantor dan proyek:

`KC Trial` dapat dipetakan ke kantor mirror dengan branch ID `12`. `Proyek Trial` dapat dipetakan ke proyek mirror dengan project ID `25` hanya bila relasi kantor/branch valid.

## Audit Dan Production

- Activity log mencatat actor, environment, record SIGAP, target mirror, before/after, dan reason.
- Payload source mencatat `requesterNik` dan `approval:<step_order>:<profile_id>`.
- `payload_resolution_sources` memakai `external_source`, `staging_mapping`, atau `unavailable`.
- NIK tidak ditulis ke audit log; UI admin menerima nilai penuh melalui BFF `no-store`.
- Singleton MRN-15 dipertahankan untuk histori/status lama dan deprecated untuk payload bisnis.
