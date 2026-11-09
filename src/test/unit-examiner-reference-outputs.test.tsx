import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { applyExternalUnitReference } from '@sigap/shared';
import { createProductionCodeAttachment, createUnitRecapAttachment } from '@/services/surat/pdf-builders';
import { UnitAllocationSummary } from '@/components/surat/UnitAllocationSummary';
import { createUnitAllocationTemplateWorkbook, readSpreadsheetRows } from '@/lib/excel';

const pdf=vi.hoisted(()=>({table:vi.fn()}));
vi.mock('jspdf-autotable',()=>({default:pdf.table}));
vi.mock('@/lib/supabase',()=>({supabase:{}}));
const unit={value:'2048',label:'B40',raw:{code:'B40',type:'30',land_area:60,production_code:'001/UAI/PRC/5.2/07/10/2026'},
  allocation_detail: {unit_type:'36/72',production_serial:'009',production_block:'6.1',production_date:'2026-11-09',struktur_atas:'100',struktur_bawah:'200'}};

describe('examiner Unit reference outputs',()=>{
  it('renders the saved examiner type/code in summaries and both PDF attachment tables',()=>{
    render(<UnitAllocationSummary units={[unit]} project={{name:'Proyek Uji'}} requestedCount={1}/>);
    expect(screen.getAllByText('36/72')).toHaveLength(2);
    expect(screen.getByText('009/UAI/PRC/6.1/09/11/2026')).toBeInTheDocument();
    createUnitRecapAttachment({name:'Proyek Uji'},[unit]);
    expect(pdf.table.mock.lastCall![1].body[0][2]).toBe('36/72');
    createProductionCodeAttachment({name:'Proyek Uji'},[unit]);
    expect(pdf.table.mock.lastCall![1].body[0].slice(2)).toEqual(['B40','36/72','009/UAI/PRC/6.1/09/11/2026']);
  });
  it('round-trips editable type/production values through XLSX, without any LT column',async()=>{
    const bytes=await createUnitAllocationTemplateWorkbook([{No:1,Proyek:'Uji',Kavling:'B40','Tipe Unit':'36/72',
      'Struktur Atas':100,'Struktur Bawah':200,'Nomor Kode Produksi':'009',Blok:'6.1','Tanggal Produksi':'09/11/2026'}]).xlsx.writeBuffer();
    const rows=await readSpreadsheetRows({name:'allocation.xlsx',arrayBuffer:async()=>bytes} as File);
    expect(rows[0]).not.toContain('LT');expect(rows[0]).not.toContain('Luas Tanah');
    const detail=applyExternalUnitReference(unit,{unit_type:rows[1][3],production_serial:rows[1][6],production_block:rows[1][7],production_date:'2026-11-09'});
    expect(detail).toMatchObject({unit_type:'36/72',production_serial:'009',production_block:'6.1',production_date:'2026-11-09'});
  });
});
