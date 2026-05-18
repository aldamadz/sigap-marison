import React, { useEffect, useState } from 'react';
import { X, Loader2, Download, FileText } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';

interface PreviewModalProps {
  isOpen: boolean;
  fileUrl: string;
  onClose: () => void;
}

export const PreviewModal = ({ isOpen, fileUrl, onClose }: PreviewModalProps) => {

  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);

  // Extract actual file URL dari Office Viewer URL
  const rawSrc = fileUrl?.split('src=')[1]?.split('&')[0];
  const actualFileUrl = rawSrc ? decodeURIComponent(rawSrc) : fileUrl;
  const extension = actualFileUrl?.split('.').pop()?.toLowerCase()?.split('?')[0];

  const isImage = ['png','jpg','jpeg','webp','gif','svg'].includes(extension || '');
  const isVideo = ['mp4','webm','ogg','mov'].includes(extension || '');
  const isAudio = ['mp3','wav','ogg','m4a'].includes(extension || '');
  const isText  = ['xml','json','txt','log','csv'].includes(extension || '');
  const isExcel = ['xlsx','xls'].includes(extension || '');

  useEffect(() => {
    if (!isOpen) return;        // ← aman, hook tetap dipanggil
    if (!isText) {
      setTextContent(null);
      return;
    }

    setLoadingText(true);
    fetch(fileUrl)
      .then(r => r.text())
      .then(t => setTextContent(t))
      .catch(() => setTextContent("Failed to load file"))
      .finally(()=>setLoadingText(false));

  }, [fileUrl, isText, isOpen]);

  const openOfficePrintView = () => {
    const printWindow = window.open(
      fileUrl.replace('wdPrint=0', 'wdPrint=1'),
      '_blank',
      'width=1200,height=800'
    );
    if (printWindow) {
      setTimeout(() => {
        try {
          printWindow.print();
        } catch {
          // User can still print manually in opened tab
        }
      }, 3000);
    }
  };

  const handleDownload = async (asPdf = false) => {
    // Extract file name tanpa extension
    const urlParts = actualFileUrl.split('/');
    const fullFileName = urlParts[urlParts.length - 1]?.split('?')[0] || 'Document_Export';
    // Jika Excel dan user minta PDF
    if (asPdf && isExcel) {
      toast.info('Membuka print view, pilih Save as PDF untuk unduh.', { duration: 3000 });
      openOfficePrintView();
      return;
    }

    // Download normal (untuk non-Excel atau download asli)
    const link = document.createElement('a');
    link.href = actualFileUrl;
    link.download = fullFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderPreview = () => {

    if (isImage) return <img src={fileUrl} className="max-h-full max-w-full object-contain mx-auto" />;

    if (isVideo) return <video src={fileUrl} controls className="w-full h-full bg-black" />;

    if (isAudio) return (
      <div className="flex items-center justify-center h-full">
        <audio src={fileUrl} controls className="w-[90%]" />
      </div>
    );

    if (isText) {
      if (loadingText) {
        return (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-primary/30"/>
          </div>
        );
      }
      return (
        <pre className="p-6 text-sm overflow-auto h-full bg-slate-50 whitespace-pre-wrap">
          {textContent}
        </pre>
      );
    }

    return <iframe src={fileUrl} className="w-full h-full border-none" />;
  };

  // ✅ return null DI SINI (setelah hooks)
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-6xl h-[92vh] bg-card border border-border rounded-lg overflow-hidden flex flex-col shadow-2xl">

        <div className="flex justify-between items-center px-5 py-3 border-b border-border bg-[#020617]">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white">
            Document Preview
          </h3>

          <div className="flex items-center gap-2">
             {isExcel && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => handleDownload(true)}
                className="text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
              >
                <FileText size={14} className="mr-1"/>
                Download PDF
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleDownload(false)}
            >
              <Download size={14}/> Download {isExcel ? 'XLSX' : ''}
            </Button>

            <Button variant="ghost" size="icon" onClick={onClose}>
              <X size={18}/>
            </Button>
          </div>
        </div>

        <div className="flex-1 bg-white relative overflow-auto flex items-center justify-center">
          {renderPreview()}
        </div>

      </div>
    </div>
  );
};
