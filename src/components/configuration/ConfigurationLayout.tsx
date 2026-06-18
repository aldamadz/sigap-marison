import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { BriefcaseBusiness, FileSpreadsheet, GitMerge, Hash, Mail, Route, Timer } from "lucide-react";
import { PageHeader } from "@/components/ui/Breadcrumbs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const configurationOptions = [
  {
    value: "/admin/configuration/forms",
    label: "Form & Template",
    description: "Template Excel, mapping input, unit, dan lampiran.",
    icon: FileSpreadsheet,
  },
  {
    value: "/admin/configuration/workflows",
    label: "Dokumentasi Matrix Lama",
    description: "Referensi read-only untuk menduplikasi konfigurasi lama ke Kegunaan Form.",
    icon: GitMerge,
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
    <div className="space-y-6">
      <PageHeader
        title="Configuration"
        subtitle="Kelola aturan sistem tanpa mencampurnya dengan master data operasional."
      >
        <Select value={selected.value} onValueChange={navigate}>
          <SelectTrigger className="h-10 w-full sm:w-[260px] bg-card">
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

      <div className="flex items-start gap-3 border-y border-border bg-muted/30 px-4 py-3">
        <SelectedIcon className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">{selected.label}</h2>
          <p className="text-xs text-muted-foreground">{selected.description}</p>
        </div>
      </div>

      <Outlet />
    </div>
  );
}
