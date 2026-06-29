do $$
declare
  v_form_id uuid;
  v_usage_id uuid;
  v_step_id uuid;
  v_usage record;
  v_step record;
begin
  select id into v_form_id
  from public.master_forms
  where nama_form ilike '%FORM PERMINTAAN BARANG%JASA%'
  order by created_at desc nulls last
  limit 1;

  if v_form_id is null then
    raise notice 'Form PGD tidak ditemukan. Seed kegunaan tambahan dilewati.';
    return;
  end if;

  create temp table if not exists pg_temp.sigap_usage_seed (
    route_key text not null,
    name text not null,
    description text,
    request_category text not null,
    scope_type text not null,
    allowed_department_names text[] not null,
    sort_order integer not null
  ) on commit drop;

  create temp table if not exists pg_temp.sigap_usage_step_seed (
    route_key text not null,
    step_order integer not null,
    role_name text not null,
    label text not null,
    signer_department_name text,
    candidate_scope text not null,
    candidate_department_names text[] not null default array[]::text[],
    job_patterns text[] not null default array[]::text[]
  ) on commit drop;

  truncate table pg_temp.sigap_usage_seed;
  truncate table pg_temp.sigap_usage_step_seed;

  insert into pg_temp.sigap_usage_seed(route_key, name, description, request_category, scope_type, allowed_department_names, sort_order)
  values
    ('utility_pdam_listrik', 'Permohonan dana jaringan listrik & PDAM', 'Kegunaan PGD untuk dana jaringan listrik dan PDAM.', 'non_asset', 'cabang', array['Teknik (Cabang)', 'Umum & Keuangan (Cabang)', 'Branch Manager'], 320),
    ('potong_pohon_talud', 'Permohonan dana tenaga potong pohon (ntk bangun talud)', 'Kegunaan PGD untuk dana tenaga potong pohon terkait pekerjaan talud.', 'non_asset', 'cabang', array['Teknik (Cabang)', 'Umum & Keuangan (Cabang)', 'Branch Manager'], 321),

    ('slo_slf_pdam_pln', 'Pembayaran SLO & SLF', 'Kegunaan PGD untuk SLO, SLF, SR PDAM, dan SR PLN.', 'non_asset', 'cabang', array['Teknik (Cabang)', 'Umum & Keuangan (Cabang)', 'Branch Manager'], 322),
    ('slo_slf_pdam_pln', 'Permohonan SR PDAM & PLN', 'Kegunaan PGD untuk SLO, SLF, SR PDAM, dan SR PLN.', 'non_asset', 'cabang', array['Teknik (Cabang)', 'Umum & Keuangan (Cabang)', 'Branch Manager'], 323),
    ('slo_slf_pdam_pln', 'SR meter PDAM reguler', 'Kegunaan PGD untuk SLO, SLF, SR PDAM, dan SR PLN.', 'non_asset', 'cabang', array['Teknik (Cabang)', 'Umum & Keuangan (Cabang)', 'Branch Manager'], 324),
    ('slo_slf_pdam_pln', 'SLF', 'Kegunaan PGD untuk SLO, SLF, SR PDAM, dan SR PLN.', 'non_asset', 'cabang', array['Teknik (Cabang)', 'Umum & Keuangan (Cabang)', 'Branch Manager'], 325),
    ('slo_slf_pdam_pln', 'SLO', 'Kegunaan PGD untuk SLO, SLF, SR PDAM, dan SR PLN.', 'non_asset', 'cabang', array['Teknik (Cabang)', 'Umum & Keuangan (Cabang)', 'Branch Manager'], 326),

    ('bunga_instansi', 'Permohonan Karangan bunga Polsek/polres, Koramil, Kelurahan Kecamatan - Dinas', 'Kegunaan PGD untuk karangan bunga instansi wilayah.', 'non_asset', 'cabang', array['Branch Manager', 'Umum & Keuangan (Cabang)'], 327),

    ('legal_perizinan', 'Penawaran pengerjaan dokumen UKL-UPL, Biaya UKL/UPL', 'Kegunaan PGD untuk dokumen dan biaya perizinan proyek.', 'non_asset', 'cabang', array['Branch Manager', 'Umum & Keuangan (Cabang)'], 328),
    ('legal_perizinan', 'Biaya pengesahan siteplan', 'Kegunaan PGD untuk dokumen dan biaya perizinan proyek.', 'non_asset', 'cabang', array['Branch Manager', 'Umum & Keuangan (Cabang)'], 329),
    ('legal_perizinan', 'Biaya PBG', 'Kegunaan PGD untuk dokumen dan biaya perizinan proyek.', 'non_asset', 'cabang', array['Branch Manager', 'Umum & Keuangan (Cabang)'], 330),

    ('bunga_bank_notaris', 'Permohonan Karangan bunga untuk Bank, Notaris', 'Kegunaan PGD untuk karangan bunga relasi bank dan notaris.', 'non_asset', 'cabang', array['Branch Manager', 'Umum & Keuangan (Cabang)'], 331),
    ('bunga_bank_notaris', 'Karangan bunga ultah Bank BTN Syariah', 'Kegunaan PGD untuk karangan bunga relasi bank dan notaris.', 'non_asset', 'cabang', array['Branch Manager', 'Umum & Keuangan (Cabang)'], 332),
    ('bunga_karyawan_relasi', 'Permohonan Karangan bunga untuk Karyawan Cabang + Pusat, Relasi.', 'Kegunaan PGD untuk karangan bunga karyawan cabang/pusat dan relasi.', 'non_asset', 'all', array['Branch Manager', 'Umum & Keuangan (Cabang)', 'HRD & GA', 'Keuangan & Akuntansi', 'Legal Lahan', 'Legal Proyek', 'Marketing', 'Marketing (Cabang)', 'Operasional Kost', 'Pengadaan', 'Pengembangan Bisnis', 'Pengembangan Organisasi', 'Perencanaan'], 333),

    ('aset_pusat', 'Permohonan Aset (Pusat)', 'Kegunaan PGD untuk permohonan aset kantor pusat.', 'asset', 'pusat', array['HRD & GA', 'Keuangan & Akuntansi', 'Legal Lahan', 'Legal Proyek', 'Marketing', 'Marketing (Cabang)', 'Operasional Kost', 'Pengadaan', 'Pengembangan Bisnis', 'Pengembangan Organisasi', 'Perencanaan'], 334),
    ('aset_cabang', 'Permohonan Aset (Cabang)', 'Kegunaan PGD untuk permohonan aset cabang.', 'asset', 'cabang', array['Umum & Keuangan (Cabang)', 'Branch Manager'], 335),
    ('non_aset_pusat', 'Permohonan Non Aset (Pusat)', 'Kegunaan PGD untuk permohonan non aset kantor pusat.', 'non_asset', 'pusat', array['HRD & GA', 'Keuangan & Akuntansi', 'Legal Lahan', 'Legal Proyek', 'Marketing', 'Marketing (Cabang)', 'Operasional Kost', 'Pengadaan', 'Pengembangan Bisnis', 'Pengembangan Organisasi', 'Perencanaan'], 336),
    ('non_aset_cabang', 'Permohonan Non Aset (Cabang)', 'Kegunaan PGD untuk permohonan non aset cabang.', 'non_asset', 'cabang', array['Umum & Keuangan (Cabang)', 'Branch Manager'], 337),

    ('spion_inventaris', 'Biaya ganti spion mobil inventaris (pecah krn laka)', 'Kegunaan PGD untuk biaya penggantian spion mobil inventaris.', 'non_asset', 'pusat', array['HRD & GA'], 338),
    ('pintu_kantor', 'Permohonan penggantian perbaikan pintu kantor', 'Kegunaan PGD untuk penggantian atau perbaikan pintu kantor.', 'non_asset', 'cabang', array['Branch Manager', 'Umum & Keuangan (Cabang)'], 339),
    ('pelatihan_event', 'Biaya Pelatihan & event perusahaan (selamatan kantor cabang, Bukber, Halal bil halal,dll.)', 'Kegunaan PGD untuk pelatihan dan event perusahaan.', 'non_asset', 'cabang', array['Branch Manager', 'Umum & Keuangan (Cabang)'], 340),
    ('selamatan_cabang', 'Biaya selamatan kantor cabang', 'Kegunaan PGD untuk biaya selamatan kantor cabang.', 'non_asset', 'cabang', array['Branch Manager', 'Umum & Keuangan (Cabang)'], 341),
    ('customer_gathering', 'Biaya Customer Gathering', 'Kegunaan PGD untuk biaya Customer Gathering.', 'non_asset', 'cabang', array['Umum & Keuangan (Cabang)', 'Branch Manager'], 342),

    ('iklan_loker', 'Permohonan Biaya pemasangan iklan loker', 'Kegunaan PGD untuk biaya pemasangan iklan lowongan kerja.', 'non_asset', 'cabang', array['Branch Manager', 'Umum & Keuangan (Cabang)'], 343),
    ('iklan_loker', 'Biaya pasang loker di instagram', 'Kegunaan PGD untuk biaya pemasangan iklan lowongan kerja.', 'non_asset', 'cabang', array['Branch Manager', 'Umum & Keuangan (Cabang)'], 344),

    ('entertain_pusat', 'Entertain Pusat ( perintis, dinas, perbankan, relasi, pemangku wilayah, dll.)', 'Kegunaan PGD untuk entertain kantor pusat.', 'non_asset', 'pusat', array['HRD & GA', 'Keuangan & Akuntansi', 'Legal Lahan', 'Legal Proyek', 'Marketing', 'Marketing (Cabang)', 'Operasional Kost', 'Pengadaan', 'Pengembangan Bisnis', 'Pengembangan Organisasi', 'Perencanaan'], 345),
    ('entertain_cabang', 'Entertain Cabang ( perintis, dinas, perbankan, relasi, pemangku wilayah, dll.)', 'Kegunaan PGD untuk entertain cabang.', 'non_asset', 'cabang', array['Branch Manager', 'Umum & Keuangan (Cabang)'], 346),
    ('entertain_pln', 'Entertain PLN (proses perijinan awal)', 'Kegunaan PGD untuk entertain PLN pada proses perizinan awal.', 'non_asset', 'cabang', array['Branch Manager', 'Umum & Keuangan (Cabang)'], 347),
    ('parcel', 'Permohonan Parcel', 'Kegunaan PGD untuk permohonan parcel.', 'non_asset', 'pusat', array['HRD & GA'], 348),
    ('kompensasi_saluran_air', 'Biaya kompensasi saluran air warga', 'Kegunaan PGD untuk kompensasi saluran air warga.', 'non_asset', 'cabang', array['Branch Manager', 'Umum & Keuangan (Cabang)'], 349);

  insert into pg_temp.sigap_usage_step_seed(route_key, step_order, role_name, label, signer_department_name, candidate_scope, candidate_department_names, job_patterns)
  values
    ('utility_pdam_listrik', 1, 'membuat', 'Spv. Teknik', 'Teknik (Cabang)', 'request_office', array['Teknik (Cabang)'], array['supervisor teknik']),
    ('utility_pdam_listrik', 2, 'membuat', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('utility_pdam_listrik', 3, 'memeriksa', 'Mgr. Perencanaan', 'Perencanaan', 'head_office', array['Perencanaan'], array['manager perencanaan']),
    ('utility_pdam_listrik', 4, 'memeriksa', 'Mgr. Pengadaan', 'Pengadaan', 'head_office', array['Pengadaan'], array['manager pengadaan']),
    ('utility_pdam_listrik', 5, 'menyetujui', 'Direktur I', 'Direksi', 'head_office', array['Direksi'], array['direktur i']),
    ('utility_pdam_listrik', 6, 'menyetujui', 'Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur utama']),

    ('potong_pohon_talud', 1, 'membuat', 'Spv. Teknik', 'Teknik (Cabang)', 'request_office', array['Teknik (Cabang)'], array['supervisor teknik']),
    ('potong_pohon_talud', 2, 'membuat', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('potong_pohon_talud', 3, 'memeriksa', 'Mgr. Perencanaan', 'Perencanaan', 'head_office', array['Perencanaan'], array['manager perencanaan']),
    ('potong_pohon_talud', 4, 'menyetujui', 'Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur utama']),

    ('slo_slf_pdam_pln', 1, 'membuat', 'Koordinator Teknik', 'Teknik (Cabang)', 'request_office', array['Teknik (Cabang)'], array['koordinator pengawas lapangan', 'koordinator teknik']),
    ('slo_slf_pdam_pln', 2, 'membuat', 'Spv. Teknik', 'Teknik (Cabang)', 'request_office', array['Teknik (Cabang)'], array['supervisor teknik']),
    ('slo_slf_pdam_pln', 3, 'memeriksa', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('slo_slf_pdam_pln', 4, 'menyetujui', 'Mgr. Pengadaan', 'Pengadaan', 'head_office', array['Pengadaan'], array['manager pengadaan']),

    ('bunga_instansi', 1, 'membuat', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('bunga_instansi', 2, 'memeriksa', 'Mgr. Legal Lahan', 'Legal Lahan', 'head_office', array['Legal Lahan'], array['manager legal lahan']),
    ('bunga_instansi', 3, 'menyetujui', 'Direktur I', 'Direksi', 'head_office', array['Direksi'], array['direktur i']),

    ('legal_perizinan', 1, 'membuat', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('legal_perizinan', 2, 'memeriksa', 'Mgr. Legal Proyek', 'Legal Proyek', 'head_office', array['Legal Proyek'], array['manager legal proyek%', 'manager legal proyek & humas']),
    ('legal_perizinan', 3, 'menyetujui', 'Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur utama']),

    ('bunga_bank_notaris', 1, 'membuat', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('bunga_bank_notaris', 2, 'memeriksa', 'Mgr. Marketing', 'Marketing', 'head_office', array['Marketing'], array['manager marketing']),
    ('bunga_bank_notaris', 3, 'menyetujui', 'Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur utama']),

    ('bunga_karyawan_relasi', 1, 'membuat', 'BM / Pimpinan Departemen', null, 'branch_office_or_request_department', array['Branch Manager', 'HRD & GA', 'Keuangan & Akuntansi', 'Legal Lahan', 'Legal Proyek', 'Marketing', 'Pengadaan', 'Pengembangan Bisnis', 'Pengembangan Organisasi', 'Perencanaan'], array['branch manager', 'manager %']),
    ('bunga_karyawan_relasi', 2, 'memeriksa', 'Mgr. Marketing', 'Marketing', 'head_office', array['Marketing'], array['manager marketing']),
    ('bunga_karyawan_relasi', 3, 'menyetujui', 'Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur utama']),

    ('aset_pusat', 1, 'membuat', 'Staff Departemen', null, 'head_office', array['HRD & GA', 'Keuangan & Akuntansi', 'Legal Lahan', 'Legal Proyek', 'Marketing', 'Marketing (Cabang)', 'Operasional Kost', 'Pengadaan', 'Pengembangan Bisnis', 'Pengembangan Organisasi', 'Perencanaan'], array['staff %']),
    ('aset_pusat', 2, 'memeriksa', 'Pimpinan Departemen', null, 'request_department', array['HRD & GA', 'Keuangan & Akuntansi', 'Legal Lahan', 'Legal Proyek', 'Marketing', 'Pengadaan', 'Pengembangan Bisnis', 'Pengembangan Organisasi', 'Perencanaan'], array['manager %']),
    ('aset_pusat', 3, 'memeriksa', 'Mgr. HRD GA', 'HRD & GA', 'head_office', array['HRD & GA'], array['manager hrd%']),
    ('aset_pusat', 4, 'menyetujui', 'Direktur I', 'Direksi', 'head_office', array['Direksi'], array['direktur i']),
    ('aset_pusat', 5, 'menyetujui', 'Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur utama']),

    ('aset_cabang', 1, 'membuat', 'Staff Admin', 'Umum & Keuangan (Cabang)', 'request_office', array['Umum & Keuangan (Cabang)'], array['staff admin%']),
    ('aset_cabang', 2, 'memeriksa', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('aset_cabang', 3, 'memeriksa', 'Mgr. HRD GA', 'HRD & GA', 'head_office', array['HRD & GA'], array['manager hrd%']),
    ('aset_cabang', 4, 'menyetujui', 'Direktur I', 'Direksi', 'head_office', array['Direksi'], array['direktur i']),
    ('aset_cabang', 5, 'menyetujui', 'Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur utama']),

    ('non_aset_pusat', 1, 'membuat', 'Staff Departemen', null, 'head_office', array['HRD & GA', 'Keuangan & Akuntansi', 'Legal Lahan', 'Legal Proyek', 'Marketing', 'Marketing (Cabang)', 'Operasional Kost', 'Pengadaan', 'Pengembangan Bisnis', 'Pengembangan Organisasi', 'Perencanaan'], array['staff %']),
    ('non_aset_pusat', 2, 'memeriksa', 'Pimpinan Departemen', null, 'request_department', array['HRD & GA', 'Keuangan & Akuntansi', 'Legal Lahan', 'Legal Proyek', 'Marketing', 'Pengadaan', 'Pengembangan Bisnis', 'Pengembangan Organisasi', 'Perencanaan'], array['manager %']),
    ('non_aset_pusat', 3, 'memeriksa', 'Mgr. HRD GA', 'HRD & GA', 'head_office', array['HRD & GA'], array['manager hrd%']),
    ('non_aset_pusat', 4, 'menyetujui', 'Direktur I / Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur i', 'direktur utama']),

    ('non_aset_cabang', 1, 'membuat', 'Staff Admin', 'Umum & Keuangan (Cabang)', 'request_office', array['Umum & Keuangan (Cabang)'], array['staff admin%']),
    ('non_aset_cabang', 2, 'memeriksa', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('non_aset_cabang', 3, 'memeriksa', 'Mgr. HRD GA', 'HRD & GA', 'head_office', array['HRD & GA'], array['manager hrd%']),
    ('non_aset_cabang', 4, 'menyetujui', 'Direktur I / Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur i', 'direktur utama']),

    ('spion_inventaris', 1, 'membuat', 'Staff GA', 'HRD & GA', 'head_office', array['HRD & GA'], array['staff umum']),
    ('spion_inventaris', 2, 'memeriksa', 'Mgr. HRD GA', 'HRD & GA', 'head_office', array['HRD & GA'], array['manager hrd%']),
    ('spion_inventaris', 3, 'menyetujui', 'Direktur I', 'Direksi', 'head_office', array['Direksi'], array['direktur i']),

    ('pintu_kantor', 1, 'membuat', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('pintu_kantor', 2, 'memeriksa', 'Mgr. HRD GA', 'HRD & GA', 'head_office', array['HRD & GA'], array['manager hrd%']),
    ('pintu_kantor', 3, 'memeriksa', 'Mgr. Perencanaan', 'Perencanaan', 'head_office', array['Perencanaan'], array['manager perencanaan']),
    ('pintu_kantor', 4, 'menyetujui', 'Direktur I', 'Direksi', 'head_office', array['Direksi'], array['direktur i']),
    ('pintu_kantor', 5, 'menyetujui', 'Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur utama']),

    ('pelatihan_event', 1, 'membuat', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('pelatihan_event', 2, 'memeriksa', 'Mgr. HRD GA', 'HRD & GA', 'head_office', array['HRD & GA'], array['manager hrd%']),
    ('pelatihan_event', 3, 'memeriksa', 'Mgr. Terkait', null, 'head_office', array['HRD & GA', 'Keuangan & Akuntansi', 'Legal Lahan', 'Legal Proyek', 'Marketing', 'Pengadaan', 'Pengembangan Bisnis', 'Pengembangan Organisasi', 'Perencanaan'], array['manager %']),
    ('pelatihan_event', 4, 'menyetujui', 'Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur utama']),
    ('pelatihan_event', 5, 'menyetujui', 'Mgr. Keu', 'Keuangan & Akuntansi', 'head_office', array['Keuangan & Akuntansi'], array['manager keuangan%']),

    ('selamatan_cabang', 1, 'membuat', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('selamatan_cabang', 2, 'memeriksa', 'Mgr. HRD GA', 'HRD & GA', 'head_office', array['HRD & GA'], array['manager hrd%']),
    ('selamatan_cabang', 3, 'menyetujui', 'Direktur I', 'Direksi', 'head_office', array['Direksi'], array['direktur i']),
    ('selamatan_cabang', 4, 'menyetujui', 'Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur utama']),

    ('customer_gathering', 1, 'membuat', 'Staff Admin Umum', 'Umum & Keuangan (Cabang)', 'request_office', array['Umum & Keuangan (Cabang)'], array['staff admin umum%']),
    ('customer_gathering', 2, 'membuat', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('customer_gathering', 3, 'memeriksa', 'Mgr. Marketing', 'Marketing', 'head_office', array['Marketing'], array['manager marketing']),
    ('customer_gathering', 4, 'memeriksa', 'Mgr. Keuangan', 'Keuangan & Akuntansi', 'head_office', array['Keuangan & Akuntansi'], array['manager keuangan%']),
    ('customer_gathering', 5, 'menyetujui', 'Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur utama']),

    ('iklan_loker', 1, 'membuat', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('iklan_loker', 2, 'memeriksa', 'Mgr. HRD GA', 'HRD & GA', 'head_office', array['HRD & GA'], array['manager hrd%']),
    ('iklan_loker', 3, 'menyetujui', 'Mgr. Keu', 'Keuangan & Akuntansi', 'head_office', array['Keuangan & Akuntansi'], array['manager keuangan%']),
    ('iklan_loker', 4, 'menyetujui', 'Direktur I', 'Direksi', 'head_office', array['Direksi'], array['direktur i']),

    ('entertain_pusat', 1, 'membuat', 'Staff Departemen Terkait', null, 'head_office', array['HRD & GA', 'Keuangan & Akuntansi', 'Legal Lahan', 'Legal Proyek', 'Marketing', 'Marketing (Cabang)', 'Operasional Kost', 'Pengadaan', 'Pengembangan Bisnis', 'Pengembangan Organisasi', 'Perencanaan'], array['staff %']),
    ('entertain_pusat', 2, 'memeriksa', 'Mgr. Departemen Terkait', null, 'request_department', array['HRD & GA', 'Keuangan & Akuntansi', 'Legal Lahan', 'Legal Proyek', 'Marketing', 'Pengadaan', 'Pengembangan Bisnis', 'Pengembangan Organisasi', 'Perencanaan'], array['manager %']),
    ('entertain_pusat', 3, 'menyetujui', 'Mgr. Keu', 'Keuangan & Akuntansi', 'head_office', array['Keuangan & Akuntansi'], array['manager keuangan%']),
    ('entertain_pusat', 4, 'menyetujui', 'Direktur I / Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur i', 'direktur utama']),

    ('entertain_cabang', 1, 'membuat', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('entertain_cabang', 2, 'memeriksa', 'Mgr. Departemen Terkait', null, 'head_office', array['HRD & GA', 'Keuangan & Akuntansi', 'Legal Lahan', 'Legal Proyek', 'Marketing', 'Pengadaan', 'Pengembangan Bisnis', 'Pengembangan Organisasi', 'Perencanaan'], array['manager %']),
    ('entertain_cabang', 3, 'menyetujui', 'Mgr. Keu', 'Keuangan & Akuntansi', 'head_office', array['Keuangan & Akuntansi'], array['manager keuangan%']),
    ('entertain_cabang', 4, 'menyetujui', 'Direktur I / Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur i', 'direktur utama']),

    ('entertain_pln', 1, 'membuat', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('entertain_pln', 2, 'memeriksa', 'Mgr. Legal Lahan / Mgr. Legal Proyek', null, 'head_office', array['Legal Lahan', 'Legal Proyek'], array['manager legal lahan', 'manager legal proyek%', 'manager legal proyek & humas']),
    ('entertain_pln', 3, 'menyetujui', 'Mgr. Keu', 'Keuangan & Akuntansi', 'head_office', array['Keuangan & Akuntansi'], array['manager keuangan%']),

    ('parcel', 1, 'membuat', 'Staff GA', 'HRD & GA', 'head_office', array['HRD & GA'], array['staff umum']),
    ('parcel', 2, 'memeriksa', 'Mgr. HRD GA', 'HRD & GA', 'head_office', array['HRD & GA'], array['manager hrd%']),
    ('parcel', 3, 'memeriksa', 'Mgr. Legal Lahan / Mgr. Legal Proyek', null, 'head_office', array['Legal Lahan', 'Legal Proyek'], array['manager legal lahan', 'manager legal proyek%', 'manager legal proyek & humas']),
    ('parcel', 4, 'menyetujui', 'Direktur I', 'Direksi', 'head_office', array['Direksi'], array['direktur i']),

    ('kompensasi_saluran_air', 1, 'membuat', 'Branch Manager', 'Branch Manager', 'request_office', array['Branch Manager'], array['branch manager']),
    ('kompensasi_saluran_air', 2, 'memeriksa', 'Mgr. BD', 'Pengembangan Bisnis', 'head_office', array['Pengembangan Bisnis'], array['manager pengembangan bisnis']),
    ('kompensasi_saluran_air', 3, 'memeriksa', 'Mgr. Perencanaan', 'Perencanaan', 'head_office', array['Perencanaan'], array['manager perencanaan']),
    ('kompensasi_saluran_air', 4, 'menyetujui', 'Direktur Utama', 'Direksi', 'head_office', array['Direksi'], array['direktur utama']);

  for v_usage in select * from pg_temp.sigap_usage_seed order by sort_order
  loop
    select id into v_usage_id
    from public.form_usages
    where name = v_usage.name
    limit 1;

    if v_usage_id is null then
      insert into public.form_usages (name, description, form_id, request_category, scope_type, status, sort_order, updated_at)
      values (v_usage.name, v_usage.description, v_form_id, v_usage.request_category, v_usage.scope_type, 'active', v_usage.sort_order, now())
      returning id into v_usage_id;
    else
      update public.form_usages
      set description = v_usage.description,
          form_id = v_form_id,
          request_category = v_usage.request_category,
          scope_type = v_usage.scope_type,
          status = 'active',
          sort_order = v_usage.sort_order,
          updated_at = now()
      where id = v_usage_id;
    end if;

    delete from public.form_usage_departments where usage_id = v_usage_id;
    insert into public.form_usage_departments (usage_id, department_id)
    select v_usage_id, department.id
    from unnest(v_usage.allowed_department_names) as allowed(name)
    join public.master_departments department on department.name = allowed.name
    on conflict do nothing;

    delete from public.form_usage_steps where usage_id = v_usage_id;

    for v_step in
      select *
      from pg_temp.sigap_usage_step_seed
      where route_key = v_usage.route_key
      order by step_order
    loop
      insert into public.form_usage_steps (usage_id, step_order, role_name, label, signer_department_id, action_type, candidate_scope)
      select
        v_usage_id,
        v_step.step_order,
        v_step.role_name,
        v_step.label,
        department.id,
        'approval',
        v_step.candidate_scope
      from (select 1) seed
      left join public.master_departments department on department.name = v_step.signer_department_name
      returning id into v_step_id;

      insert into public.form_usage_step_users (usage_step_id, user_id)
      select distinct v_step_id, profile.id
      from public.profiles profile
      left join public.master_departments department on department.id = profile.department_id
      where coalesce(profile.is_active, true) = true
        and coalesce(cardinality(v_step.candidate_department_names), 0) > 0
        and department.name = any(v_step.candidate_department_names)
        and (
          coalesce(cardinality(v_step.job_patterns), 0) = 0
          or exists (
            select 1
            from unnest(v_step.job_patterns) pattern(value)
            where lower(coalesce(profile.job_title, '')) like lower(pattern.value)
          )
        )
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;
