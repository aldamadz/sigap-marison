import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
describe('SLA-03 server-owned action clock', () => {
  it('records waiting intervals without granting clients clock control', () => {
    const sql = read('supabase/migrations/20261109110000_signer_action_sla_clock.sql');
    expect(sql).toContain('create schema if not exists sla_clock_internal');
    expect(sql).toContain('Menunggu tim pemeriksa');
    expect(sql).toContain('Menunggu rekomendasi');
    expect(sql).toContain('baseline_seconds');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('from public,anon,authenticated,service_role');
    expect(sql).not.toContain('grant execute on all functions in schema sla_clock_internal to authenticated');
  });
  it('uses the same elapsed clock and waiting metadata for every signer SLA consumer', () => {
    const sql = read('supabase/migrations/20261109110000_signer_action_sla_clock.sql');
    for (const name of ['get_department_kpi_summary','get_department_kpi_details','get_user_active_sla_breach_count','get_actionable_dashboard','remind_dashboard_request']) expect(sql).toContain(name);
    expect(sql).toContain('sla_clock_internal.elapsed');
    expect(sql).toContain('sla_paused');
    expect(sql).toContain('sla_pause_reasons');
    expect(sql).not.toContain('update public.surat_signatures set available_at');
  });
});
