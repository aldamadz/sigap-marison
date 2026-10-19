import { Outlet, useLocation, useNavigate } from "react-router";
import { BriefcaseBusiness, Hash, Mail, Route, Timer, Server, ShieldCheck, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/ui/Breadcrumbs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const configurationOptions = [
  {value:'/admin/configuration/maintenance',label:'Pemeliharaan Sistem',description:'Jadwal pembaruan, dampak layanan, dan pemberitahuan pengguna.',icon:CalendarClock},
  {
    value: "/admin/configuration/access",
    label: "Hak Akses",
    description: "Kantor pengajuan yang diizinkan untuk setiap pengguna.",
    icon: ShieldCheck,
  },
  {
    value: "/admin/configuration/integration",
    label: "Integration",
    description: "Konfigurasi dan pengujian koneksi integrasi Marison.",
    icon: Server,
  },
  {
    value: "/admin/configuration/form-usages",
    label: "Kegunaan Form",
    description: "Kategori, departemen, 2-8 signer, dan lampiran setiap penggunaan form.",
    icon: Route,
  },
  {
    value: "/admin/configuration/kpi",
    label: "SLA Departemen",
    description: "Jam kerja, istirahat, hari kerja, dan target SLA.",
    icon: Timer,
  },
  {
    value: "/admin/configuration/numbering",
    label: "Penomoran Surat",
    description: "Counter awal per tahun, departemen pusat, atau proyek cabang.",
    icon: Hash,
  },
  {
    value: "/admin/configuration/job-title-labels",
    label: "Label Jabatan",
    description: "Alias jabatan yang ditampilkan pada dokumen tanda tangan.",
    icon: BriefcaseBusiness,
  },
  {
    value: "/admin/configuration/email",
    label: "Email Notification",
    description: "Penerima email, privasi, link aman, dan attachment.",
    icon: Mail,
  },
];

export default function ConfigurationLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const selected =
    configurationOptions.find((option) => location.pathname.startsWith(option.value)) ??
    configurationOptions[0];
  const SelectedIcon = selected.icon;

  return (
    <div className="sigap-page">
      <PageHeader
        title="Konfigurasi"
        subtitle="Kelola aturan sistem tanpa mencampurnya dengan master data operasional."
      >
        <Select value={selected.value} onValueChange={navigate}>
          <SelectTrigger className="h-10 w-full sm:w-[300px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {configurationOptions.map((option) => {
              const Icon = option.icon;
              return (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {option.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="flex items-start gap-3 px-1 py-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <SelectedIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="sigap-section-title">{selected.label}</h2>
          <p className="sigap-section-description mt-1">{selected.description}</p>
        </div>
      </div>

      <Outlet />
    </div>
  );
}
