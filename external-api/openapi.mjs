export const submissionDecisionRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["event_id", "document_number", "decision", "reason", "decided_at"],
  properties: {
    event_id: {
      type: "string",
      format: "uuid",
      description: "Kunci idempotensi. Gunakan UUID baru untuk setiap keputusan bisnis.",
      example: "b03a2bcd-83ea-4ff8-8bb9-02829192ed85",
    },
    document_number: {
      type: "string",
      minLength: 1,
      maxLength: 160,
      pattern: "^[0-9A-Za-z./_-]+$",
      example: "041/UAI/MKT.1/VIII/2026",
    },
    decision: {
      type: "string",
      enum: ["rejected", "revision_required"],
      example: "revision_required",
    },
    reason: {
      type: "string",
      minLength: 5,
      maxLength: 1000,
      example: "Jumlah barang perlu disesuaikan.",
    },
    decided_at: {
      type: "string",
      format: "date-time",
      description: "Timestamp ISO 8601/RFC3339 yang menyertakan zona waktu.",
      example: "2026-08-18T14:00:00+07:00",
    },
  },
};

const messageSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    message: { type: "string" },
  },
};

export const buildExternalOpenApi = (publicUrl) => ({
  openapi: "3.1.0",
  info: {
    title: "SIGAP Submission Decisions API",
    version: "1.0.0",
    description: [
      "API machine-to-machine untuk keputusan pengajuan dari sistem departemen ke SIGAP.",
      "Gunakan tombol **Authorize** untuk memasukkan bearer token, lalu **Try it out** untuk menguji request.",
      "Request hanya menerima lima field yang tercantum pada schema.",
    ].join("\n\n"),
  },
  servers: [{ url: publicUrl, description: "SIGAP External API staging" }],
  tags: [{ name: "Submission Decisions", description: "Keputusan pengajuan dari sistem departemen." }],
  components: {
    securitySchemes: {
      submissionDecisionBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "opaque",
        description: "Token machine-to-machine khusus submission decisions.",
      },
    },
  },
  paths: {
    "/api/v1/submission-decisions": {
      post: {
        operationId: "applySubmissionDecision",
        summary: "Kirim keputusan pengajuan",
        description: [
          "Gunakan `rejected` untuk menolak secara terminal atau `revision_required` untuk mengembalikan pengajuan kepada pemohon.",
          "`event_id` adalah kunci idempotensi: replay payload identik berhasil, sedangkan payload berbeda dengan event yang sama ditolak HTTP 409.",
        ].join("\n\n"),
        tags: ["Submission Decisions"],
        security: [{ submissionDecisionBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: submissionDecisionRequestSchema },
          },
        },
        responses: {
          200: { description: "Keputusan diterapkan atau replay idempotent berhasil." },
          400: { description: "Payload tidak valid.", content: { "application/json": { schema: messageSchema } } },
          401: { description: "Bearer token tidak valid.", content: { "application/json": { schema: messageSchema } } },
          404: { description: "Nomor dokumen tidak ditemukan.", content: { "application/json": { schema: messageSchema } } },
          409: { description: "Konflik event idempotensi atau state dokumen.", content: { "application/json": { schema: messageSchema } } },
          422: { description: "Dokumen belum memenuhi prasyarat keputusan.", content: { "application/json": { schema: messageSchema } } },
          502: { description: "Backend SIGAP tidak dapat dihubungi.", content: { "application/json": { schema: messageSchema } } },
        },
      },
    },
  },
});
