const submissionDecisionRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["event_id", "document_number", "decision", "reason", "decided_at"],
  properties: {
    event_id: {
      type: "string",
      format: "uuid",
      description: "Kunci idempotensi. Gunakan UUID baru untuk setiap keputusan bisnis.",
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

export const augmentExternalOpenApi = (document, appPublicUrl) => ({
  ...document,
  info: {
    ...document.info,
    version: "2.1.0",
    description: [
      document.info?.description,
      "Dokumentasi ini juga memuat callback keputusan pengajuan pada domain aplikasi SIGAP.",
    ].filter(Boolean).join("\n\n"),
  },
  tags: [
    ...(Array.isArray(document.tags) ? document.tags : []),
    { name: "Submission Decisions", description: "Callback keputusan dari sistem departemen ke SIGAP." },
  ],
  components: {
    ...document.components,
    securitySchemes: {
      ...document.components?.securitySchemes,
      submissionDecisionBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "opaque",
        description: "Token machine-to-machine khusus submission decisions.",
      },
    },
  },
  paths: {
    ...document.paths,
    "/api/v1/submission-decisions": {
      post: {
        operationId: "applySubmissionDecision",
        summary: "Kirim keputusan pengajuan",
        description: [
          "Mengirim keputusan terminal atau permintaan revisi berdasarkan nomor dokumen.",
          "`event_id` adalah kunci idempotensi: replay payload identik berhasil, sedangkan payload berbeda dengan event yang sama ditolak HTTP 409.",
          "Field selain lima field yang didokumentasikan akan ditolak.",
        ].join("\n\n"),
        tags: ["Submission Decisions"],
        servers: [{ url: appPublicUrl, description: "SIGAP application API" }],
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
        },
      },
    },
  },
});
