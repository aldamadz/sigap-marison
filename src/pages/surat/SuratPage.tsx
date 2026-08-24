import { useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router";
import {
  CheckCircle2,
  History,
  Copy,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SuratForm } from "@/components/surat/SuratForm";
import { SuratStatusCard } from "@/components/surat/SuratStatusCard";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/Breadcrumbs"; 

export default function SuratPage() {
  const [generatedNo, setGeneratedNo] = useState<string | null>(null);
  const [judulDisplay, setJudulDisplay] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isRecommendationRoute = location.pathname === "/surat/rekomendasi/registrasi";
  const isLegacyRecommendationUrl =
    location.pathname === "/surat/registrasi" &&
    searchParams.get("linked_type") === "recommendation";

  if (isLegacyRecommendationUrl) {
    return <Navigate to={`/surat/rekomendasi/registrasi${location.search}`} replace />;
  }

  const handleCopyNoSurat = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      toast.success("Nomor surat tersalin ke clipboard");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast.error("Gagal menyalin nomor");
    }
  };

  const handleSuccess = (noSurat: string, judul: string) => {
    setGeneratedNo(noSurat);
    setJudulDisplay(judul);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="container mx-auto py-6 sm:py-8 px-4 max-w-6xl space-y-6">

      {/* Header Section with PageHeader */}
      <PageHeader
        title={isRecommendationRoute ? "Registrasi Rekomendasi" : "Registrasi Surat"}
        subtitle={isRecommendationRoute ? "Lengkapi dokumen rekomendasi berdasarkan pengajuan induk." : "Buat pengajuan baru dan pilih alur persetujuannya."}
      >
        <Button
          variant="outline"
          onClick={() => navigate(isRecommendationRoute ? "/surat/rekomendasi" : "/surat/monitoring")}
          className="gap-2"
        >
          <History className="w-4 h-4" />
          {isRecommendationRoute ? "Daftar Rekomendasi" : "Riwayat Pengajuan"}
        </Button>
      </PageHeader>

      {generatedNo && (
        <div className="animate-in slide-in-from-top-4 duration-500 space-y-4">
          <Alert className="bg-success/10 border-success/30 shadow-glow flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
              <div>
                <AlertTitle className="text-success font-black uppercase text-xs tracking-widest">Registrasi Berhasil</AlertTitle>
                <AlertDescription className="text-foreground/80 font-medium">
                  Dokumen telah diterbitkan dengan nomor resmi sistem.
                </AlertDescription>
              </div>
            </div>

            <div 
              onClick={() => handleCopyNoSurat(generatedNo)}
              className="flex items-center gap-2 bg-background/50 hover:bg-background border border-border p-2 rounded-lg cursor-pointer transition-all group active:scale-95"
            >
              <code className="text-xs font-bold text-primary px-2">{generatedNo}</code>
              <div className="border-l pl-2 border-border">
                {isCopied ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                )}
              </div>
            </div>
          </Alert>
          
          <SuratStatusCard 
            noSurat={generatedNo} 
            judul={judulDisplay} 
            tanggal={new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} 
          />
        </div>
      )}

      <div>
        <SuratForm
          onSuccess={handleSuccess}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
          setJudulForDisplay={setJudulDisplay}
        />
      </div>
    </div>
  );
}
