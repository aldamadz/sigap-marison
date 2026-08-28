import { supabase } from "@/lib/supabase";
import { canAutoApproveRequesterFirstStep } from "@/lib/surat-requester-auto-approval";
import { validateInitialRegistrationAttachments } from "@/lib/registration-attachment-validation";
import {
  buildRegistrationAttachmentRows,
  classifyRegistrationDraftAttachments,
  formatCreateRegistrasiError,
} from "@/lib/registration-draft-attachment-classification";
import { documentPreviewService } from "./document-preview.service";
import { appStorageService } from "./storage.service";
import {
  buildDataSnapshot,
  buildProductionCode,
  cleanUuid,
  formatDateForDocument,
  formatProductionDate,
  formatRupiah,
  getUnitCode,
  getUnitType,
  getVerifierIdsFromSnapshot,
  normalizeFormInputData,
  normalizeRecommendationItems,
  normalizeRoleName,
  parseMoney,
} from "./surat/form-helpers";
import {
  createProductionCodeAttachment,
  createUnitRecapAttachment,
  getSignerSnapshots,
} from "./surat/pdf-builders";
import { notifyInboxStepTasks, sendNotification } from "./surat/notification";

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
  form_usage_id?: string;
  surat_signatures?: Array<{
    id: string;
    role_name: string;
    step_order: number;
    is_signed: boolean;
    signed_at: string | null;
    profiles?: { full_name: string };
  }>;
  surat_attachments?: Array<{
    id: string;
    file_url: string;
    file_name: string | null;
    file_type: string | null;
    file_size: number | null;
    stage?: string | null;
    requirement_key?: string | null;
    requirement_label?: string | null;
    signature_id?: string | null;
  }>;
}

export interface SuratRegistrationDraft {
  id: string;
  reservation_id: string | null;
  revision_event_id?: string | null;
  created_by: string;
  no_surat: string;
  status: "DRAFT" | "SUBMITTED" | "VOID" | "EXPIRED";
  payload: Record<string, any>;
  signer_assignments: any[];
  current_section: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  surat_registration_draft_files?: SuratRegistrationDraftFile[];
}

export interface RecommendationTask {
  id: string;
  parent_surat_id: string;
  submitted_surat_id: string | null;
  no_surat: string;
  status: "waiting" | "claimed" | "revision_requested" | "submitted" | "cancelled";
  required_before_step: number;
  claimed_by: string | null;
  claimed_by_name: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
  candidate_snapshot: Array<{ user_id?: string; full_name?: string; job_title?: string }> | unknown;
  draft_id: string | null;
  parent_no_surat: string | null;
  parent_judul_surat: string | null;
  parent_status: string | null;
  parent_created_at: string | null;
  parent_requester_name: string | null;
}

export interface RecommendationParentSummary {
  task_id: string;
  parent_surat_id: string;
  no_surat: string | null;
  judul_surat: string | null;
  requester_name: string | null;
  requester_job_title: string | null;
  department_name: string | null;
  department_code: string | null;
  office_name: string | null;
  office_kedudukan: string | null;
  project_name: string | null;
  request_place: string | null;
  request_date: string | null;
  request_category: string | null;
  form_input_data: Record<string, unknown>;
  attachments: Array<{
    id: string;
    file_name: string | null;
    file_type: string | null;
    file_size: number | null;
    requirement_label: string | null;
  }>;
}

export interface LinkedSuratDocument {
  id: string;
  parent_surat_id: string;
  child_surat_id: string;
  link_type: "recommendation";
  status: "active" | "cancelled";
  required_before_step: number | null;
  created_at: string;
  child_no_surat: string | null;
  child_judul_surat: string | null;
  child_status: string | null;
  child_current_step: number | null;
  child_file_path: string | null;
  child_pdf_path: string | null;
  child_created_at: string | null;
  child_created_by: string | null;
  child_recommendation_multi_detail: unknown | null;
}

export interface SuratRegistrationDraftFile {
  id: string;
  draft_id: string;
  file_url: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  requirement_key: string | null;
  requirement_label: string | null;
  created_at: string;
}

export interface RegistrationDraftUploadProgress {
  phase: "uploading" | "saving";
  fileName: string;
  fileIndex: number;
  fileCount: number;
  loaded: number;
  total: number;
  percent: number;
}

export const suratService = {
  async sendNotification(...args: Parameters<typeof sendNotification>) {
    return sendNotification(...args);
  },

  getVerifierIdsFromSnapshot(...args: Parameters<typeof getVerifierIdsFromSnapshot>) {
    return getVerifierIdsFromSnapshot(...args);
  },

  async notifyInboxStepTasks(
    suratId: string,
    stepOrder: number,
    judulSurat: string,
    eventType: string
  ) {
    return notifyInboxStepTasks(
      { sendNotification, getVerifierIdsFromSnapshot },
      suratId,
      stepOrder,
      judulSurat,
      eventType,
    );
  },

  cleanUuid(...args: Parameters<typeof cleanUuid>) {
    return cleanUuid(...args);
  },

  normalizeRoleName(...args: Parameters<typeof normalizeRoleName>) {
    return normalizeRoleName(...args);
  },

  formatDateForDocument(...args: Parameters<typeof formatDateForDocument>) {
    return formatDateForDocument(...args);
  },

  normalizeRecommendationItems(...args: Parameters<typeof normalizeRecommendationItems>) {
    return normalizeRecommendationItems(...args);
  },

  normalizeFormInputData(...args: Parameters<typeof normalizeFormInputData>) {
    return normalizeFormInputData(...args);
  },

  getUnitCode(...args: Parameters<typeof getUnitCode>) {
    return getUnitCode(...args);
  },

  getUnitType(...args: Parameters<typeof getUnitType>) {
    return getUnitType(...args);
  },

  parseMoney(...args: Parameters<typeof parseMoney>) {
    return parseMoney(...args);
  },

  formatRupiah(...args: Parameters<typeof formatRupiah>) {
    return formatRupiah(...args);
  },

  buildProductionCode(...args: Parameters<typeof buildProductionCode>) {
    return buildProductionCode(...args);
  },

  formatProductionDate(...args: Parameters<typeof formatProductionDate>) {
    return formatProductionDate(...args);
  },

  createUnitRecapAttachment(...args: Parameters<typeof createUnitRecapAttachment>) {
    return createUnitRecapAttachment(...args);
  },

  createProductionCodeAttachment(...args: Parameters<typeof createProductionCodeAttachment>) {
    return createProductionCodeAttachment(...args);
  },

  async getSignerSnapshots(...args: Parameters<typeof getSignerSnapshots>) {
    return getSignerSnapshots(...args);
  },

  buildDataSnapshot(...args: Parameters<typeof buildDataSnapshot>) {
    return buildDataSnapshot(...args);
  },

  async getRegistrationContext(payload: any) {
    const { data: { user } } = await supabase.auth.getUser({ force: true });
    if (!user) throw new Error("Tidak terautentikasi");

    const profileResult = await supabase
      .from("profiles")
      .select("id, full_name, nik, job_title, email, department_id, office_id, role")
      .eq("id", user.id)
      .single();

    if (profileResult.error) throw profileResult.error;

    const profile = profileResult.data;
    const isAdmin = ["admin", "super_admin"].includes(String(profile?.role || "").toLowerCase());
    const requesterProfile = isAdmin && payload?._requester_profile_override
      ? { ...profile, ...payload._requester_profile_override }
      : profile;
    const effectivePayload = isAdmin
      ? payload
      : {
          ...payload,
          office_id: profile?.office_id || payload.office_id,
          dept_id: profile?.department_id || payload.dept_id,
        };

    const [profileRes, officeRes, projectRes, deptRes, entityRes, usageRes] = await Promise.all([
      Promise.resolve(profileResult),
      effectivePayload.office_id ? supabase.from("master_offices").select("id, name, code, kedudukan").eq("id", effectivePayload.office_id).maybeSingle() : Promise.resolve({ data: null }),
      effectivePayload.project_id ? supabase.from("master_projects").select("id, name, code, office_id, entity_id").eq("id", effectivePayload.project_id).maybeSingle() : Promise.resolve({ data: null }),
      effectivePayload.dept_id ? supabase.from("master_departments").select("id, name, code, dept_index").eq("id", effectivePayload.dept_id).maybeSingle() : Promise.resolve({ data: null }),
      effectivePayload.entity_id ? supabase.from("master_entities").select("id, name, code").eq("id", effectivePayload.entity_id).maybeSingle() : Promise.resolve({ data: null }),
      effectivePayload.form_usage_id
        ? supabase
            .from("form_usages")
            .select(`
              *,
              form_usage_departments(department_id),
              form_usage_steps(
                id, step_order, role_name, label, action_type, signer_department_id,
                form_usage_step_users(user_id)
              ),
              form_usage_attachment_requirements(*),
              master_forms(id, nama_form, nomor_form, input_schema, department_id)
            `)
            .eq("id", effectivePayload.form_usage_id)
            .single()
        : effectivePayload.penggunaan_id
        ? supabase
            .from("master_penggunaan_detail")
            .select("*, workflow_allowed_departments(department_id), master_forms!fk_master_forms(id, nama_form, nomor_form, input_schema, department_id)")
            .eq("id", effectivePayload.penggunaan_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    if (profileRes.error) throw profileRes.error;
    if ("error" in usageRes && usageRes.error) throw usageRes.error;

    const rawUsage = usageRes.data as any;
    const usage = rawUsage
      ? {
          ...rawUsage,
          workflow_allowed_departments: Array.isArray(rawUsage.form_usage_departments)
            ? rawUsage.form_usage_departments
            : rawUsage.workflow_allowed_departments || [],
          request_categories: rawUsage.request_category
            ? [rawUsage.request_category]
            : rawUsage.request_categories || [],
        }
      : null;

    return {
      user,
      profile: requesterProfile,
      office: officeRes.data,
      project: projectRes.data,
      department: deptRes.data,
      entity: entityRes.data,
      usage,
      form: usage?.master_forms ?? null,
      payload: effectivePayload,
    };
  },

  async getActiveRegistrationDrafts(): Promise<SuratRegistrationDraft[]> {
    const { data, error } = await supabase
      .from("surat_registration_drafts")
      .select("*, surat_registration_draft_files(*)")
      .eq("status", "DRAFT")
      .is("revision_event_id", null)
      .gt("expires_at", new Date().toISOString())
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []) as SuratRegistrationDraft[];
  },

  async getRegistrationDraft(id: string): Promise<SuratRegistrationDraft> {
    const { data, error } = await supabase
      .from("surat_registration_drafts")
      .select("*, surat_registration_draft_files(*)")
      .eq("id", id)
      .eq("status", "DRAFT")
      .gt("expires_at", new Date().toISOString())
      .single();
    if (error) throw error;
    return data as SuratRegistrationDraft;
  },

  async createExternalSubmissionRevisionDraft(revisionEventId: string): Promise<SuratRegistrationDraft> {
    const { data, error } = await supabase.rpc("create_external_submission_revision_draft", {
      p_revision_event_id: revisionEventId,
    });
    if (error) throw error;
    return data as SuratRegistrationDraft;
  },

  async submitExternalSubmissionRevision(args: {
    revisionEventId: string;
    draftId: string;
    formData: Record<string, any>;
    requesterNote?: string;
  }): Promise<{ success: boolean; next_step: string; surat_id: string; revision_event_id: string }> {
    const { data, error } = await supabase.rpc("submit_external_submission_revision", {
      p_revision_event_id: args.revisionEventId,
      p_draft_id: args.draftId,
      p_form_data: args.formData,
      p_requester_note: args.requesterNote || null,
    });
    if (error) throw error;
    return data as { success: boolean; next_step: string; surat_id: string; revision_event_id: string };
  },

  async createRegistrationDraft(args: {
    noUrut: number;
    noSurat: string;
    payload: Record<string, any>;
    signerAssignments: any[];
  }): Promise<SuratRegistrationDraft> {
    const { data, error } = await supabase.rpc("create_surat_registration_draft", {
      p_no_urut: args.noUrut,
      p_no_surat: args.noSurat,
      p_payload: args.payload,
      p_signer_assignments: args.signerAssignments,
    });
    if (error) throw error;
    return data as SuratRegistrationDraft;
  },

  async saveRegistrationDraft(
    id: string,
    payload: Record<string, any>,
    signerAssignments: any[],
    currentSection = "details"
  ): Promise<void> {
    const { error } = await supabase
      .from("surat_registration_drafts")
      .update({
        payload,
        signer_assignments: signerAssignments,
        current_section: currentSection,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", id)
      .eq("status", "DRAFT");
    if (error) throw error;
  },

  async finishRegistrationDraft(id: string, status: "SUBMITTED" | "VOID"): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("surat_registration_drafts")
      .update({
        status,
        submitted_at: status === "SUBMITTED" ? now : null,
        voided_at: status === "VOID" ? now : null,
      })
      .eq("id", id)
      .eq("status", "DRAFT");
    if (error) throw error;
  },

  async voidRegistrationDraft(id: string): Promise<void> {
    const { error } = await supabase.rpc("void_surat_registration_draft", { p_draft_id: id });
    if (error) throw error;
  },

  async getMyRecommendationTasks(): Promise<RecommendationTask[]> {
    const { data, error } = await supabase.rpc("get_my_recommendation_tasks");
    if (error) throw error;
    return (data || []) as RecommendationTask[];
  },

  async getRecommendationParentSummary(taskId: string): Promise<RecommendationParentSummary> {
    const { data, error } = await supabase.rpc("get_recommendation_parent_summary", {
      p_task_id: taskId,
    });
    if (error) throw error;
    if (!data || typeof data !== "object") {
      throw new Error("Ringkasan pengajuan induk tidak tersedia.");
    }
    return data as RecommendationParentSummary;
  },

  async claimRecommendationTask(taskId: string): Promise<SuratRegistrationDraft> {
    const { data, error } = await supabase.rpc("claim_recommendation_task", {
      p_task_id: taskId,
    });
    if (error) throw error;
    return data as SuratRegistrationDraft;
  },

  async completeRecommendationTask(taskId: string, childSuratId: string): Promise<void> {
    const { error } = await supabase.rpc("complete_recommendation_task", {
      p_task_id: taskId,
      p_child_surat_id: childSuratId,
    });
    if (error) throw error;
  },

  async finalizeRecommendationRevisionIfNeeded(childSuratId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc("finalize_recommendation_revision_if_needed", {
      p_child_surat_id: childSuratId,
    });
    if (error) throw error;
    return Boolean(data);
  },

  async autoApproveRequesterFirstStep(suratId: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser({ force: true });
    if (!user) throw new Error("Sesi login tidak tersedia.");

    const [suratResult, signatureResult, profileResult] = await Promise.all([
      supabase
        .from("surat_registrasi")
        .select("created_by, current_step, status")
        .eq("id", suratId)
        .maybeSingle(),
      supabase
        .from("surat_signatures")
        .select("id, surat_id, step_order, user_id, is_signed, action_type, verification_required, requires_unit_allocation")
        .eq("surat_id", suratId)
        .eq("step_order", 1)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    if (suratResult.error) throw suratResult.error;
    if (signatureResult.error) throw signatureResult.error;
    const surat = suratResult.data;
    const signature = signatureResult.data;
    if (!surat || !signature) return false;

    const isOrdinaryRequesterApproval = canAutoApproveRequesterFirstStep({
      actorId: user.id,
      surat,
      signature,
    });
    if (!isOrdinaryRequesterApproval) return false;

    await this.approveSurat(
      signature.id,
      suratId,
      1,
      profileResult.data?.full_name || user.email || "Pemohon",
      "Disetujui otomatis karena pemohon adalah penandatangan tahap pertama"
    );
    return true;
  },

  async autoApproveRecommendationFirstStep(suratId: string): Promise<void> {
    const autoApproved = await this.autoApproveRequesterFirstStep(suratId);
    if (!autoApproved) {
      throw new Error("Signer pertama rekomendasi tidak cocok dengan akun pembuat atau membutuhkan tindakan khusus.");
    }
  },

  async uploadRegistrationDraftFiles(
    draftId: string,
    files: File[],
    requirement?: { key?: string; label?: string },
    onProgress?: (progress: RegistrationDraftUploadProgress) => void,
  ): Promise<SuratRegistrationDraftFile[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak tersedia.");
    const rows = [];
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    let completedBytes = 0;

    for (const [index, file] of files.entries()) {
      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const path = `drafts/${draftId}/${crypto.randomUUID()}_${safeName}`;
      const uploaded = await appStorageService.upload({
        bucket: "lampiran_surat",
        path,
        file,
        onProgress: ({ loaded }) => {
          const aggregateLoaded = completedBytes + Math.min(loaded, file.size);
          onProgress?.({
            phase: "uploading",
            fileName: file.name,
            fileIndex: index + 1,
            fileCount: files.length,
            loaded: aggregateLoaded,
            total: totalBytes,
            percent: totalBytes > 0
              ? Math.min(Math.round((aggregateLoaded / totalBytes) * 100), 100)
              : 100,
          });
        },
      });
      completedBytes += file.size;
      rows.push({
        draft_id: draftId,
        created_by: user.id,
        file_url: uploaded.publicUrl,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
        requirement_key: requirement?.key || null,
        requirement_label: requirement?.label || null,
      });
    }
    if (rows.length === 0) return [];
    onProgress?.({
      phase: "saving",
      fileName: files.at(-1)?.name || "",
      fileIndex: files.length,
      fileCount: files.length,
      loaded: totalBytes,
      total: totalBytes,
      percent: 100,
    });
    const { data, error } = await supabase
      .from("surat_registration_draft_files")
      .insert(rows)
      .select("*");
    if (error) throw error;
    return (data || []) as SuratRegistrationDraftFile[];
  },

  async deleteRegistrationDraftFile(id: string): Promise<void> {
    const { error } = await supabase.from("surat_registration_draft_files").delete().eq("id", id);
    if (error) throw error;
  },

  async generateNoSurat(payload: any): Promise<{ fullNumber: string; noUrut: number }> {
    try {
      const { data: { user } } = await supabase.auth.getUser({ force: true });
      const officeIdClean  = this.cleanUuid(payload.office_id);
      const projectIdClean = this.cleanUuid(payload.project_id);
      const deptIdClean    = this.cleanUuid(payload.dept_id); // ← BARU: untuk partisi nomor per dept

      const [officeRes, deptRes] = await Promise.all([
        supabase.from("master_offices").select("code, kedudukan, parent_id").eq("id", officeIdClean).single(),
        supabase.from("master_departments").select("code, dept_index").eq("id", payload.dept_id).single()
      ]);

      if (officeRes.error || !officeRes.data) throw new Error("Kantor penerbit tidak ditemukan.");
      if (deptRes.error || !deptRes.data) throw new Error("Departemen pengaju tidak ditemukan.");

      const office  = officeRes.data;
      const isPusat = office?.kedudukan === "Pusat";
      const requestCategory = payload.form_input_data?.request_category;
      const isUnitRequest = requestCategory === "unit" || payload.form_input_data?.request_mode === "unit";
      if (isUnitRequest) {
        const context = await this.getRegistrationContext(payload);
        const actorDepartmentId = context.profile?.department_id;
        const allowedDepartments = Array.isArray(context.usage?.workflow_allowed_departments)
          ? context.usage.workflow_allowed_departments
          : [];
        if (!actorDepartmentId || !allowedDepartments.some(
          (permission: { department_id?: string }) => permission.department_id === actorDepartmentId
        )) {
          throw new Error("Departemen akun Anda tidak diizinkan membuat permohonan Unit pada matrix ini.");
        }
      }

      if (!isPusat && !projectIdClean) {
        throw new Error("Pilih proyek cabang sebelum mengambil nomor surat.");
      }

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
        supabase.from("master_dept_letter_types")
          .select("sort_index")
          .eq("dept_id", deptIdClean)
          .eq("letter_type_id", payload.letter_type_id)
          .single()
      ]);

      if (typeRes.error || !typeRes.data) {
        throw new Error("Jenis surat tidak tersedia untuk departemen pengaju.");
      }

      const noUrutStr  = String(nextNumber).padStart(3, "0");
      const entityCode = entityRes.data?.code || "??";
      const deptCode   = deptRes.data?.code   || "";
      const dIndex     = deptRes.data?.dept_index  || "0";
      const tIndex     = typeRes.data?.sort_index  || "0";
      const requestedProjectCode = String(payload.form_input_data?.requested_project?.code || "").trim();
      const defaultProjectCode = String(payload.form_input_data?.project_code || "").trim();

      const romawiBulan = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
      const bulan = romawiBulan[new Date().getMonth()];
      const tahun = new Date().getFullYear();

      let middleCode = "";
      if (requestCategory === "unit" && requestedProjectCode) {
        middleCode = `${deptCode}.${tIndex}.${requestedProjectCode}`;
      } else if (isPusat) {
        middleCode = `${deptCode}.${tIndex}`;
      } else {
        const projCode = projectRes.data?.code || defaultProjectCode || "000";
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

  async createRegistrasi(
    payload: any,
    signers: any[],
    file: File | null,
    lampiranFiles?: File[] | File | null
  ) {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession({ force: true });
      if (sessionError) {
        throw new Error(`Gagal memeriksa sesi login: ${sessionError.message}`);
      }
      if (!session?.user) {
        throw new Error("Sesi login tidak tersedia saat submit. Silakan login ulang di alamat aplikasi yang sedang dipakai.");
      }
      const user = session.user;
      const attachmentFiles = Array.isArray(lampiranFiles)
        ? lampiranFiles
        : lampiranFiles
          ? [lampiranFiles]
          : [];
      const payloadDraftId = this.cleanUuid(payload.draft_id);
      let persistedDraftAttachments: SuratRegistrationDraftFile[] = [];
      if (payloadDraftId) {
        const { data, error } = await supabase
          .from("surat_registration_draft_files")
          .select("id, draft_id, file_url, file_name, file_type, file_size, requirement_key, requirement_label, created_at")
          .eq("draft_id", payloadDraftId);
        if (error) throw error;
        persistedDraftAttachments = (data || []) as SuratRegistrationDraftFile[];
      }

      const noUrut      = parseInt(payload.no_surat.split("/")[0]);
      const currentYear = new Date().getFullYear();
      // Recommendation authorization depends on the requester's department.
      // Normalize only after the trusted registration context is resolved.
      const configContext = await this.getRegistrationContext(payload);
      const normalizedFormInputData = this.normalizeFormInputData(configContext.payload.form_input_data, {
        requesterDepartmentCode: configContext.department?.code,
        requesterDepartmentName: configContext.department?.name,
      });
      payload = { ...configContext.payload, form_input_data: normalizedFormInputData };
      const isUnitMode = normalizedFormInputData?.request_mode === "unit";
      if (isUnitMode) {
        const workflowCategories = Array.isArray(configContext.usage?.request_categories)
          ? configContext.usage.request_categories
          : [];
        if (!workflowCategories.includes("unit")) {
          throw new Error("Matrix yang dipilih tidak mendukung registrasi Unit.");
        }
        const actorDepartmentId = configContext.profile?.department_id;
        const allowedDepartments = Array.isArray(configContext.usage?.workflow_allowed_departments)
          ? configContext.usage.workflow_allowed_departments
          : [];
        if (!actorDepartmentId || !allowedDepartments.some(
          (permission: { department_id?: string }) => permission.department_id === actorDepartmentId
        )) {
          throw new Error("Departemen akun Anda tidak diizinkan membuat permohonan Unit pada matrix ini.");
        }
      }

      const initialRequirements = (configContext.usage?.form_usage_attachment_requirements || [])
        .filter((requirement: any) => Number(requirement.stage_order) === 0);
      const initialAttachmentMeta = payload.initial_attachment_meta || {};
      const classifiedDraftAttachments = classifyRegistrationDraftAttachments({
        files: persistedDraftAttachments,
        initialRequirementKeys: new Set(
          initialRequirements.map((requirement: any) => String(requirement.requirement_key)),
        ),
        formInputData: normalizedFormInputData,
      });
      validateInitialRegistrationAttachments({
        requirements: initialRequirements,
        newFiles: attachmentFiles,
        newFileMetadata: initialAttachmentMeta,
        persistedFiles: classifiedDraftAttachments.initialAttachments,
      });

      const activeSigners = signers.filter(s => s.user_id);
      if (activeSigners.length < 2 || activeSigners.length > 8) {
        throw new Error("Penandatangan harus berjumlah 2 sampai 8 tahap sesuai konfigurasi.");
      }
      const signerSnapshots = await this.getSignerSnapshots(activeSigners);
      const totalSteps = activeSigners.length;
      const snapshotSigners = activeSigners.map((s, idx) => {
        const profile = signerSnapshots[s.user_id] ?? {};
        return {
          user_id: s.user_id,
          full_name: profile.full_name ?? null,
          nik: profile.nik ?? null,
          job_title: profile.job_title ?? null,
          job_title_display: profile.job_title_display ?? profile.job_title ?? null,
          email: profile.email ?? null,
          role_name: this.normalizeRoleName(s.role_name, Number(s.step_order || idx + 1), totalSteps),
          label_jabatan: s.label_jabatan ?? null,
          step_order: Number(s.step_order || idx + 1),
          status: "PENDING",
          is_signed: false,
        };
      });
      const signatureSteps = snapshotSigners.map(signer => ({
        step_order: signer.step_order,
        role_name: signer.role_name,
        label: signer.label_jabatan || signer.role_name,
        user_name: signer.full_name || "",
        job_title: signer.job_title_display || signer.job_title || "",
      }));
      payload = { ...payload, signature_steps: signatureSteps };

      let payloadReservationId = this.cleanUuid(payload.reservation_id);
      if (!payloadReservationId && payloadDraftId) {
        const { data: draftReservation, error: draftReservationError } = await supabase
          .from("surat_registration_drafts")
          .select("reservation_id")
          .eq("id", payloadDraftId)
          .maybeSingle();
        if (draftReservationError) throw draftReservationError;
        payloadReservationId = this.cleanUuid(draftReservation?.reservation_id);
      }

      if (payload.form_usage_id) {
        const { data: validation, error: validationError } = await supabase.rpc(
          "validate_form_usage_for_actor",
          {
            p_usage_id: payload.form_usage_id,
            p_requested_department_id: payload.dept_id || null,
          }
        );
        if (validationError) throw validationError;
        const configuredSteps = [...(configContext.usage?.form_usage_steps || [])]
          .sort((a: any, b: any) => a.step_order - b.step_order);
        if (configuredSteps.length !== activeSigners.length) {
          throw new Error("Jumlah penandatangan tidak sesuai konfigurasi kegunaan.");
        }
        configuredSteps.forEach((step: any, index: number) => {
          const assignment = activeSigners[index];
          const eligibleIds = (step.form_usage_step_users || []).map((item: any) => item.user_id);
          if (assignment.form_usage_step_id !== step.id || !eligibleIds.includes(assignment.user_id)) {
            throw new Error(`Penandatangan tahap ${step.step_order} tidak sesuai konfigurasi.`);
          }
        });
        payload.policy_validation = validation;
      }

      if (file) {
        throw new Error("Dokumen sumber tidak lagi menerima file Excel. Data permohonan akan dirender sebagai PDF-native.");
      }
      const context = configContext;

      const cleanPayload = {
        ...payload,
        reservation_id: payloadReservationId,
        draft_id: payloadDraftId,
        entity_id:      this.cleanUuid(payload.entity_id),
        office_id:      this.cleanUuid(payload.office_id),
        project_id:     this.cleanUuid(payload.project_id),
        dept_id:        this.cleanUuid(payload.dept_id),
        letter_type_id: this.cleanUuid(payload.letter_type_id),
        penggunaan_id:  this.cleanUuid(payload.penggunaan_id),
        form_usage_id:   this.cleanUuid(payload.form_usage_id),
        created_by:     user.id,
        represented_department_id: payload.policy_validation?.requester_department_id || null,
        represented_by_admin: payload.policy_validation?.represented_by_admin || null,
        policy_snapshot: payload.form_usage_id ? {
          usage_id: payload.form_usage_id,
          usage_name: configContext.usage?.name || null,
          form_id: configContext.form?.id || null,
          request_category: configContext.usage?.request_category || null,
          recommendation_config: configContext.usage?.recommendation_config || {},
          external_revision_policy: configContext.usage?.external_revision_policy || {
            recipient_type: "requester",
            recipient_step_order: null,
            approval_restart_step: 1,
          },
          requester_department_id: payload.policy_validation?.requester_department_id || null,
          steps: snapshotSigners,
          attachment_requirements: configContext.usage?.form_usage_attachment_requirements || [],
          captured_at: new Date().toISOString(),
        } : {},
        requester_nik: context.profile?.nik ?? null,
        request_place: payload.request_place ?? null,
        request_date: payload.request_date ?? null,
        form_input_data: normalizedFormInputData,
        requester_snapshot: {
          id: context.profile?.id ?? user?.id,
          full_name: context.profile?.full_name ?? null,
          nik: context.profile?.nik ?? null,
          job_title: context.profile?.job_title ?? null,
          email: context.profile?.email ?? user?.email ?? null,
        },
        location_snapshot: {
          entity: context.entity,
          office: context.office,
          project: context.project,
          department: context.department,
          form: context.form ? {
            id: context.form.id,
            nama_form: context.form.nama_form,
            nomor_form: context.form.nomor_form,
          } : null,
        },
        data_snapshot: this.buildDataSnapshot(context, payload, snapshotSigners, normalizedFormInputData),
      };

      cleanPayload.file_path = `native://document/${payloadDraftId || payloadReservationId || encodeURIComponent(String(payload.no_surat || "draft"))}`;

      const { data: surat, error: suratError } = await supabase
        .rpc("create_surat_registrasi", { p_payload: cleanPayload });

      if (suratError) throw suratError;
      if (!surat?.id) throw new Error("Surat gagal dibuat.");

      // A previous attempt may have committed the registration before a later
      // recommendation-link step failed. In that case the RPC returns the same
      // surat; do not duplicate its attachments, snapshots, or signatures.
      if (payloadDraftId) {
        const { count: existingSignatureCount, error: existingSignatureError } = await supabase
          .from("surat_signatures")
          .select("id", { count: "exact", head: true })
          .eq("surat_id", surat.id);
        if (existingSignatureError) throw existingSignatureError;
        if ((existingSignatureCount || 0) > 0) {
          if (!normalizedFormInputData?.linked_parent_surat_id) {
            await this.autoApproveRequesterFirstStep(surat.id).catch((autoApproveError) => {
              console.error("Gagal melanjutkan auto-approval pemohon:", autoApproveError);
            });
          }
          return surat;
        }
      }

      const uploadedAttachments = await this.uploadAttachmentFiles(surat.id, attachmentFiles, user?.id, {
        stage: "initial",
        requirements: payload.initial_attachment_meta || {},
      });
      let reusedDraftAttachments: any[] = [];
      const draftAttachmentRows = buildRegistrationAttachmentRows({
        suratId: surat.id,
        userId: user.id,
        initialAttachments: classifiedDraftAttachments.initialAttachments,
        recommendationAttachments: classifiedDraftAttachments.activeRecommendationAttachments,
      });
      if (draftAttachmentRows.length > 0) {
        const { data, error } = await supabase
          .from("surat_attachments")
          .insert(draftAttachmentRows)
          .select("*");
        if (error) throw error;
        reusedDraftAttachments = data || [];
      }
      uploadedAttachments.push(...reusedDraftAttachments);
      const primaryInitialAttachment = uploadedAttachments.find(
        (attachment) => attachment.stage !== "recommendation_item",
      );
      if (primaryInitialAttachment?.file_url) {
        await supabase
          .from("surat_registrasi")
          .update({ lampiran_path: primaryInitialAttachment.file_url })
          .eq("id", surat.id);
        surat.lampiran_path = primaryInitialAttachment.file_url;
      }
      surat.surat_attachments = uploadedAttachments;

      const dataSnapshot = this.buildDataSnapshot(context, payload, snapshotSigners, normalizedFormInputData, uploadedAttachments);
      await supabase
        .from("surat_registrasi")
        .update({ data_snapshot: dataSnapshot })
        .eq("id", surat.id);
      surat.data_snapshot = dataSnapshot;

      if (!cleanPayload.reservation_id) {
        await supabase.from("surat_reservations")
          .update({ status: "USED" })
          .match({
            no_urut:     noUrut,
            entity_id:   cleanPayload.entity_id,
            year:        currentYear,
            reserved_by: user?.id,
            status:      "PENDING",
          });
      }

      const firstStepOrder = Math.min(...activeSigners.map((s: any, idx: number) => Number(s.step_order || idx + 1)));
      const firstAvailableAt = new Date().toISOString();
      const signerPayload = activeSigners.map((s, idx) => ({
        surat_id: surat.id,
        user_id: s.user_id,
        role_name: this.normalizeRoleName(s.role_name, Number(s.step_order || idx + 1), totalSteps),
        label_jabatan: s.label_jabatan ?? null,
        step_order: s.step_order,
        is_signed: false,
        available_at: Number(s.step_order || idx + 1) === firstStepOrder ? firstAvailableAt : null,
        requires_unit_allocation: s.requires_unit_allocation === true,
        form_usage_step_id: this.cleanUuid(s.form_usage_step_id),
        action_type: s.action_type || (s.requires_unit_allocation ? "unit_allocation" : "approval"),
        attachment_requirements_snapshot: s.attachment_requirements || [],
        signer_snapshot: signerSnapshots[s.user_id] ?? {},
      }));

      let requesterAutoApproved = false;
      if (signerPayload.length > 0) {
        const { error: signerInsertError } = await supabase.from("surat_signatures").insert(signerPayload);
        if (signerInsertError) {
          await supabase.from("surat_registrasi").delete().eq("id", surat.id);
          throw signerInsertError;
        }
        
        const firstStepOrd = Math.min(...signerPayload.map((s: any) => s.step_order));
        if (!normalizedFormInputData?.linked_parent_surat_id) {
          requesterAutoApproved = await this.autoApproveRequesterFirstStep(surat.id).catch((autoApproveError) => {
            console.error("Auto-approval pemohon gagal; tahap pertama tetap tersedia secara manual:", autoApproveError);
            return false;
          });
        }
        if (!requesterAutoApproved) {
          await this.notifyInboxStepTasks(
            surat.id,
            firstStepOrd,
            cleanPayload.judul_surat,
            "new_inbox"
          );
        }
      }

      return surat;
    } catch (error: any) {
      const message = String(error?.message || error?.error || "Gagal menyimpan surat.");
      console.error(formatCreateRegistrasiError(error));
      throw new Error(message);
    }
  },

  async cancelRegistration(noSurat: string) {
    const { data: { user } } = await supabase.auth.getUser({ force: true });
    if (!noSurat) return false;
    const noUrut      = parseInt(noSurat.split("/")[0]);
    const currentYear = new Date().getFullYear();
    const { error } = await supabase.from("surat_reservations")
      .update({ status: "VOID" })
      .match({ no_urut: noUrut, reserved_by: user?.id, year: currentYear, status: "PENDING" });
    if (error) throw error;
    return true;
  },

  async rebuildDocumentSource(suratId: string): Promise<string> {
    const { data: actor } = await supabase.auth.getUser({ force: true });
    if (!actor.user) throw new Error("Tidak terautentikasi.");
    const { data: actorProfile, error: actorError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", actor.user.id)
      .single();
    if (actorError) throw actorError;
    if (!["admin", "super_admin"].includes(String(actorProfile?.role || "").toLowerCase())) {
      throw new Error("Hanya admin yang dapat membangun ulang sumber dokumen.");
    }

    await documentPreviewService.enqueuePdf(suratId, { refresh: true });
    return suratId;
  },

  async approveSurat(
    signatureId: string,
    suratId: string,
    currentStep: number,
    userName: string,
    note: string = "",
    options: {
      unitAllocation?: { project?: any; units: any[] };
      approvalAttachments?: Array<{ key: string; label: string; file: File }>;
    } = {}
  ): Promise<{ success: boolean }> {
    const [suratResult, signatureResult] = await Promise.all([
      supabase
        .from("surat_registrasi")
        .select("current_step, file_path, penggunaan_id, form_usage_id, form_input_data, data_snapshot")
        .eq("id", suratId)
        .single(),
      supabase
        .from("surat_signatures")
        .select("role_name, requires_unit_allocation, action_type, attachment_requirements_snapshot, signer_snapshot, verification_required, verification_status")
        .eq("id", signatureId)
        .single(),
    ]);
    const { data: suratFresh, error: suratErr } = suratResult;
    if (suratErr || !suratFresh) throw new Error("Dokumen tidak ditemukan.");
    if (suratFresh.current_step !== currentStep) throw new Error("Dokumen sudah diproses. Silakan refresh.");

    const { data: sigInfo } = signatureResult;
    if (!sigInfo) throw new Error("Data tanda tangan tidak valid.");
    if ((sigInfo as any).verification_required && (sigInfo as any).verification_status !== "verified") {
      throw new Error("Data pengajuan belum diperiksa tim pemeriksa.");
    }
    let formInputData = suratFresh.form_input_data ?? {};
    let uploadedAllocationAttachments: any[] = [];
    const approvalRequirements = Array.isArray(sigInfo.attachment_requirements_snapshot)
      ? sigInfo.attachment_requirements_snapshot
      : [];
    const approvalAttachments = options.approvalAttachments || [];
    const isPreparedByVerifier = (sigInfo as any).verification_required && (sigInfo as any).verification_status === "verified";
    const existingAllocatedUnits = Array.isArray(formInputData?.allocated_units) ? formInputData.allocated_units : [];
    const hasExistingUnitAllocation = existingAllocatedUnits.length > 0;
    const hasIncomingUnitAllocation = Array.isArray(options.unitAllocation?.units) && options.unitAllocation.units.length > 0;
    let uploaderId: string | undefined;
    let uploaderResolved = false;
    const getUploaderId = async () => {
      if (uploaderResolved) return uploaderId;
      const { data: { user } } = await supabase.auth.getUser();
      uploaderId = user?.id;
      uploaderResolved = true;
      return uploaderId;
    };
    if (!isPreparedByVerifier) {
      approvalRequirements.forEach((requirement: any) => {
        const files = approvalAttachments.filter(item => item.key === requirement.requirement_key);
        const minimum = requirement.is_required ? Math.max(1, Number(requirement.min_files || 1)) : 0;
        if (files.length < minimum) {
          throw new Error(`Lampiran approval belum lengkap: ${requirement.label || requirement.requirement_key}.`);
        }
        if (files.length > Number(requirement.max_files || 1)) {
          throw new Error(`Lampiran ${requirement.label || requirement.requirement_key} melebihi batas.`);
        }
        files.forEach(item => {
          const allowedTypes = Array.isArray(requirement.allowed_types) ? requirement.allowed_types : [];
          if (allowedTypes.length > 0 && item.file.type && !allowedTypes.includes(item.file.type)) {
            throw new Error(`Tipe file ${item.file.name} tidak diizinkan.`);
          }
          if (requirement.max_size_bytes && item.file.size > Number(requirement.max_size_bytes)) {
            throw new Error(`Ukuran file ${item.file.name} melebihi batas.`);
          }
        });
      });
    }
    if (
      (sigInfo.requires_unit_allocation || sigInfo.action_type === "unit_allocation") &&
      !isPreparedByVerifier &&
      !(hasExistingUnitAllocation && !hasIncomingUnitAllocation)
    ) {
      const units = options.unitAllocation?.units ?? [];
      const requestedProject = formInputData?.requested_project || {};
      const project = requestedProject?.code ? requestedProject : options.unitAllocation?.project;
      const requestedCount = Number(formInputData?.requested_unit_count || 0);
      if (formInputData?.request_mode !== "unit") throw new Error("Dokumen ini bukan pengajuan unit.");
      if (!Number.isFinite(requestedCount) || requestedCount < 1) throw new Error("Jumlah unit pengajuan tidak valid.");
      if (!project?.code) throw new Error("Project unit wajib dipilih.");
      if (options.unitAllocation?.project?.code && requestedProject?.code && options.unitAllocation.project.code !== requestedProject.code) {
        throw new Error("Proyek unit tidak boleh diubah. Buat pengajuan baru jika proyek salah.");
      }
      if (!Array.isArray(units) || units.length < 1) {
        throw new Error("Pilih minimal 1 unit.");
      }

      formInputData = {
        ...formInputData,
        allocated_project: project,
        allocated_units: units,
        allocated_unit_count: units.length,
        allocated_by_signature_id: signatureId,
        allocated_at: new Date().toISOString(),
      };
      const unitRecapAttachment = this.createUnitRecapAttachment(project, units);
      const productionCodeAttachment = this.createProductionCodeAttachment(project, units);
      uploadedAllocationAttachments = await this.uploadAttachmentFiles(
        suratId,
        [
          unitRecapAttachment,
          productionCodeAttachment,
        ],
        await getUploaderId(),
        {
          stage: "unit_allocation",
          signature_id: signatureId,
          requirements: {
            [unitRecapAttachment.name]: {
              key: "rekap_adendum_unit",
              label: "Rekap Adendum Unit",
            },
            [productionCodeAttachment.name]: {
              key: "kode_produksi_unit",
              label: "Kode Produksi Unit",
            },
          },
        }
      );

      const { data: allAttachments, error: attachmentsError } = await supabase
        .from("surat_attachments")
        .select("*")
        .eq("surat_id", suratId)
        .order("created_at", { ascending: true });
      if (attachmentsError) throw attachmentsError;
      const { error: allocationPersistError } = await supabase
        .from("surat_registrasi")
        .update({
          form_input_data: formInputData,
          data_snapshot: {
            ...(suratFresh.data_snapshot || {}),
            input: formInputData,
            requested_project: formInputData?.requested_project ?? null,
            allocated_project: formInputData?.allocated_project ?? null,
            requested_unit_count: formInputData?.requested_unit_count ?? null,
            allocated_units: formInputData?.allocated_units ?? [],
            allocated_unit_count: formInputData?.allocated_unit_count ?? null,
            attachments: allAttachments || uploadedAllocationAttachments,
          },
        })
        .eq("id", suratId);
      if (allocationPersistError) throw allocationPersistError;
    }

    if (approvalAttachments.length > 0) {
      await this.uploadAttachmentFiles(
        suratId,
        approvalAttachments.map(item => item.file),
        await getUploaderId(),
        {
          stage: "approval",
          signature_id: signatureId,
          requirements: Object.fromEntries(approvalAttachments.map(item => [
            item.file.name,
            { key: item.key, label: item.label },
          ])),
        }
      );
    }

    const finalUrl = `native://document/${suratId}/approval/${signatureId}/${Date.now()}`;

    const { data: rpcResult, error: rpcError } = await supabase.rpc("handle_approve_surat_v2", {
      p_sig_id: signatureId, p_surat_id: suratId, p_note: note, p_file_path: finalUrl
    });
    if (rpcError) throw new Error(rpcError.message);
    if (!rpcResult?.success) throw new Error("Gagal memproses persetujuan.");

    const updatedSuratResult = await supabase
      .from("surat_registrasi")
      .select("current_step, status, created_by, judul_surat")
      .eq("id", suratId)
      .single();

    const { data: updatedSurat } = updatedSuratResult;

    if (updatedSurat?.status === "PDF_PENDING") {
      // The database transition enqueues the immutable recommendation render job.
      return { success: true };
    }

    if (updatedSurat) {
      // 1. Notif ke pembuat surat (yang mengajukan surat)
      if (updatedSurat.created_by) {
        void this.sendNotification(
          [updatedSurat.created_by],
          'Surat Ditandatangani',
          `Surat "${updatedSurat.judul_surat}" telah ditandatangani oleh ${userName}`,
          "/surat/monitoring",
          { surat_id: suratId, event_type: "signed", type: "success" }
        );
      }

      // 2. Notif ke next signer jika masih diproses dan step bertambah
      if (updatedSurat.status === 'PROSES' && updatedSurat.current_step > currentStep) {
        void this.notifyInboxStepTasks(
          suratId,
          updatedSurat.current_step,
          updatedSurat.judul_surat,
          "next_inbox"
        ).catch((notificationError) => {
          console.error("Gagal menyiapkan notifikasi inbox berikutnya:", notificationError);
        });
      }

      if (['SELESAI', 'DONE'].includes(updatedSurat.status)) {
        await this.finalizeRecommendationRevisionIfNeeded(suratId);
        documentPreviewService.enqueuePdf(suratId).catch((pdfError) => {
          console.error("Gagal enqueue PDF final dokumen:", pdfError);
        });
      }
    }

    return { success: true };
  },

  async rejectSurat(signatureId: string, suratId: string, note: string) {
    const { data: rejected, error: rejectError } = await supabase.rpc("handle_reject_surat_v2", {
      p_sig_id: signatureId,
      p_surat_id: suratId,
      p_note: note,
    });
    if (rejectError) throw new Error(rejectError.message);
    if (!rejected) throw new Error("Gagal memproses penolakan.");

    // Notif ke pembuat surat
    const { data: suratInfo } = await supabase.from('surat_registrasi').select('created_by, judul_surat').eq('id', suratId).single();
    if (suratInfo?.created_by) {
       this.sendNotification(
         [suratInfo.created_by],
         'Surat Ditolak',
         `Surat "${suratInfo.judul_surat}" telah ditolak. Catatan: ${note}`,
         "/surat/monitoring",
         { surat_id: suratId, event_type: "rejected", type: "error" }
       );
    }

    return true;
  },

  async verifySignature(
    signatureId: string,
    note: string = "",
    options: {
      suratId?: string;
      unitAllocation?: { project?: any; units: any[] };
      approvalAttachments?: Array<{ key: string; label: string; file: File }>;
    } = {}
  ) {
    const { data: { user } } = await supabase.auth.getUser({ force: true });
    const { data: sigInfo, error: sigError } = await supabase
      .from("surat_signatures")
      .select("surat_id, user_id, step_order, requires_unit_allocation, action_type, attachment_requirements_snapshot, verification_status")
      .eq("id", signatureId)
      .single();
    if (sigError || !sigInfo) throw new Error("Data pemeriksaan tidak ditemukan.");

    const suratId = options.suratId || sigInfo.surat_id;
    const { data: suratFresh, error: suratErr } = await supabase
      .from("surat_registrasi")
      .select("judul_surat, form_input_data, data_snapshot, status")
      .eq("id", suratId)
      .single();
    if (suratErr || !suratFresh) throw new Error("Dokumen tidak ditemukan.");

    let formInputData = suratFresh.form_input_data ?? {};
    const persistedVerificationDraft =
      (suratFresh.data_snapshot as any)?.verification_drafts?.[signatureId]?.input || {};
    const approvalRequirements = Array.isArray(sigInfo.attachment_requirements_snapshot)
      ? sigInfo.attachment_requirements_snapshot
      : [];
    const approvalAttachments = options.approvalAttachments || [];
    const { data: existingApprovalAttachments, error: existingApprovalError } = await supabase
      .from("surat_attachments")
      .select("id, requirement_key")
      .eq("surat_id", suratId)
      .eq("signature_id", signatureId)
      .eq("stage", "approval");
    if (existingApprovalError) throw existingApprovalError;

    approvalRequirements.forEach((requirement: any) => {
      const files = approvalAttachments.filter(item => item.key === requirement.requirement_key);
      const existingCount = (existingApprovalAttachments || []).filter(item => item.requirement_key === requirement.requirement_key).length;
      const minimum = requirement.is_required ? Math.max(1, Number(requirement.min_files || 1)) : 0;
      if (Math.max(files.length, existingCount) < minimum) {
        throw new Error(`Lampiran approval belum lengkap: ${requirement.label || requirement.requirement_key}.`);
      }
      if (files.length > Number(requirement.max_files || 1)) {
        throw new Error(`Lampiran ${requirement.label || requirement.requirement_key} melebihi batas.`);
      }
      files.forEach(item => {
        const allowedTypes = Array.isArray(requirement.allowed_types) ? requirement.allowed_types : [];
        if (allowedTypes.length > 0 && item.file.type && !allowedTypes.includes(item.file.type)) {
          throw new Error(`Tipe file ${item.file.name} tidak diizinkan.`);
        }
        if (requirement.max_size_bytes && item.file.size > Number(requirement.max_size_bytes)) {
          throw new Error(`Ukuran file ${item.file.name} melebihi batas.`);
        }
      });
    });

    if (approvalAttachments.length > 0) {
      await this.replaceSignatureAttachmentFiles(
        suratId,
        signatureId,
        "approval",
        approvalAttachments
      );
    }

    if (sigInfo.requires_unit_allocation || sigInfo.action_type === "unit_allocation") {
      const incomingUnits = options.unitAllocation?.units ?? [];
      const units = incomingUnits.length > 0
        ? incomingUnits
        : Array.isArray(persistedVerificationDraft?.allocated_units)
          ? persistedVerificationDraft.allocated_units
          : [];
      const requestedProject = formInputData?.requested_project || {};
      const project = requestedProject?.code
        ? requestedProject
        : options.unitAllocation?.project || persistedVerificationDraft?.allocated_project;
      if (formInputData?.request_mode !== "unit") throw new Error("Dokumen ini bukan pengajuan unit.");
      if (!project?.code) throw new Error("Project unit wajib dipilih.");
      if (options.unitAllocation?.project?.code && requestedProject?.code && options.unitAllocation.project.code !== requestedProject.code) {
        throw new Error("Proyek unit tidak boleh diubah. Buat pengajuan baru jika proyek salah.");
      }
      if (!Array.isArray(units) || units.length < 1) throw new Error("Pilih minimal 1 unit.");

      formInputData = {
        ...formInputData,
        allocated_project: project,
        allocated_units: units,
        allocated_unit_count: units.length,
        allocated_by_signature_id: signatureId,
        allocated_at: new Date().toISOString(),
      };

      const unitRecapAttachment = this.createUnitRecapAttachment(project, units);
      const productionCodeAttachment = this.createProductionCodeAttachment(project, units);
      await this.replaceSignatureAttachmentFiles(
        suratId,
        signatureId,
        "unit_allocation",
        [
          { key: "rekap_adendum_unit", label: "Rekap Adendum Unit", file: unitRecapAttachment },
          { key: "kode_produksi_unit", label: "Kode Produksi Unit", file: productionCodeAttachment },
        ]
      );

    }

    const rpcPayload =
      sigInfo.requires_unit_allocation || sigInfo.action_type === "unit_allocation"
        ? {
            allocated_project: formInputData?.allocated_project,
            allocated_units: formInputData?.allocated_units ?? [],
            allocated_unit_count: formInputData?.allocated_unit_count,
          }
        : {};

    const { data, error } = await supabase.rpc("verify_surat_signature_v2", {
      p_sig_id: signatureId,
      p_note: note,
      p_payload: rpcPayload,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gagal menyimpan pemeriksaan data.");
    if (sigInfo.user_id) {
      const link = `/surat/inbox?task=${signatureId}`;
      const message = `Surat "${suratFresh.judul_surat}" sudah diperiksa dan siap ditindaklanjuti`;
      this.sendNotification(
        [sigInfo.user_id],
        "Pemeriksaan Selesai",
        message,
        link,
        { surat_id: suratId, signature_id: signatureId, event_type: "verification_done", type: "info" }
      );
    }
    return true;
  },

  async requestVerificationRevision(signatureId: string, note: string) {
    const { data, error } = await supabase.rpc("request_surat_signature_verification_revision", {
      p_sig_id: signatureId,
      p_note: note,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gagal mengembalikan ke tim pemeriksa.");
    return true;
  },

  async saveVerificationDraft(signatureId: string, payload: Record<string, any>, note?: string) {
    const { data, error } = await supabase.rpc("save_surat_verification_draft", {
      p_sig_id: signatureId,
      p_payload: payload || {},
      p_note: note || "",
    });
    if (error) throw new Error(error.message);
    return data;
  },

  async requestProcessRevision(input: {
    suratId: string;
    signatureId?: string | null;
    targetType: "requester" | "checker" | "signer" | "recommendation";
    targetStep?: number | null;
    reason: string;
    changes?: Record<string, any>;
  }) {
    const { data, error } = await supabase.rpc("request_surat_process_revision", {
      p_surat_id: input.suratId,
      p_sig_id: input.signatureId || null,
      p_target_type: input.targetType,
      p_target_step: input.targetStep ?? null,
      p_reason: input.reason,
      p_changes: input.changes || {},
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gagal mengembalikan proses.");
    return data as string;
  },

  async resolveProcessRevision(eventId: string, note: string = "") {
    const { data, error } = await supabase.rpc("resolve_surat_process_revision", {
      p_event_id: eventId,
      p_note: note,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gagal menyelesaikan perbaikan.");
    return true;
  },

  async acceptProcessRevision(eventId: string, note: string = "") {
    const { data, error } = await supabase.rpc("accept_surat_process_revision", {
      p_event_id: eventId,
      p_note: note,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gagal melanjutkan pengajuan setelah perbaikan.");
    return true;
  },

  async cancelAfterRevision(eventId: string, note: string) {
    const { data, error } = await supabase.rpc("cancel_surat_after_revision", {
      p_event_id: eventId,
      p_note: note,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gagal membatalkan pengajuan.");
    return true;
  },

  async getRevisionHistory(suratId: string) {
    const { data, error } = await supabase.rpc("get_surat_revision_history", {
      p_surat_id: suratId,
    });
    if (error) {
      if (error.code === "42883" || error.code === "42P01") return [];
      throw new Error(error.message);
    }
    return data || [];
  },

  async getMyInbox(userId: string) {
    const selectQuery = `
        id, role_name, label_jabatan, step_order, is_signed, surat_id, user_id, requires_unit_allocation, action_type,
        attachment_requirements_snapshot, available_at, signer_snapshot,
        verification_required, verification_status, verified_at, verified_by, verification_note, verifier_snapshot,
        surat_registrasi!inner (
          *,
          surat_attachments ( id, file_url, file_name, file_type, file_size, stage, requirement_key, requirement_label, signature_id ),
          surat_signatures (
            id, step_order, is_signed, status, role_name, label_jabatan, signed_at, catatan,
            available_at, signer_snapshot, verification_required, verification_status, verified_at, verified_by, verification_note, verifier_snapshot,
            profiles:user_id ( full_name, job_title )
          )
        )
      `;
    const [signerRes, verifierRes] = await Promise.all([
      supabase
      .from("surat_signatures").select(`
        ${selectQuery}
      `)
      .eq("user_id", userId).eq("is_signed", false),
      supabase
        .from("surat_signatures")
        .select(selectQuery)
        .eq("is_signed", false)
        .eq("verification_required", true)
        .filter("verifier_snapshot", "cs", JSON.stringify([{ user_id: userId }])),
    ]);
    if (signerRes.error) throw signerRes.error;
    if (verifierRes.error) throw verifierRes.error;

    const rows = [
      ...((signerRes.data || []) as any[]).map((item) => ({ ...item, task_type: "approval" })),
      ...((verifierRes.data || []) as any[]).map((item) => ({ ...item, task_type: "verification" })),
    ];
    const seen = new Set<string>();
    return rows.map((sig: any) => {
      const surat = Array.isArray(sig.surat_registrasi) ? sig.surat_registrasi[0] : sig.surat_registrasi;
      if (!surat) return null;
      const suratStatus = String(surat.status || "").toUpperCase();
      const activeRevision = surat?.data_snapshot?.revision || {};
      const revisionTargetIds = Array.isArray(activeRevision.target_user_ids) ? activeRevision.target_user_ids : [];
      const isRevisionCheckerTask = suratStatus === "MENUNGGU_PERBAIKAN" &&
        activeRevision.target_type === "checker" &&
        revisionTargetIds.includes(userId) &&
        sig.task_type === "verification" &&
        Number(sig.step_order) === Number(activeRevision.target_step || sig.step_order);
      const isRevisionSignerTask = suratStatus === "MENUNGGU_PERBAIKAN" &&
        activeRevision.target_type === "signer" &&
        revisionTargetIds.includes(userId) &&
        sig.user_id === userId &&
        Number(sig.step_order) === Number(activeRevision.target_step || sig.step_order);
      if (suratStatus === "MENUNGGU_PERBAIKAN") {
        if (!isRevisionCheckerTask && !isRevisionSignerTask) return null;
      } else if (Number(sig.step_order) !== Number(surat.current_step)) {
        return null;
      } else if (sig.task_type === "verification" && sig.verification_status === "verified") {
        return null;
      }
      const key = `${sig.task_type}:${sig.id}`;
      if (seen.has(key)) return null;
      seen.add(key);
      surat.surat_signatures = [...(surat.surat_signatures || [])]
        .sort((a: any, b: any) => Number(a.step_order) - Number(b.step_order));
      return { ...sig, surat_registrasi: surat };
    }).filter(Boolean);
  },

  async getMyInboxCompact(params: { limit?: number; cursor?: string; search?: string; request_category?: string; task_type?: string } = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Unauthorized");
    const qs = new URLSearchParams();
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.cursor) qs.set("cursor", params.cursor);
    if (params.search) qs.set("search", params.search);
    if (params.request_category) qs.set("request_category", params.request_category);
    if (params.task_type) qs.set("task_type", params.task_type);
    const response = await fetch(`/api/surat/inbox?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.error || "Gagal memuat inbox."));
    return payload as {
      items: any[];
      total: number;
      hasMore: boolean;
      nextCursor: string | null;
      pageSize: number;
    };
  },

  async getMyInboxDetail(signatureId: string) {
    if (!signatureId) throw new Error("signature ID wajib diisi");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Unauthorized");
    const response = await fetch(`/api/surat/inbox/${encodeURIComponent(signatureId)}/detail`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.error || "Gagal memuat detail task."));
    return payload as any;
  },

  async getLinkedDocuments(parentSuratId: string): Promise<LinkedSuratDocument[]> {
    if (!parentSuratId) return [];
    const { data, error } = await supabase.rpc("get_surat_linked_documents", {
      p_parent_surat_id: parentSuratId,
    });
    if (error) throw new Error(error.message);
    return (data || []) as LinkedSuratDocument[];
  },

  async linkRecommendationDocument(
    parentSuratId: string,
    childSuratId: string,
    requiredBeforeStep?: number | null
  ): Promise<LinkedSuratDocument> {
    const { data, error } = await supabase.rpc("link_surat_recommendation", {
      p_parent_surat_id: parentSuratId,
      p_child_surat_id: childSuratId,
      p_required_before_step: requiredBeforeStep ?? null,
    });
    if (error) throw new Error(error.message);
    return data as LinkedSuratDocument;
  },

  async uploadFile(file: File) {
    const filePath = `dokumen/${Date.now()}_${file.name}`;
    const uploaded = await appStorageService.upload({ bucket: "dokumen_surat", path: filePath, file });
    return uploaded.publicUrl;
  },

  async replaceSignatureAttachmentFiles(
    suratId: string,
    signatureId: string,
    stage: string,
    attachments: Array<{ key: string; label?: string; file: File }>
  ) {
    if (attachments.length === 0) return [];

    const { data: { session } } = await supabase.auth.getSession({ force: true });
    if (!session) throw new Error("Tidak terautentikasi");

    const formData = new FormData();
    formData.set("suratId", suratId);
    formData.set("signatureId", signatureId);
    formData.set("stage", stage);
    formData.set("metadata", JSON.stringify(attachments.map(item => ({
      fileName: item.file.name,
      key: item.key,
      label: item.label || item.key,
    }))));
    attachments.forEach(item => formData.append("files", item.file));

    let response: Response;
    try {
      response = await fetch("/api/surat/attachments/replace", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });
    } catch (error: any) {
      throw new Error(
        error?.message === "Failed to fetch" || error?.message === "fetch failed"
          ? "Server lampiran tidak bisa dihubungi."
          : error?.message || "Gagal mengganti lampiran."
      );
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "Gagal mengganti lampiran.");
    return payload || [];
  },

  async uploadAttachmentFiles(
    suratId: string,
    files: File[],
    userId?: string,
    meta: {
      stage?: string;
      signature_id?: string;
      requirements?: Record<string, { key?: string; label?: string }>;
    } = {}
  ) {
    const rows = await Promise.all(files.filter(Boolean).map(async (file, index) => {
      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const filePath = `lampiran_${suratId}/${Date.now()}_${index}_${safeName}`;
      const uploaded = await appStorageService.upload({ bucket: "lampiran_surat", path: filePath, file });
      const requirement = meta.requirements?.[file.name] || {};
      return {
        surat_id: suratId,
        file_url: uploaded.publicUrl,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
        created_by: userId ?? null,
        stage: meta.stage || "initial",
        requirement_key: requirement.key || null,
        requirement_label: requirement.label || null,
        signature_id: meta.signature_id || null,
      };
    }));

    if (rows.length === 0) return [];

    const { data, error } = await supabase
      .from("surat_attachments")
      .insert(rows)
      .select("*");
    if (error) throw error;
    return data || [];
  },

  async getAllSurat(userId?: string): Promise<SuratRegistrasi[]> {
    let query = supabase.from("surat_registrasi")
      .select(`*, surat_signatures (*, profiles:user_id (full_name)), surat_attachments ( id, file_url, file_name, file_type, file_size, stage, requirement_key, requirement_label, signature_id )`).order("created_at", { ascending: false });
    if (userId) query = query.eq("created_by", userId);
    const { data } = await query;
    return (data || []).map((s: any) => ({
      ...s, surat_signatures: s.surat_signatures?.sort((a: any, b: any) => a.step_order - b.step_order) || []
    })) as SuratRegistrasi[];
  },

  async getMasterData() {
    const response = await fetch("/api/surat/master-data", {
      credentials: "same-origin",
      headers: { "X-SIGAP-Client": "web" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payload?.error || payload?.message || "Gagal memuat data awal permohonan."));
    }
    const departmentLetterTypes = Array.isArray(payload.departmentLetterTypes)
      ? payload.departmentLetterTypes
      : [];
    const typeDepartmentMap = new Map<string, string[]>();
    const typeSortMap = new Map<string, number>();
    const typeDepartmentSortMap = new Map<string, Record<string, number>>();
    departmentLetterTypes.forEach((row: any) => {
      if (!row.letter_type_id || !row.dept_id) return;
      const ids = typeDepartmentMap.get(row.letter_type_id) || [];
      ids.push(row.dept_id);
      typeDepartmentMap.set(row.letter_type_id, ids);
      if (!typeSortMap.has(row.letter_type_id)) typeSortMap.set(row.letter_type_id, row.sort_index ?? 999);
      typeDepartmentSortMap.set(row.letter_type_id, {
        ...(typeDepartmentSortMap.get(row.letter_type_id) || {}),
        [row.dept_id]: row.sort_index ?? 999,
      });
    });
    const letterTypes = (Array.isArray(payload.letterTypes) ? payload.letterTypes : [])
      .map((type: any) => ({
        ...type,
        departmentIds: typeDepartmentMap.get(type.id) || [],
        dept_ids: typeDepartmentMap.get(type.id) || [],
        departmentSortIndexes: typeDepartmentSortMap.get(type.id) || {},
        dept_sort_indexes: typeDepartmentSortMap.get(type.id) || {},
        department_sort_index: typeSortMap.get(type.id) ?? type.type_index ?? 999,
      }))
      .sort((a: any, b: any) => (a.department_sort_index ?? 999) - (b.department_sort_index ?? 999) || String(a.name || "").localeCompare(String(b.name || ""), "id"));
    return {
      entities: Array.isArray(payload.entities) ? payload.entities : [],
      offices: Array.isArray(payload.offices) ? payload.offices : [],
      depts: Array.isArray(payload.departments) ? payload.departments : [],
      types: letterTypes,
      users: Array.isArray(payload.users) ? payload.users : [],
      projects: Array.isArray(payload.projects) ? payload.projects : [],
      penggunaan: Array.isArray(payload.usages) ? payload.usages : [],
    };
  },



};
