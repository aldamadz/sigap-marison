-- =====================================================
-- SKEMA DATABASE: SISTEM MANAJEMEN SURAT
-- Tabel: surat_registrasi, surat_reservations, surat_signatures
-- =====================================================

-- =====================================================
-- 1. TABEL: surat_registrasi
-- Deskripsi: Tabel utama untuk registrasi dan tracking surat
-- =====================================================

CREATE TABLE surat_registrasi (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Nomor Surat (format: 001/UAI/PGD.1/IV/2026)
    no_surat TEXT UNIQUE,
    
    -- Data Master (Foreign Keys)
    entity_id UUID REFERENCES master_entities(id),
    office_id UUID REFERENCES master_offices(id),
    project_id UUID REFERENCES master_projects(id),
    dept_id UUID REFERENCES master_departments(id),
    letter_type_id UUID REFERENCES master_letter_types(id),
    penggunaan_id UUID REFERENCES master_penggunaan_detail(id),
    
    -- Informasi Surat
    judul_surat TEXT NOT NULL,
    file_path TEXT,
    lampiran_path TEXT,
    is_aset BOOLEAN DEFAULT false,
    
    -- Status Workflow
    status TEXT DEFAULT 'PROSES',
    current_step INTEGER DEFAULT 1,
    
    -- PIC (Person In Charge) Management
    pic_id UUID REFERENCES profiles(id),
    pic_attachment TEXT,
    pic_action_at TIMESTAMP WITH TIME ZONE,
    pic_action_by UUID REFERENCES profiles(id),
    pic_review_status TEXT CHECK (pic_review_status IN ('PENDING', 'SPK', 'KEUANGAN', 'REJECTED', 'KEUANGAN_DONE', 'KEUANGAN_REJECTED')),
    pic_note TEXT,
    
    -- Chat Status
    chat_status TEXT DEFAULT 'CLOSED' CHECK (chat_status IN ('OPEN', 'CLOSED')),
    chat_opened_at TIMESTAMP WITH TIME ZONE,
    chat_closed_at TIMESTAMP WITH TIME ZONE,
    creator_seen_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes untuk surat_registrasi
CREATE INDEX idx_surat_no_surat ON surat_registrasi(no_surat);
CREATE INDEX idx_surat_status ON surat_registrasi(status);
CREATE INDEX idx_surat_entity ON surat_registrasi(entity_id);
CREATE INDEX idx_surat_office ON surat_registrasi(office_id);
CREATE INDEX idx_surat_dept ON surat_registrasi(dept_id);
CREATE INDEX idx_surat_pic ON surat_registrasi(pic_id);
CREATE INDEX idx_surat_created_by ON surat_registrasi(created_by);
CREATE INDEX idx_surat_created_at ON surat_registrasi(created_at DESC);

-- Comments
COMMENT ON TABLE surat_registrasi IS 'Tabel utama untuk registrasi dan tracking surat';
COMMENT ON COLUMN surat_registrasi.no_surat IS 'Format: XXX/UAI/DEPT.TIPE/BULAN/TAHUN';
COMMENT ON COLUMN surat_registrasi.status IS 'Status workflow: PROSES, DONE, dll';
COMMENT ON COLUMN surat_registrasi.pic_review_status IS 'Status review PIC: PENDING, SPK, KEUANGAN, REJECTED, KEUANGAN_DONE, KEUANGAN_REJECTED';
COMMENT ON COLUMN surat_registrasi.chat_status IS 'Status chat: OPEN atau CLOSED';

-- =====================================================
-- 2. TABEL: surat_reservations
-- Deskripsi: Reservasi nomor surat untuk menghindari konflik
-- =====================================================

CREATE TABLE surat_reservations (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Data untuk generate nomor surat
    entity_id UUID NOT NULL,
    type_id UUID NOT NULL,
    year INTEGER NOT NULL,
    no_urut INTEGER NOT NULL,
    
    -- Status Reservasi
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'USED', 'CANCELLED')),
    
    -- Lokasi & Assignment
    office_id UUID,
    project_id UUID,
    dept_id UUID REFERENCES master_departments(id),
    
    -- Metadata
    reserved_by UUID DEFAULT auth.uid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 minutes'),
    
    -- Constraint: Kombinasi unik untuk nomor surat
    UNIQUE(entity_id, type_id, year, no_urut, office_id, project_id, dept_id)
);

-- Indexes untuk surat_reservations
CREATE INDEX idx_reservations_status ON surat_reservations(status);
CREATE INDEX idx_reservations_reserved_by ON surat_reservations(reserved_by);
CREATE INDEX idx_reservations_expires ON surat_reservations(expires_at);
CREATE INDEX idx_reservations_entity_year ON surat_reservations(entity_id, year);

-- Comments
COMMENT ON TABLE surat_reservations IS 'Reservasi nomor surat untuk menghindari race condition';
COMMENT ON COLUMN surat_reservations.no_urut IS 'Nomor urut dalam tahun tertentu';
COMMENT ON COLUMN surat_reservations.status IS 'PENDING: masih dipesan, USED: sudah digunakan, CANCELLED: dibatalkan';
COMMENT ON COLUMN surat_reservations.expires_at IS 'Waktu kadaluarsa reservasi (default 30 menit)';

-- =====================================================
-- 3. TABEL: surat_signatures
-- Deskripsi: Tanda tangan digital dan approval workflow
-- =====================================================

CREATE TABLE surat_signatures (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relasi ke Surat
    surat_id UUID REFERENCES surat_registrasi(id) ON DELETE CASCADE,
    
    -- User yang menandatangani
    user_id UUID REFERENCES profiles(id),
    
    -- Informasi Role & Urutan
    role_name TEXT,
    step_order INTEGER,
    
    -- Status Tanda Tangan
    is_signed BOOLEAN DEFAULT false,
    signed_at TIMESTAMP WITH TIME ZONE,
    
    -- Digital Stamp/Signature
    digital_stamp TEXT,
    
    -- Catatan/Notes
    catatan TEXT,
    
    -- Status Step
    status TEXT DEFAULT 'PENDING',
    
    -- File Snapshot (opsional)
    file_path_snap TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes untuk surat_signatures
CREATE INDEX idx_signatures_surat ON surat_signatures(surat_id);
CREATE INDEX idx_signatures_user ON surat_signatures(user_id);
CREATE INDEX idx_signatures_step ON surat_signatures(surat_id, step_order);
CREATE INDEX idx_signatures_status ON surat_signatures(status);
CREATE INDEX idx_signatures_is_signed ON surat_signatures(is_signed);

-- Comments
COMMENT ON TABLE surat_signatures IS 'Tanda tangan digital dan approval workflow surat';
COMMENT ON COLUMN surat_signatures.step_order IS 'Urutan penandatanganan (1, 2, 3, dst)';
COMMENT ON COLUMN surat_signatures.is_signed IS 'Apakah sudah ditandatangani';
COMMENT ON COLUMN surat_signatures.digital_stamp IS 'Hash/identitas digital tanda tangan';
COMMENT ON COLUMN surat_signatures.file_path_snap IS 'Snapshot file saat ditandatangani';

-- =====================================================
-- TRIGGERS & FUNCTIONS
-- =====================================================

-- Trigger untuk update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger ke semua tabel
CREATE TRIGGER update_surat_registrasi_updated_at
    BEFORE UPDATE ON surat_registrasi
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_surat_signatures_updated_at
    BEFORE UPDATE ON surat_signatures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE surat_registrasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE surat_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE surat_signatures ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own created surat
CREATE POLICY "Users can view own surat" ON surat_registrasi
    FOR SELECT USING (created_by = auth.uid());

-- Policy: PIC can view assigned surat
CREATE POLICY "PIC can view assigned surat" ON surat_registrasi
    FOR SELECT USING (pic_id = auth.uid());

-- Policy: Admin can view all
CREATE POLICY "Admin can view all surat" ON surat_registrasi
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Policy untuk signatures
CREATE POLICY "Users can view signatures for own surat" ON surat_signatures
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM surat_registrasi 
            WHERE id = surat_signatures.surat_id 
            AND (created_by = auth.uid() OR pic_id = auth.uid())
        )
    );

CREATE POLICY "Signer can update own signature" ON surat_signatures
    FOR UPDATE USING (user_id = auth.uid());

-- =====================================================
-- VIEWS (Opsional - untuk reporting)
-- =====================================================

-- View: Summary Surat dengan Info Lengkap
CREATE OR REPLACE VIEW v_surat_summary AS
SELECT 
    sr.id,
    sr.no_surat,
    sr.judul_surat,
    sr.status,
    sr.pic_review_status,
    sr.chat_status,
    me.name as entity_name,
    mo.name as office_name,
    mp.name as project_name,
    md.name as department_name,
    mlt.name as letter_type_name,
    p.full_name as pic_name,
    creator.full_name as created_by_name,
    sr.created_at,
    sr.updated_at,
    (SELECT COUNT(*) FROM surat_signatures ss WHERE ss.surat_id = sr.id) as total_signatures,
    (SELECT COUNT(*) FROM surat_signatures ss WHERE ss.surat_id = sr.id AND ss.is_signed = true) as signed_count,
    (SELECT COUNT(*) FROM surat_chats sc WHERE sc.surat_id = sr.id) as chat_count
FROM surat_registrasi sr
LEFT JOIN master_entities me ON sr.entity_id = me.id
LEFT JOIN master_offices mo ON sr.office_id = mo.id
LEFT JOIN master_projects mp ON sr.project_id = mp.id
LEFT JOIN master_departments md ON sr.dept_id = md.id
LEFT JOIN master_letter_types mlt ON sr.letter_type_id = mlt.id
LEFT JOIN profiles p ON sr.pic_id = p.id
LEFT JOIN profiles creator ON sr.created_by = creator.id;

-- View: Signature Progress
CREATE OR REPLACE VIEW v_signature_progress AS
SELECT 
    sr.id as surat_id,
    sr.no_surat,
    sr.judul_surat,
    ss.step_order,
    ss.role_name,
    p.full_name as signer_name,
    ss.is_signed,
    ss.signed_at,
    ss.status,
    CASE 
        WHEN ss.is_signed THEN 'COMPLETED'
        WHEN sr.current_step = ss.step_order THEN 'IN_PROGRESS'
        WHEN sr.current_step > ss.step_order THEN 'COMPLETED'
        ELSE 'PENDING'
    END as step_status
FROM surat_registrasi sr
JOIN surat_signatures ss ON sr.id = ss.surat_id
LEFT JOIN profiles p ON ss.user_id = p.id
ORDER BY sr.id, ss.step_order;

-- =====================================================
-- END OF SCHEMA
-- =====================================================
