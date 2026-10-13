import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setupTestHarness, teardownTestHarness, allowServiceCalls } from './surat-form-harness';
import { accessService } from '@/services/access.service';
import { UUID } from './surat-form-fixtures';
import { configureStandardMocks, mountForm, selectFormAndUsage, findSelectTrigger } from './surat-form-driver';

beforeEach(() => {
  setupTestHarness(); configureStandardMocks();
  allowServiceCalls('getMasterData', 'getActiveRegistrationDrafts');
});
afterEach(() => { teardownTestHarness(); vi.restoreAllMocks(); });

describe('delegated office registration UI', () => {
  it('offers only granted offices and clears the old form context on office change', async () => {
    const access = vi.spyOn(accessService, 'getIssuingOfficeIds').mockResolvedValue([UUID.office_kc]);
    await mountForm();
    await selectFormAndUsage();
    expect(access).toHaveBeenCalled();
    const trigger = screen.getByRole('combobox', { name: 'Kantor Pengajuan' });
    expect(trigger).not.toBeDisabled();
    await act(async () => { fireEvent.click(trigger); });
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(2);
    const otherOffice = within(listbox).getAllByRole('option').find(option => !option.textContent?.includes('Kantor Pusat'))!;
    await act(async () => { fireEvent.click(otherOffice); });
    expect(screen.queryByText('Kegunaan')).not.toBeInTheDocument();
    expect(findSelectTrigger(/^Pilih Formulir$/i)).toHaveTextContent(/Pilih formulir/i);
    expect(screen.getByRole('button', { name: /Dapatkan Nomor Surat/ })).toBeDisabled();
  });

  it('disables submission when office permissions cannot be refreshed', async () => {
    const access = vi.spyOn(accessService, 'getIssuingOfficeIds').mockResolvedValue([UUID.office_kc]);
    await mountForm();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Kantor Pengajuan' })).not.toBeDisabled());
    access.mockRejectedValue(new Error('offline'));
    await act(async () => { fireEvent(window, new Event('focus')); });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Kantor Pengajuan' })).toBeDisabled());
    expect(screen.getByRole('button', { name: /Dapatkan Nomor Surat/ })).toBeDisabled();
  });
});
