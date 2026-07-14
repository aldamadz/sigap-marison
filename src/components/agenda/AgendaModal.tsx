import { useState, useEffect } from 'react';
import { format, isValid } from 'date-fns';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription // Tambahkan import ini
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Agenda, AgendaStatus } from '@/types/agenda';

interface AgendaModalProps {
  isOpen: boolean;
  onClose: () => void;
  agenda?: Agenda | null;
  prefilledDate?: Date | null;
  onSave: (data: Partial<Agenda>) => void;
  isLoading?: boolean;
}

export const AgendaModal = ({ 
  isOpen, 
  onClose, 
  agenda, 
  prefilledDate, 
  onSave,
  isLoading = false 
}: AgendaModalProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<AgendaStatus>('Scheduled');

  // Format helper khusus untuk input datetime-local (HTML5)
  const formatForInput = (dateInput: any) => {
    if (!dateInput) return "";
    const d = new Date(dateInput);
    return isValid(d) ? format(d, "yyyy-MM-dd'T'HH:mm") : "";
  };

  useEffect(() => {
    if (isOpen) {
      if (agenda) {
        setTitle(agenda.title);
        setDescription(agenda.description || '');
        setStatus(agenda.status);
        setStartDate(formatForInput(agenda.startTime));
        setEndDate(formatForInput(agenda.endTime));
      } else {
        setTitle('');
        setDescription('');
        setStatus('Scheduled');
        
        const start = prefilledDate || new Date();
        const end = new Date(start.getTime() + 60 * 60 * 1000); // Default +1 jam

        setStartDate(formatForInput(start));
        setEndDate(formatForInput(end));
      }
    }
  }, [agenda, isOpen, prefilledDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onSave({
      title,
      description,
      startTime: startDate, 
      endTime: endDate,
      status,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="border-border bg-card p-4 [&>button]:h-11 [&>button]:w-11 sm:max-w-[500px] sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">
            {agenda ? 'Edit Agenda' : 'Create New Agenda'}
          </DialogTitle>
          {/* Deskripsi Tersembunyi untuk Aksesibilitas agar Warning Console Hilang */}
          <DialogDescription className="sr-only">
            Isi detail informasi agenda seperti judul, deskripsi, dan waktu pelaksanaan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4 sm:mt-4 sm:space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter agenda title"
              className="min-h-11 border-none bg-muted sm:min-h-10"
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter agenda description"
              className="bg-muted border-none min-h-[100px]"
              disabled={isLoading}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Time</Label>
              <Input
                id="startDate"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="min-h-11 border-none bg-muted sm:min-h-10"
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Time</Label>
              <Input
                id="endDate"
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="min-h-11 border-none bg-muted sm:min-h-10"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select 
              value={status} 
              onValueChange={(v) => setStatus(v as AgendaStatus)}
              disabled={isLoading}
            >
              <SelectTrigger className="h-11 w-full border-none bg-muted sm:h-10">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Scheduled">Scheduled</SelectItem>
                <SelectItem value="Ongoing">Ongoing</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border/50 pt-4 sm:flex-row sm:justify-end sm:gap-3">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={onClose}
              disabled={isLoading}
              className="h-11 w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {agenda ? 'Save Changes' : 'Create Agenda'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};