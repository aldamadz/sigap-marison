# SIGAP Design System

## Arah Visual

SIGAP memakai arah **Enterprise Marison**: bersih, tenang, tidak ramai, dan dibuat untuk pekerjaan operasional harian. UI harus membantu pengguna membaca antrean, mengisi form, mengecek dokumen, dan mengambil tindakan tanpa merasa sedang berada di dashboard dekoratif.

## Prinsip

- **Marison line**: aksen hijau digunakan sebagai garis struktur, active state, status utama, dan penanda prioritas. Hindari dekorasi hijau berlebihan.
- **Bersih tetapi tidak kosong**: layout seimbang, cukup lega untuk dibaca, tetap padat untuk pekerjaan admin.
- **Bahasa kerja**: label dan aksi memakai Bahasa Indonesia yang jelas, bukan istilah teknis database.
- **Tidak ramai**: hindari gradient besar, glow kuat, card bertumpuk, uppercase berlebihan, dan shadow dramatis.
- **Mobile tetap kerja**: touch target minimal 44px, scroll jelas, action penting tetap mudah dijangkau.

## Token Utama

- Primary: hijau Marison `hsl(126 55% 39%)`
- Background light: abu sangat muda `hsl(210 20% 97%)`
- Surface: putih / card
- Text utama: slate gelap `hsl(220 31% 11%)`
- Border: abu lembut `hsl(214 18% 86%)`
- Radius: `0.75rem` global, tetapi komponen kerja memakai radius sedang.

## Typography

- Font utama: Inter.
- Body default: 14px, line-height 1.5.
- Heading tidak terlalu besar; gunakan bobot 600, bukan 800/900 kecuali kebutuhan brand.
- Hindari uppercase untuk paragraf, nama user, jabatan, dan navigasi.
- Ukuran kecil boleh 12-13px hanya untuk metadata atau label pendukung.

## Komponen

- Button: tinggi minimal 40px, mobile touch target minimal 44px.
- Card/panel: border jelas, shadow halus, tidak nested jika tidak perlu.
- Table: header tenang, row padat namun readable.
- Form: label terlihat, helper text seperlunya, input 40px, textarea minimal 88px.
- Dialog: scrollable, tidak menutup layar secara kaku, scrim cukup jelas.

## Prioritas Refactor

1. Shell global, sidebar, header, card, table, form control.
2. Inbox approval dan registrasi surat.
3. Configuration admin.
4. Dashboard, monitoring, riwayat, agenda, kalender, users, hierarchy, settings.

## Hal Yang Harus Dihindari

- UI yang terlalu penuh dengan shadow, glow, dan gradient.
- Font terlalu kecil di form atau tabel.
- Banyak teks uppercase yang membuat halaman terasa bising.
- Panel bertumpuk di dalam panel.
- Action penting yang hanya muncul setelah scroll jauh.
- State kosong/error tanpa arahan jelas.

## Struktur Halaman

- Gunakan `sigap-page` sebagai ritme vertikal halaman dan batas lebar konten utama.
- Gunakan `sigap-panel sigap-panel-accent` untuk header halaman yang membutuhkan identitas Marison.
- Judul halaman desktop cukup 20-24px dengan bobot 600; deskripsi memakai satu kalimat kerja singkat.
- Garis aksen hanya digunakan pada header halaman utama. Judul submenu, section, dan halaman konfigurasi tidak memakai garis dekoratif.
- Filter, tabel, dan ringkasan merupakan bagian halaman sejajar, bukan panel dekoratif yang saling membungkus.
- Label tabel dan formulir memakai sentence case, minimal 12px, serta tidak memakai tracking lebar.

## Cakupan Refactor Berjalan

- Shell aplikasi, sidebar, header, komponen dasar, serta tema light/dark.
- Dashboard, inbox approval, registrasi surat, monitoring pengguna, dan monitoring admin.
- SLA Departemen, Riwayat Keterlibatan, Audit Log, Master Proyek, dan Manajemen Karyawan.
- Agenda dan kalender.
- Halaman konfigurasi memakai shell konfigurasi bersama; isi konfigurasi teknis direfaktor bertahap tanpa mengubah kontrak data.
