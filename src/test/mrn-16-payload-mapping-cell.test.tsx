import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarisonPayloadMappingCell } from '@/components/admin/MarisonPayloadMappingCell';
import { AppDialogProvider } from '@/components/app/AppDialogProvider';
import { marisonPayloadMappingService } from '@/services/marison-payload-mapping.service';

vi.mock('@/services/marison-payload-mapping.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/marison-payload-mapping.service')>('@/services/marison-payload-mapping.service');
  return { ...actual, marisonPayloadMappingService: { save: vi.fn(), catalog: vi.fn() } };
});

describe('MRN-16 override cell', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders source, saved override, effective value and saves', async () => {
    vi.mocked(marisonPayloadMappingService.save).mockResolvedValue({ mapping: { entity_type: 'office', record_id: 'office-a', target_record_id: 'target-a', mapped_external_id: 20, updated_at: 'new' } });
    const onChanged = vi.fn();
    render(<AppDialogProvider><MarisonPayloadMappingCell entityType="office" recordId="office-a" source={10} sourceValid={true} mappingValid={false} field="branch" catalog={[{ id: 'target-a', name: 'KC External', external_id: 20, valid: true }]} override={null} onChanged={onChanged} /></AppDialogProvider>);
    expect(screen.getByText('Data SIGAP')).toBeInTheDocument();
    expect(screen.getAllByText('10')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('branch mapping staging'), { target: { value: 'KC' } });
    fireEvent.click(screen.getByRole('button', { name: /kc external/i }));
    fireEvent.change(screen.getByLabelText('alasan mapping'), { target: { value: 'Uji mapping' } });
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(marisonPayloadMappingService.save).toHaveBeenCalledWith(expect.objectContaining({ targetRecordId: 'target-a', reason: 'Uji mapping' }));
  });

  it('resets saved override through backend and renders row error', async () => {
    vi.mocked(marisonPayloadMappingService.save).mockRejectedValueOnce(new Error('stale mapping'));
    const override = { entity_type: 'office' as const, record_id: 'office-a', target_record_id: 'target-a', mapped_external_id: 20, updated_at: 'old' } as any;
    render(<AppDialogProvider><MarisonPayloadMappingCell entityType="office" recordId="office-a" source={10} sourceValid={true} mappingValid={true} field="branch" catalog={[{ id: 'target-a', name: 'KC External', external_id: 20, valid: true }]} override={override} onChanged={vi.fn()} /></AppDialogProvider>);
    fireEvent.change(screen.getByLabelText('alasan mapping'), { target: { value: 'Reset' } });
    fireEvent.click(screen.getByRole('button', { name: /reset tersimpan/i }));
    fireEvent.click(await screen.findByRole('button', { name: /reset mapping/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('stale mapping');
  });

  it('never presents an invalid source or invalid mapping as the effective payload value', () => {
    const { rerender } = render(
      <AppDialogProvider>
        <MarisonPayloadMappingCell
          entityType="profile"
          recordId="profile-a"
          source="TRIAL-001"
          sourceValid={false}
          mappingValid={false}
          field="nik"
          override={null}
          onChanged={vi.fn()}
        />
      </AppDialogProvider>,
    );
    expect(screen.getAllByText('Belum dapat dikirim')).toHaveLength(2);

    rerender(
      <AppDialogProvider>
        <MarisonPayloadMappingCell
          entityType="profile"
          recordId="profile-a"
          source="TRIAL-001"
          sourceValid={false}
          mappingValid={false}
          field="nik"
          override={{
            entity_type: 'profile',
            record_id: 'profile-a',
            target_record_id: 'target-a',
            mapped_name: 'Mirror tidak valid',
            mapped_nik: 'A 114',
            mapped_code: null,
            mapped_external_id: 114,
            mapped_office_name: null,
            mapped_branch_id: null,
            mapping_valid: false,
            updated_at: '2026-07-31T00:00:00.000Z',
          }}
          onChanged={vi.fn()}
        />
      </AppDialogProvider>,
    );
    expect(screen.getAllByText('Perlu koreksi relasi')).toHaveLength(2);
  });

  it('shows the mapped NIK instead of the external employee ID for profile payloads', () => {
    render(
      <AppDialogProvider>
        <MarisonPayloadMappingCell
          entityType="profile"
          recordId="profile-a"
          source="STAGING-ADMIN"
          sourceValid={false}
          mappingValid={true}
          field="nik"
          catalog={[{
            id: 'target-a',
            name: 'Andrian Ardiyanto',
            nik: 'A 001',
            external_id: 114,
            valid: true,
          }]}
          override={{
            entity_type: 'profile',
            record_id: 'profile-a',
            target_record_id: 'target-a',
            mapped_name: 'Andrian Ardiyanto',
            mapped_nik: 'A 001',
            mapped_code: null,
            mapped_external_id: 114,
            mapped_office_name: null,
            mapped_branch_id: null,
            mapping_valid: true,
            updated_at: '2026-07-31T00:00:00.000Z',
          }}
          onChanged={vi.fn()}
        />
      </AppDialogProvider>,
    );

    expect(screen.getByText('A 001')).toBeInTheDocument();
    expect(screen.queryByText('114')).not.toBeInTheDocument();
  });

  it('finds a mapped project in another office and shows its office', async () => {
    vi.mocked(marisonPayloadMappingService.catalog).mockResolvedValue([
      { id: 'project-target', name: 'Sragen Test', office_name: 'Kantor Cabang Magelang', external_id: 23, branch_id: 2, valid: true },
    ]);
    render(
      <AppDialogProvider>
        <MarisonPayloadMappingCell
          entityType="project"
          recordId="project-source"
          source={null}
          sourceValid={false}
          mappingValid={false}
          field="project"
          override={null}
          onChanged={vi.fn()}
        />
      </AppDialogProvider>,
    );
    fireEvent.change(screen.getByLabelText('project mapping staging'), { target: { value: 'Sragen' } });
    await waitFor(() => expect(marisonPayloadMappingService.catalog).toHaveBeenCalledWith('project', 'Sragen', null), { timeout: 1000 });
    expect(await screen.findByRole('button', { name: /Sragen Test - ID 23 \/ Kantor Cabang Magelang/i })).toBeInTheDocument();
  });
});
