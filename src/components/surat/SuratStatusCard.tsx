import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, CheckCircle2, FileText, Calendar, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface SuratStatusCardProps {
  noSurat: string;
  judul: string;
  tanggal: string;
}

export function SuratStatusCard({ noSurat, judul, tanggal }: SuratStatusCardProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(noSurat);
    setCopied(true);
    
    toast({
      title: "Berhasil disalin",
      description: "Nomor surat telah disalin ke papan klip.",
    });

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <Card className="overflow-hidden border-2 border-primary/20 bg-card shadow-sm animate-in zoom-in-95 duration-300">
      <CardContent className="p-6">
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-[10px] font-extrabold text-muted-foreground flex items-center gap-2 uppercase tracking-wider not-italic">
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                Nomor Surat Terbit
              </p>
              <h3 className="text-2xl font-black tracking-tight text-primary font-mono bg-primary/5 px-2 py-1 rounded-md not-italic">
                {noSurat}
              </h3>
            </div>

            {/* BADGE AKTIF: Menggunakan variabel --primary sistem Anda */}
            <Badge 
              className="bg-primary text-primary-foreground border-none px-3 py-1 text-[10px] font-black uppercase tracking-wider shadow-glow not-italic"
            >
              Aktif
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-3 py-4 border-y border-border">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-border shrink-0">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <span className="font-bold text-foreground/90 line-clamp-1 not-italic">
                {judul}
              </span>
            </div>
            
            <div className="flex items-center gap-3 text-xs text-muted-foreground not-italic">
              <Calendar className="w-4 h-4 ml-2" />
              <span className="font-medium uppercase tracking-tight">
                Diterbitkan: <b className="text-foreground font-bold">{tanggal}</b>
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyToClipboard}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl border py-3.5 text-[11px] font-bold uppercase tracking-[0.2em] shadow-[var(--shadow-card)] transition-all duration-300 active:scale-[0.98] not-italic ${
                copied
                ? "border-success bg-success text-success-foreground"
                : "border-primary/35 bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[var(--shadow-glow)]"
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 animate-in fade-in zoom-in duration-300" />
                  Tersalin
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Salin Nomor Resmi
                </>
              )}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}