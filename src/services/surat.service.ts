import { supabase } from "@/lib/supabase";
import ExcelJS from "exceljs";
import { notificationService } from "./notification.service";

export interface SuratRegistrasi {
  id: string;
  no_surat: string | null;
  judul_surat: string;
  file_path: string | null;
  status: string;
  current_step: number;
  created_at: string;
  updated_at: string;
  entity_id?: string;
  office_id?: string;
  project_id?: string;
  dept_id?: string;
  letter_type_id?: string;
  penggunaan_id?: string;
  surat_signatures?: Array<{
    id: string;
    role_name: string;
    step_order: number;
    is_signed: boolean;
    signed_at: string | null;
    profiles?: { full_name: string };
  }>;
}

export const suratService = {
  cleanUuid(id: any) {
    if (!id || id === "" || id === "pusat" || id === "undefined" || id === "null") return null;
    return id;
  },

  normalizeRoleName(raw: any, stepOrder: number, totalSteps: number): "membuat" | "memeriksa" | "menyetujui" {
    const v = String(raw ?? "").toLowerCase().trim();
    if (v === "membuat" || v === "memeriksa" || v === "menyetujui") return v as any;
    if (v.includes("setuju") || v.includes("approve") || v.includes("approval") || v.includes("otoris") || v.includes("final")) return "menyetujui";
    if (v.includes("periksa") || v.includes("review") || v.includes("verifikasi") || v.includes("cek") || v.includes("paraf")) return "memeriksa";
    if (v.includes("buat") || v.includes("draft") || v.includes("pemohon") || v.includes("request")) return "membuat";
    if (stepOrder === 1) return "membuat";
    if (stepOrder === totalSteps) return "menyetujui";
    return "memeriksa";
  },

  getRelativePath(url: string): string {
    if (!url) return "";
    const parts = url.split("/dokumen_surat/");
    const path = parts.length < 2 ? url : parts[1];
    return decodeURIComponent(path.split("?")[0]);
  },

  resolveStampPositions(usageDetail: any, roleName: string, stepOrder: number): any[] {
    try {
      const config = typeof usageDetail.ttd_config === "string"
        ? JSON.parse(usageDetail.ttd_config) : usageDetail.ttd_config;
      if (!Array.isArray(config)) return [];
      const matched = config.filter((_item: any, index: number) => (index + 1) === Number(stepOrder));
      console.log(`Stamp Match Found for Step ${stepOrder}:`, matched);
      return matched;
    } catch (e) {
      console.error("Error parsing ttd_config:", e);
      return [];
    }
  },

  async generateNoSurat(payload: any): Promise<{ fullNumber: string; noUrut: number }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const officeIdClean  = this.cleanUuid(payload.office_id);
      const projectIdClean = this.cleanUuid(payload.project_id);
      const deptIdClean    = this.cleanUuid(payload.dept_id); // ← BARU: untuk partisi nomor per dept

      const [officeRes, deptRes] = await Promise.all([
        supabase.from("master_offices").select("code, kedudukan, parent_id").eq("id", officeIdClean).single(),
        supabase.from("master_departments").select("code, dept_index").eq("id", payload.dept_id).single()
      ]);

      const office  = officeRes.data;
      const isPusat = office?.kedudukan === "Pusat";

      // PERUBAHAN UTAMA: tambah p_dept_id agar nomor urut dimulai dari 001 per dept/project
      const { data: nextNumber, error: rpcError } = await supabase.rpc("generate_new_letter_number", {
        p_entity_id:  payload.entity_id,
        p_type_id:    payload.letter_type_id,
        p_office_id:  officeIdClean,
        p_project_id: projectIdClean,
        p_user_id:    user?.id,
        p_dept_id:    deptIdClean,
      });

      if (rpcError) throw new Error("Gagal menerbitkan nomor urut.");

      const [entityRes, projectRes, typeRes] = await Promise.all([
        supabase.from("master_entities").select("code").eq("id", payload.entity_id).single(),
        projectIdClean
          ? supabase.from("master_projects").select("code").eq("id", projectIdClean).single()
          : Promise.resolve({ data: null }),
        // Ambil type_index langsung dari master_letter_types (bukan mapping yang kosong)
        supabase.from("master_letter_types")
          .select("type_index")
          .eq("id", payload.letter_type_id)
          .single()
      ]);

      const noUrutStr  = String(nextNumber).padStart(3, "0");
      const entityCode = entityRes.data?.code || "??";
      const deptCode   = deptRes.data?.code   || "";
      const dIndex     = deptRes.data?.dept_index  || "0";
      const tIndex     = typeRes.data?.type_index  || "0";

      const romawiBulan = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
      const bulan = romawiBulan[new Date().getMonth()];
      const tahun = new Date().getFullYear();

      let middleCode = "";
      if (isPusat) {
        middleCode = `${deptCode}.${tIndex}`;
      } else {
        const projCode = projectRes.data?.code || "??";
        if (office?.kedudukan === "KC") {
          middleCode = `${office.code}-${projCode}.${dIndex}.${tIndex}`;
        } else {
          const { data: parent } = await supabase
            .from("master_offices").select("code").eq("id", office?.parent_id).single();
          const parentCode = parent?.code || "??";
          middleCode = `${parentCode}.${office?.code}-${projCode}.${dIndex}.${tIndex}`;
        }
      }

      return {
        fullNumber: `${noUrutStr}/${entityCode}/${middleCode}/${bulan}/${tahun}`,
        noUrut: nextNumber
      };
    } catch (error: any) {
      console.error("Error generating number:", error);
      throw error;
    }
  },

  async createRegistrasi(payload: any, signers: any[], file: File | null, lampiranFile?: File | null) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const noUrut      = parseInt(payload.no_surat.split("/")[0]);
      const currentYear = new Date().getFullYear();

      const cleanPayload = {
        ...payload,
        entity_id:      this.cleanUuid(payload.entity_id),
        office_id:      this.cleanUuid(payload.office_id),
        project_id:     this.cleanUuid(payload.project_id),
        dept_id:        this.cleanUuid(payload.dept_id),
        letter_type_id: this.cleanUuid(payload.letter_type_id),
        penggunaan_id:  this.cleanUuid(payload.penggunaan_id),
        created_by:     user?.id,
      };

      if (file)         cleanPayload.file_path     = await this.uploadFile(file);
      if (lampiranFile) cleanPayload.lampiran_path = await this.uploadFile(lampiranFile);

      const { data: surat, error: suratError } = await supabase
        .from("surat_registrasi").insert(cleanPayload).select().single();

      if (suratError) throw suratError;

      await supabase.from("surat_reservations")
        .update({ status: "USED" })
        .match({
          no_urut:     noUrut,
          entity_id:   cleanPayload.entity_id,
          year:        currentYear,
          reserved_by: user?.id,
          status:      "PENDING",
        });

      const activeSigners = signers.filter(s => s.user_id);
      const totalSteps = activeSigners.length;
      const signerPayload = activeSigners.map((s, idx) => ({
        surat_id: surat.id,
        user_id: s.user_id,
        role_name: this.normalizeRoleName(s.role_name, Number(s.step_order || idx + 1), totalSteps),
        step_order: s.step_order,
        is_signed: false
      }));

      if (signerPayload.length > 0) {
        await supabase.from("surat_signatures").insert(signerPayload);
        
        // Notifikasi ke step pertama
        const firstStepOrd = Math.min(...signerPayload.map((s: any) => s.step_order));
        const firstSigners = signerPayload.filter((s: any) => s.step_order === firstStepOrd);
        
        for (const s of firstSigners) {
          notificationService.createNotification(
             s.user_id,
             'Surat Masuk Baru',
             `Surat "${cleanPayload.judul_surat}" telah diajukan dan memerlukan tindakan Anda`,
             'info',
             `/surat/inbox`
          ).catch(e => console.error("Notif error:", e));
        }
      }

      return surat;
    } catch (error: any) {
      console.error("Error in createRegistrasi:", error);
      throw new Error(error.message);
    }
  },

  async cancelRegistration(noSurat: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!noSurat) return false;
    const noUrut      = parseInt(noSurat.split("/")[0]);
    const currentYear = new Date().getFullYear();
    const { error } = await supabase.from("surat_reservations")
      .update({ status: "CANCELLED" })
      .match({ no_urut: noUrut, reserved_by: user?.id, year: currentYear, status: "PENDING" });
    if (error) throw error;
    return true;
  },

  async stampApprovalExcel(suratId: string, currentFilePath: string, userName: string, roleName: string, usageId: string, stepOrder: number): Promise<string> {
    const { data: usageDetail } = await supabase.from("master_penggunaan_detail").select("*").eq("id", usageId).single();
    if (!usageDetail) return currentFilePath;

    const relativePath = this.getRelativePath(currentFilePath);
    const { data: fileData, error: dlError } = await supabase.storage.from("dokumen_surat").download(relativePath);
    if (dlError || !fileData) { console.error("Gagal download file untuk stamping:", dlError); throw new Error("Gagal download file."); }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await fileData.arrayBuffer());
    const positions = this.resolveStampPositions(usageDetail, roleName, stepOrder);

    if (positions && positions.length > 0) {
      const now = new Date();
      workbook.worksheets.forEach(worksheet => {
        positions.forEach((pos: any) => {
          const ttdCell = worksheet.getCell(pos.ttd);
          ttdCell.value = `Approved by System\n✅\n${now.toLocaleDateString("id-ID")}\n${now.toLocaleTimeString("id-ID")} WIB`;
          ttdCell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
          const rowNum = parseInt(pos.ttd.match(/\d+/)?.[0] || "35");
          worksheet.getRow(rowNum).height = 65;
          if (pos.nama)    worksheet.getCell(pos.nama).value    = userName.toUpperCase();
          if (pos.jabatan) worksheet.getCell(pos.jabatan).value = pos.labelJabatan || "";
        });
      });
      const buffer  = await workbook.xlsx.writeBuffer();
      const newPath = `dokumen/signed_${suratId}_step${stepOrder}_${Date.now()}.xlsx`;
      const { error: upError } = await supabase.storage.from("dokumen_surat").upload(newPath, buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true
      });
      if (upError) throw upError;
      const { data: { publicUrl } } = supabase.storage.from("dokumen_surat").getPublicUrl(newPath);
      return publicUrl;
    }
    return currentFilePath;
  },

  async approveSurat(signatureId: string, suratId: string, currentStep: number, userName: string, note: string = ""): Promise<{ success: boolean }> {
    const { data: suratFresh, error: suratErr } = await supabase
      .from("surat_registrasi").select("current_step, file_path, penggunaan_id").eq("id", suratId).single();
    if (suratErr || !suratFresh) throw new Error("Dokumen tidak ditemukan.");
    if (suratFresh.current_step !== currentStep) throw new Error("Dokumen sudah diproses. Silakan refresh.");

    const { data: sigInfo } = await supabase.from("surat_signatures").select("role_name").eq("id", signatureId).single();
    if (!sigInfo) throw new Error("Data tanda tangan tidak valid.");

    let baseFilePath = suratFresh.file_path;
    if (currentStep > 1) {
      const { data: prevSnap } = await supabase.from("surat_signatures")
        .select("file_path_snap").eq("surat_id", suratId).eq("step_order", currentStep - 1).eq("is_signed", true).single();
      if (prevSnap?.file_path_snap) baseFilePath = prevSnap.file_path_snap;
    }

    let finalUrl = baseFilePath ?? "";
    if (baseFilePath?.split("?")[0].toLowerCase().endsWith(".xlsx") && suratFresh.penggunaan_id) {
      finalUrl = await this.stampApprovalExcel(suratId, baseFilePath, userName, sigInfo.role_name, suratFresh.penggunaan_id, currentStep);
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc("handle_approve_surat_v2", {
      p_sig_id: signatureId, p_surat_id: suratId, p_note: note, p_file_path: finalUrl
    });
    if (rpcError) throw new Error(rpcError.message);
    if (!rpcResult?.success) throw new Error("Gagal memproses persetujuan.");

    // Ambil data terbaru untuk notifikasi
    const { data: updatedSurat } = await supabase
      .from("surat_registrasi")
      .select("current_step, status, created_by, judul_surat")
      .eq("id", suratId)
      .single();

    if (updatedSurat) {
      // 1. Notif ke pembuat surat (yang mengajukan surat)
      if (updatedSurat.created_by) {
        notificationService.createNotification(
          updatedSurat.created_by,
          'Surat Ditandatangani',
          `Surat "${updatedSurat.judul_surat}" telah ditandatangani oleh ${userName}`,
          'success',
          `/surat/monitoring`
        ).catch(e => console.error(e));
      }

      // 2. Notif ke next signer jika masih diproses dan step bertambah
      if ((updatedSurat.status === 'ON_PROGRESS' || updatedSurat.status === 'DRAFT') && updatedSurat.current_step > currentStep) {
        const { data: nextSigners } = await supabase
          .from("surat_signatures")
          .select("user_id")
          .eq("surat_id", suratId)
          .eq("step_order", updatedSurat.current_step);
          
        if (nextSigners && nextSigners.length > 0) {
          for (const ns of nextSigners) {
            notificationService.createNotification(
              ns.user_id,
              'Surat Masuk Baru',
              `Surat "${updatedSurat.judul_surat}" memerlukan tindakan Anda`,
              'info',
              `/surat/inbox`
            ).catch(e => console.error(e));
          }
        }
      }
    }

    return { success: true };
  },

  async rejectSurat(signatureId: string, suratId: string, note: string) {
    const { error: sigError } = await supabase.from("surat_signatures")
      .update({ is_signed: true, signed_at: new Date().toISOString(), catatan: note, status: "REJECTED" })
      .eq("id", signatureId);
    if (sigError) throw sigError;
    const { error: suratError } = await supabase.from("surat_registrasi").update({ status: "REJECTED" }).eq("id", suratId);
    if (suratError) throw suratError;

    // Notif ke pembuat surat
    const { data: suratInfo } = await supabase.from('surat_registrasi').select('created_by, judul_surat').eq('id', suratId).single();
    if (suratInfo?.created_by) {
       notificationService.createNotification(
         suratInfo.created_by,
         'Surat Ditolak',
         `Surat "${suratInfo.judul_surat}" telah ditolak. Catatan: ${note}`,
         'error',
         `/surat/monitoring`
       ).catch(e => console.error(e));
    }

    return true;
  },

  async getMyInbox(userId: string) {
    const { data, error } = await supabase
      .from("surat_signatures").select(`id, role_name, step_order, is_signed, surat_id, surat_registrasi!inner (*)`)
      .eq("user_id", userId).eq("is_signed", false);
    if (error) return [];
    return data.map((sig: any) => {
      const surat = Array.isArray(sig.surat_registrasi) ? sig.surat_registrasi[0] : sig.surat_registrasi;
      if (!surat || Number(sig.step_order) !== Number(surat.current_step)) return null;
      return { ...sig, surat_registrasi: surat };
    }).filter(Boolean);
  },

  async uploadFile(file: File) {
    const filePath = `dokumen/${Date.now()}_${file.name}`;
    await supabase.storage.from("dokumen_surat").upload(filePath, file);
    return supabase.storage.from("dokumen_surat").getPublicUrl(filePath).data.publicUrl;
  },

  async getAllSurat(userId?: string): Promise<SuratRegistrasi[]> {
    let query = supabase.from("surat_registrasi")
      .select(`*, surat_signatures (*, profiles:user_id (full_name))`).order("created_at", { ascending: false });
    if (userId) query = query.eq("created_by", userId);
    const { data } = await query;
    return (data || []).map((s: any) => ({
      ...s, surat_signatures: s.surat_signatures?.sort((a: any, b: any) => a.step_order - b.step_order) || []
    })) as SuratRegistrasi[];
  },

  async getMasterData() {
    const res = await Promise.all([
      supabase.from("master_entities").select("*"),
      supabase.from("master_offices").select("*"),
      supabase.from("master_departments").select("*"),
      supabase.from("master_letter_types").select("*"),
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase.from("master_projects").select("*").order("name"),
      supabase.from("master_penggunaan_detail").select("*").order("created_at", { ascending: false })
    ]);
    return {
      entities:   res[0].data || [], offices:    res[1].data || [],
      depts:      res[2].data || [], types:      res[3].data || [],
      users:      res[4].data || [], projects:   res[5].data || [],
      penggunaan: res[6].data || []
    };
  },

  async downloadFilledTemplate(payload: any, templateLink: string) {
    const [officeRes, projectRes, deptRes] = await Promise.all([
      payload.office_id  ? supabase.from("master_offices").select("name").eq("id", payload.office_id).maybeSingle()  : Promise.resolve({ data: null }),
      payload.project_id ? supabase.from("master_projects").select("name").eq("id", payload.project_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("master_departments").select("name").eq("id", payload.dept_id).maybeSingle()
    ]);
    const response = await fetch(templateLink);
    const workbook  = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    worksheet.getCell(payload.is_aset ? "B4" : "E4").value = "V";
    worksheet.getCell("D5").value = `: ${payload.no_surat}`;
    if (payload.office_id && officeRes?.data?.name !== "Kantor Pusat") {
      worksheet.getCell("L4").value = `: KC. ${officeRes?.data?.name || ""}`;
      worksheet.getCell("L5").value = `: ${projectRes?.data?.name || ""}`;
    } else {
      worksheet.getCell("L4").value = `: ${deptRes?.data?.name || ""}`;
      worksheet.getCell("L5").value = ": -";
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = window.URL.createObjectURL(new Blob([buffer]));
    a.download = `Form_${payload.no_surat?.replace(/\//g, "_")}.xlsx`;
    a.click();
    return true;
  },

  getPreviewUrl(publicUrl: string) {
    if (!publicUrl) return "";
    const stripped = publicUrl.split("?")[0];
    const decoded  = decodeURIComponent(stripped);
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(decoded)}&wdPrint=0&wdEmbedCode=0`;
  },
};