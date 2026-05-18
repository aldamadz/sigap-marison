# KPI Server Pengembangan, Database, dan Media Storage

Tanggal penyusunan: 2026-05-18  
Zona waktu operasional: Asia/Jakarta  
Peran server: host Proxmox untuk pengembangan sistem, database, media penyimpanan, backup, dan layanan pendukung.

## 1. Baseline Server Saat Ini

| Komponen | Nilai awal |
|---|---:|
| OS | Debian GNU/Linux 13 (trixie) |
| Platform | Proxmox VE 9.1.1, kernel 6.17.2-1-pve |
| CPU | 40 vCPU |
| RAM | 31 GiB total, 21 GiB available saat pengecekan |
| Swap | 8 GiB, hampir tidak terpakai |
| Root filesystem | 94G total, 5.3G used, 84G available, 6% used |
| Inode root | 6.0M total, 72K used, 2% used |
| Uptime saat baseline | 6 jam 22 menit |
| Proxmox storage aktif | `local` di `/var/lib/vz`, `local-lvm` untuk `images,rootdir` |
| VM/CT terdaftar | Belum ada konfigurasi VM/CT terbaca di `/etc/pve/qemu-server` dan `/etc/pve/lxc` |
| Catatan storage fisik | Ada disk `sda1` bertanda `zfs_member` label `MARIS`, tetapi status ZFS perlu dicek langsung di host |

Catatan akses: beberapa perintah host-level seperti system bus, netlink, LVM locking, dan ZFS tidak bisa dibaca dari sesi sandbox ini. KPI tetap dibuat, tetapi metrik tersebut perlu diverifikasi dari shell host penuh atau panel Proxmox.

## 2. Prinsip Operasional

1. Host Proxmox dipakai sebagai lapisan infrastruktur, bukan tempat menjalankan aplikasi langsung.
2. Workload dipisah minimal menjadi VM/CT untuk development, database, media storage, monitoring, dan backup.
3. Database produksi atau data penting tidak diletakkan di storage tanpa backup terjadwal dan uji restore.
4. Media storage dipantau berdasarkan kapasitas, inode, checksum/health disk, dan throughput.
5. Semua KPI harus punya target, ambang alert, pemilik, dan tindakan korektif.

## 3. KPI Utama

| Area | KPI | Target | Warning | Critical | Frekuensi ukur | Sumber ukur |
|---|---|---:|---:|---:|---|---|
| Availability | Uptime host Proxmox | >= 99.5% per bulan | < 99.5% | < 99.0% | 1 menit | Proxmox, node exporter |
| Availability | VM/CT penting aktif | 100% sesuai jadwal layanan | Ada 1 service down > 5 menit | DB/media/backup down > 15 menit | 1 menit | Proxmox, service monitor |
| CPU | Rata-rata CPU host | < 65% | >= 75% selama 15 menit | >= 90% selama 10 menit | 1 menit | node exporter |
| CPU | Load average per vCPU | < 0.70 | >= 0.85 | >= 1.00 | 1 menit | node exporter |
| RAM | RAM available host | > 25% | <= 20% | <= 10% | 1 menit | node exporter |
| RAM | Swap usage | < 5% | >= 10% | >= 25% | 1 menit | node exporter |
| Disk | Pemakaian root `/` | < 70% | >= 75% | >= 85% | 5 menit | node exporter |
| Disk | Pemakaian inode root | < 70% | >= 75% | >= 85% | 5 menit | node exporter |
| Storage | Pemakaian pool/data storage | < 70% | >= 75% | >= 85% | 5 menit | Proxmox/ZFS/LVM metrics |
| Storage | Health disk/pool | 0 error | Ada warning SMART/ZFS | Pool degraded/disk failed | 5 menit + harian | smartctl, zpool, Proxmox |
| Database | Ketersediaan DB | >= 99.5% per bulan | Down > 5 menit | Down > 15 menit | 1 menit | DB exporter, healthcheck |
| Database | Backup database berhasil | 100% job harian | 1 job gagal | 2 job berturut-turut gagal | Harian | backup logs |
| Database | Uji restore database | 1x per bulan berhasil | Belum diuji bulan berjalan | Gagal restore | Bulanan | restore drill |
| Media | Integritas file media | 100% sampling lolos | Ada checksum mismatch | Data hilang/korup | Mingguan | checksum/audit job |
| Media | Pertumbuhan storage | Tersedia proyeksi 90 hari | Kapasitas < 60 hari | Kapasitas < 30 hari | Mingguan | Grafana/capacity report |
| Backup | Backup VM/CT penting | 100% sesuai jadwal | 1 backup gagal | 2 backup berturut-turut gagal | Harian | Proxmox backup/vzdump/PBS |
| Backup | Retention backup | Harian 7, mingguan 4, bulanan 6 | Retention kurang | Tidak ada backup valid | Mingguan | backup repository |
| Security | Patch keamanan | <= 14 hari setelah rilis stabil | > 14 hari | > 30 hari | Mingguan | apt, Proxmox updates |
| Security | Login SSH root langsung | Disabled atau dibatasi key/IP | Masih aktif tapi key-only | Password login root aktif | Mingguan | sshd config audit |
| Security | Firewall host/VM | Rule eksplisit aktif | Ada port tidak terdokumentasi | Service publik tidak aman | Mingguan | Proxmox firewall, ss/nmap |
| Observability | Coverage monitoring | 100% host + VM/CT penting | Ada 1 node belum dipantau | DB/backup tidak dipantau | Mingguan | Prometheus targets |
| Incident | MTTA | <= 10 menit | > 15 menit | > 30 menit | Per insiden | alert log |
| Incident | MTTR P1 | <= 4 jam | > 4 jam | > 8 jam | Per insiden | incident log |

## 4. KPI Per Fungsi

### 4.1 Host dan Virtualisasi

| KPI | Target operasional | Tindakan jika gagal |
|---|---|---|
| Host tidak menjalankan aplikasi langsung | 0 aplikasi bisnis berjalan di host | Pindahkan ke VM/CT terpisah |
| Overcommit CPU terkendali | Rasio vCPU allocated <= 3:1 untuk dev, <= 2:1 untuk DB | Review alokasi VM/CT |
| Overcommit RAM terkendali | RAM allocated <= 80% fisik untuk workload penting | Kurangi alokasi atau tambah RAM |
| Snapshot VM/CT | Snapshot hanya sementara, umur <= 7 hari | Hapus/merge snapshot lama |
| Template VM/CT | Minimal 1 template Linux standar tersedia | Buat template base dengan hardening |

### 4.2 Development System

| KPI | Target operasional | Tindakan jika gagal |
|---|---|---|
| Environment terpisah | Dev, staging, dan production tidak bercampur | Pisahkan network/VM/container |
| Build/deploy success rate | >= 95% per bulan | Audit pipeline, dependency, resource |
| Waktu provisioning environment | <= 30 menit untuk VM/CT standar | Buat template dan dokumentasi |
| Resource limit per proyek | CPU/RAM/disk quota terdokumentasi | Terapkan limit di Proxmox |
| Repository dan artifact backup | 100% repo penting punya remote backup | Tambah remote mirror/backup |

### 4.3 Database

| KPI | Target operasional | Tindakan jika gagal |
|---|---|---|
| Database berjalan di VM/CT khusus | 100% DB penting terisolasi | Migrasi dari host/shared VM |
| Backup logical | Minimal 1x per hari | Perbaiki cron/job backup |
| Backup physical/snapshot | Minimal 1x per hari untuk DB besar | Integrasikan Proxmox Backup Server atau tool setara |
| Restore drill | 1x per bulan | Jadwalkan uji restore ke VM terpisah |
| Query latency p95 | Sesuai aplikasi, awal target < 250 ms | Review index, query, resource |
| Koneksi DB | < 80% max connection | Pooling atau naikkan limit terukur |
| Replication lag, jika ada | < 60 detik | Cek network, disk IO, konfigurasi replica |

### 4.4 Media Storage

| KPI | Target operasional | Tindakan jika gagal |
|---|---|---|
| Storage media tidak bercampur root OS | 100% media di volume/pool khusus | Buat mountpoint/pool terpisah |
| Free capacity | Minimal 25% free | Arsipkan, tambah disk, atau pindahkan data |
| File integrity | Checksum sampling mingguan lolos 100% | Isolasi file rusak, restore dari backup |
| Duplicate/unused media | Audit minimal bulanan | Deduplicate/cleanup sesuai policy |
| Struktur folder dan ownership | 100% sesuai standar | Jalankan audit permission |
| Throughput storage | Cukup untuk beban aplikasi, baseline perlu dibuat | Jalankan benchmark `fio` terkontrol |

### 4.5 Backup dan Disaster Recovery

| KPI | Target operasional | Tindakan jika gagal |
|---|---|---|
| Backup host config Proxmox | Harian untuk `/etc/pve` dan konfigurasi penting | Tambah job backup konfigurasi |
| Backup VM/CT | Harian untuk penting, mingguan untuk non-kritis | Atur job backup di Proxmox/PBS |
| Backup database | Harian + retention sesuai jenis data | Perbaiki job dan validasi dump |
| Offsite backup | Minimal 1 salinan di luar server | Sinkron ke storage/cloud/offsite |
| RPO layanan penting | <= 24 jam | Tambah frekuensi backup |
| RTO layanan penting | <= 4 jam | Buat runbook restore |
| Restore test | Bulanan | Wajib sebelum data dianggap terlindungi |

### 4.6 Keamanan

| KPI | Target operasional | Tindakan jika gagal |
|---|---|---|
| SSH password login | Disabled | Ubah `PasswordAuthentication no` |
| Root SSH langsung | Disabled atau dibatasi IP dan key | Buat user admin + sudo |
| MFA panel Proxmox | Aktif untuk akun admin | Aktifkan TOTP/WebAuthn |
| Port publik | Hanya port yang terdokumentasi | Tutup firewall |
| Patch OS/Proxmox | Review mingguan, apply terjadwal | Buat maintenance window |
| Audit user | Bulanan | Hapus user tidak aktif |
| Secret management | Tidak ada password di repo/plaintext | Pindah ke secret manager/file terenkripsi |

## 5. Target SLA/SLO Awal

| Kategori layanan | SLO availability | RPO | RTO | Prioritas |
|---|---:|---:|---:|---|
| Host Proxmox | 99.5% | 24 jam untuk config | 4 jam | P0 |
| Database utama | 99.5% | 24 jam | 4 jam | P0 |
| Media storage aktif | 99.0% | 24 jam | 8 jam | P1 |
| Development environment | 98.0% | 24 jam | 1 hari kerja | P2 |
| Monitoring dan alerting | 99.0% | 24 jam | 4 jam | P1 |
| Backup repository | 99.0% | Tidak berlaku | 8 jam | P1 |

## 6. Standar Alert

| Severity | Kondisi | Respons |
|---|---|---|
| P0 | Host down, DB down, storage degraded, backup kritis hilang | Respons <= 10 menit, update status tiap 30 menit |
| P1 | Disk >= 85%, RAM available <= 10%, backup gagal 2x, latency DB parah | Respons <= 30 menit, perbaikan hari yang sama |
| P2 | Disk >= 75%, patch tertunda, monitoring target hilang | Respons <= 1 hari kerja |
| P3 | Optimasi kapasitas, cleanup, dokumentasi | Masuk backlog operasional |

## 7. Rekomendasi Monitoring

Minimal stack:

1. Prometheus untuk metrik.
2. Grafana untuk dashboard.
3. Alertmanager untuk notifikasi.
4. Node Exporter untuk host dan VM/CT.
5. Proxmox exporter untuk status VM/CT dan storage.
6. PostgreSQL/MySQL exporter sesuai database yang dipakai.
7. SMART monitoring untuk disk fisik.
8. Backup log monitoring untuk Proxmox Backup Server, vzdump, restic, Borg, atau tool yang dipilih.

Dashboard wajib:

1. Host overview: CPU, RAM, swap, load, disk, inode, network.
2. Proxmox overview: VM/CT status, storage usage, backup result.
3. Database overview: availability, connection, latency, slow query, replication.
4. Media storage overview: capacity, growth, inode, throughput, integrity job.
5. Backup overview: last success, retention, restore drill status.
6. Security overview: update pending, login audit, exposed ports.

## 8. Checklist Implementasi 30 Hari

| Minggu | Fokus | Output |
|---|---|---|
| 1 | Inventaris dan baseline | Daftar VM/CT, storage map, network map, owner layanan |
| 1 | Monitoring dasar | Prometheus/Grafana/Alertmanager aktif |
| 2 | Backup | Job backup VM/CT, database, `/etc/pve`, dan offsite |
| 2 | Security hardening | SSH key-only, firewall, MFA Proxmox, user audit |
| 3 | Storage | Pisahkan media storage dari root OS, capacity dashboard |
| 3 | Database | DB di VM/CT khusus, backup dan restore drill pertama |
| 4 | Runbook | Runbook incident, restore, patching, onboarding proyek |
| 4 | Review KPI | KPI disesuaikan dari data real 30 hari |

## 9. Checklist Harian, Mingguan, Bulanan

Harian:

1. Cek alert P0/P1.
2. Cek hasil backup terakhir.
3. Cek disk root, storage data, dan DB.
4. Cek status VM/CT penting.

Mingguan:

1. Review kapasitas 30/60/90 hari.
2. Review update OS/Proxmox.
3. Audit port/service terbuka.
4. Cek health disk dan storage pool.
5. Review slow query database.

Bulanan:

1. Uji restore database.
2. Uji restore 1 VM/CT sample.
3. Review user dan akses.
4. Review biaya/kapasitas storage.
5. Update KPI target berdasarkan tren.

## 10. Data yang Perlu Diverifikasi Langsung di Host

Jalankan dari shell host penuh, bukan sandbox terbatas:

```bash
hostnamectl
ip -br addr
pvesm status
qm list
pct list
zpool status
zpool list
pvs
vgs
lvs
smartctl -a /dev/sda
```

Hasil verifikasi tersebut sebaiknya ditambahkan ke bagian baseline sebelum KPI dipakai sebagai acuan resmi.
