import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAppDialog } from '@/components/app/AppDialogProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  marisonPayloadMappingService,
  type MarisonMappingCatalog,
  type MarisonMappingEntity,
  type MarisonPayloadMapping,
} from '@/services/marison-payload-mapping.service';

type Props = {
  entityType: MarisonMappingEntity;
  recordId: string;
  source: string | number | null | undefined;
  override: MarisonPayloadMapping | null;
  field: 'nik' | 'branch' | 'project';
  onChanged: (override: MarisonPayloadMapping | null) => void;
  catalog?: MarisonMappingCatalog[];
  sourceValid: boolean;
  mappingValid: boolean;
  effectiveBranchId?: number | null;
};

export function MarisonPayloadMappingCell({
  entityType,
  recordId,
  source,
  override,
  field,
  onChanged,
  catalog = [],
  sourceValid,
  mappingValid,
  effectiveBranchId,
}: Props) {
  const appDialog = useAppDialog();
  const [value, setValue] = useState(override?.target_record_id || '');
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState('');
  const [remoteCatalog, setRemoteCatalog] = useState<MarisonMappingCatalog[]>(catalog);
  const selected = remoteCatalog.find((item) => item.id === value);
  const mappedPayloadValue = field === 'nik'
    ? selected?.nik ?? override?.mapped_nik
    : selected?.external_id ?? override?.mapped_external_id;
  const effective = override && !mappingValid
    ? 'Perlu koreksi relasi'
    : mappedPayloadValue ?? (sourceValid ? source : 'Belum dapat dikirim');
  const status = override && !mappingValid
    ? 'Perlu koreksi relasi'
    : mappingValid
      ? 'Siap dikirim - mapping staging'
      : sourceValid
        ? 'Siap dikirim - data external'
        : 'Belum dapat dikirim';

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (query.trim().length < 2) return;
      if (field === 'project' && !effectiveBranchId) {
        setRemoteCatalog([]);
        setError('Kantor proyek belum memiliki branch efektif untuk memfilter katalog.');
        return;
      }
      setCatalogLoading(true);
      setError('');
      void marisonPayloadMappingService
        .catalog(entityType, query, field === 'project' ? effectiveBranchId : null)
        .then((items) => { if (active) setRemoteCatalog(items); })
        .catch((catalogError) => {
          if (active) setError(catalogError instanceof Error ? catalogError.message : 'Katalog mapping gagal dimuat');
        })
        .finally(() => { if (active) setCatalogLoading(false); });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [effectiveBranchId, entityType, field, query]);

  useEffect(() => {
    setValue(override?.target_record_id || '');
    setQuery('');
    if (override?.target_record_id) {
      setRemoteCatalog((current) => current.some((item) => item.id === override.target_record_id)
        ? current
        : [{
            id: override.target_record_id,
            name: override.mapped_name || 'Mapping tersimpan',
            nik: override.mapped_nik,
            code: override.mapped_code,
            external_id: override.mapped_external_id,
            office_name: override.mapped_office_name,
            branch_id: override.mapped_branch_id,
            valid: override.mapping_valid,
          }, ...current]);
    }
  }, [override?.target_record_id]);

  const save = async (reset = false) => {
    if (!reason.trim()) {
      toast.error('Alasan wajib diisi');
      return;
    }
    if (reset && !(await appDialog.confirm({
      title: 'Reset mapping tersimpan?',
        description: `Mapping ${selected?.name || override?.mapped_name || '-'} akan dihapus dan nilai payload kembali memakai identitas external sumber.`,
      confirmText: 'Reset mapping',
    }))) return;

    setBusy(true);
    setError('');
    try {
      const result = await marisonPayloadMappingService.save({
        entityType,
        recordId,
        targetRecordId: reset ? null : value,
        reason,
        expectedUpdatedAt: override?.updated_at,
      });
      const nextMapping = reset || result.mapping?.deleted ? null : {
        ...override,
        ...result.mapping,
        entity_type: entityType,
        record_id: recordId,
        target_record_id: value,
        mapped_name: selected?.name || override?.mapped_name || null,
        mapped_nik: selected?.nik || override?.mapped_nik || null,
        mapped_code: selected?.code || override?.mapped_code || null,
        mapped_external_id: selected?.external_id ?? override?.mapped_external_id ?? null,
        mapped_office_name: selected?.office_name || override?.mapped_office_name || null,
        mapped_branch_id: selected?.branch_id ?? override?.mapped_branch_id ?? null,
        mapping_valid: selected?.valid ?? true,
      } as MarisonPayloadMapping;
      onChanged(nextMapping);
      setValue(reset ? '' : value);
      setReason('');
       toast.success(reset ? 'Mapping direset ke data external sumber' : 'Mapping disimpan');
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Mapping gagal disimpan';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const candidates = remoteCatalog.filter((item) => item.valid).slice(0, 8);
  const effectiveInvalid = effective === 'Belum dapat dikirim' || effective === 'Perlu koreksi relasi';
  return (
    <div className="min-w-[250px] space-y-1.5">
      <div className="grid grid-cols-[auto_1fr] gap-x-2 text-[11px] text-muted-foreground">
        <span>Data SIGAP</span>
        <b className={sourceValid ? 'text-foreground' : 'text-destructive'}>{source || '-'}</b>
        <span>Mapping Payload Staging</span>
        <b className={override && !mappingValid ? 'text-destructive' : 'text-amber-700 dark:text-amber-300'}>
          {selected?.name || override?.mapped_name || '-'}
        </b>
        <span>Nilai yang Dikirim</span>
        <b className={effectiveInvalid ? 'text-destructive' : 'text-primary'}>{effective}</b>
        <span>Status</span>
        <b className={effectiveInvalid ? 'text-destructive' : 'text-primary'}>{status}</b>
      </div>
      <div className="relative flex gap-1">
        <Input
          className="h-7 text-xs"
          value={query || selected?.name || override?.mapped_name || ''}
          onChange={(event) => {
            setQuery(event.target.value);
            setValue('');
          }}
          placeholder={`Cari mapping ${field} staging`}
          aria-label={`${field} mapping staging`}
        />
        <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => void save()} disabled={busy || !value || !selected?.valid}>
          <Save className="mr-1 h-3.5 w-3.5" />Simpan
        </Button>
        {override && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void save(true)} disabled={busy}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />Reset tersimpan
          </Button>
        )}
        {query.trim().length >= 2 && !value && (
          <div className="absolute left-0 top-8 z-30 w-full rounded border bg-card p-1 shadow-lg">
            {catalogLoading ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">Mencari...</p>
            ) : candidates.length > 0 ? candidates.map((item) => (
              <button
                type="button"
                key={item.id}
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted"
                onClick={() => {
                  setValue(item.id);
                  setQuery(item.name);
                }}
              >
                {item.name} {item.nik ? `- ${item.nik}` : item.external_id ? `- ID ${item.external_id}` : ''}
              </button>
            )) : (
              <p className="px-2 py-1 text-xs text-muted-foreground">Tidak ada kandidat valid.</p>
            )}
          </div>
        )}
      </div>
      <Input
        className="h-7 text-xs"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Alasan audit"
        aria-label="alasan mapping"
        maxLength={2000}
      />
      {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
