import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  History,
  Info,
  FilePlus,
  ArrowRightCircle,
  ShieldCheck,
  Stamp,
  Send,
  AlertCircle,
  Copy,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        title="Registrasi Surat"
        subtitle="Alokasi nomor otomatis & inisiasi alur persetujuan digital Marison Group"
      >
        <Button
          variant="outline"
          onClick={() => navigate("/surat/monitoring")}
          className="gap-2"
        >
          <History className="w-4 h-4" />
          Monitoring Registrasi
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3">
          <SuratForm 
            onSuccess={handleSuccess} 
            isLoading={isLoading} 
            setIsLoading={setIsLoading} 
            setJudulForDisplay={setJudulDisplay}
          />
        </div>

<div className="space-y-6">
  <Card className="border overflow-hidden">
    <CardHeader className="bg-secondary/50 pb-4 border-b">
      <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
        <Info className="w-4 h-4" /> Prosedur Dokumen Excel
      </CardTitle>
    </CardHeader>
    <CardContent className="pt-6 px-5 space-y-6">

      <div className="space-y-6 relative before:absolute before:inset-0 before:left-[11px] before:border-l-2 before:border-muted before:my-2">
        {/* STEP 1 */}
        <div className="relative pl-8 group">
          <div className="absolute left-0 top-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center border-2 border-background">
            <FilePlus className="w-3 h-3 text-primary" />
          </div>
          <h4 className="text-sm font-semibold text-foreground">1. Input by Sistem</h4>
          <p className="text-sm text-muted-foreground leading-relaxed mt-1">
            Isi tempat, tanggal, dan detail dokumen langsung di aplikasi. Template Excel diisi otomatis oleh sistem.
          </p>
        </div>

        {/* STEP 2 */}
        <div className="relative pl-8 group">
          <div className="absolute left-0 top-0 w-6 h-6 bg-warning/10 rounded-full flex items-center justify-center border-2 border-background">
            <ShieldCheck className="w-3 h-3 text-warning" />
          </div>
          <h4 className="text-sm font-semibold text-foreground">2. Verifikasi Berjenjang</h4>
          <p className="text-sm text-muted-foreground leading-relaxed mt-1">
            Persetujuan dilakukan secara digital oleh pejabat terkait sesuai alur Matrix Approval.
          </p>
        </div>

        {/* STEP 3 */}
        <div className="relative pl-8 group">
          <div className="absolute left-0 top-0 w-6 h-6 bg-success/10 rounded-full flex items-center justify-center border-2 border-background">
            <Stamp className="w-3 h-3 text-success" />
          </div>
          <h4 className="text-sm font-semibold text-foreground">3. Digital Stamping</h4>
          <p className="text-sm text-muted-foreground leading-relaxed mt-1">
            Sistem otomatis membubuhkan nomor surat, data user, NIK, lokasi, dan stempel digital langsung ke file Excel.
          </p>
        </div>
      </div>

      {/* FOOTER NOTE */}
      <div className="pt-4 border-t">
        <div className="p-3 bg-primary/5 rounded-xl border border-primary/20 flex gap-3 items-start">
          <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-primary font-medium leading-relaxed">
            File proses tetap <span className="font-semibold">.xlsx</span>. PDF dibuat otomatis saat dokumen dibuka dari progress/preview.
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
</div>
      </div>
    </div>
  );
}
