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

export const submissionDecisionValidationSchema = {
  ...submissionDecisionRequestSchema,
  properties: Object.fromEntries(
    Object.entries(submissionDecisionRequestSchema.properties).map(([key, value]) => {
      const { example: _example, ...validationSchema } = value;
      return [key, validationSchema];
    }),
  ),
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
    title: "SIGAP External API Docs",
    version: "2.0.0",
    description: [
      "API machine-to-machine untuk keputusan pengajuan dari sistem departemen ke SIGAP.",
      "Tukar `client_id` dan `client_secret` melalui `/api/access-token`, lalu gunakan access token berumur pendek untuk request keputusan.",
      "Request keputusan wajib membawa `Authorization`, `X-Timestamp`, dan `X-Signature` HMAC SHA-512.",
      "`event_id` tetap wajib sebagai kunci idempotensi bisnis dan tidak digantikan oleh autentikasi.",
    ].join("\n\n"),
  },
  servers: [{ url: publicUrl, description: "SIGAP External API staging" }],
  tags: [
    { name: "Authentication", description: "Pertukaran client credentials menjadi access token singkat." },
    { name: "Submission Decisions", description: "Keputusan pengajuan dari sistem departemen." },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "opaque",
        description: "Access token singkat dari `/api/access-token`.",
      },
      timestamp: { type: "apiKey", in: "header", name: "X-Timestamp", description: "Timestamp RFC3339 dalam toleransi lima menit." },
      signature: { type: "apiKey", in: "header", name: "X-Signature", description: "HMAC SHA-512 lowercase hexadecimal." },
    },
  },
  paths: {
    "/api/access-token": {
      post: {
        operationId: "generateAccessToken",
        summary: "Generate access token",
        description: "Menukar client credentials menjadi bearer access token yang berlaku 15 menit. Jangan menyimpan access token secara permanen.",
        tags: ["Authentication"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["client_id", "client_secret"],
                properties: {
                  client_id: { type: "string", minLength: 1, example: "department-system" },
                  client_secret: { type: "string", minLength: 32, format: "password" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Access token berhasil dibuat.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    data: {
                      type: "object",
                      properties: {
                        access_token: { type: "string" },
                        token_type: { type: "string", enum: ["bearer"] },
                        expires_in: { type: "string", example: "900" },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Client credentials tidak valid.", content: { "application/json": { schema: messageSchema } } },
          403: { description: "Alamat IP tidak diizinkan.", content: { "application/json": { schema: messageSchema } } },
          429: { description: "Rate limit terlampaui.", content: { "application/json": { schema: messageSchema } } },
        },
      },
    },
    "/api/v1/submission-decisions": {
      post: {
        operationId: "applySubmissionDecision",
        summary: "Kirim keputusan pengajuan",
        description: [
          "Gunakan `rejected` untuk menolak secara terminal atau `revision_required` untuk mengembalikan pengajuan kepada pemohon.",
          "`event_id` adalah kunci idempotensi: replay payload identik berhasil, sedangkan payload berbeda dengan event yang sama ditolak HTTP 409.",
          "Hash body dihitung dari raw request body yang dikirim, termasuk whitespace. Gunakan byte yang sama saat menghitung signature dan saat mengirim request.",
          "Canonical string: `METHOD:PATH_WITH_QUERY:ACCESS_TOKEN:BODY_SHA256:TIMESTAMP`. Nilai `X-Signature` adalah HMAC SHA-512 lowercase hexadecimal dengan access token sebagai key.",
        ].join("\n\n"),
        tags: ["Submission Decisions"],
        security: [{ bearerAuth: [], timestamp: [], signature: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: submissionDecisionRequestSchema },
          },
        },
        responses: {
          200: { description: "Keputusan diterapkan atau replay idempotent berhasil." },
          400: { description: "Payload tidak valid.", content: { "application/json": { schema: messageSchema } } },
          401: { description: "Access token, timestamp, atau signature tidak valid.", content: { "application/json": { schema: messageSchema } } },
          403: { description: "Alamat IP tidak diizinkan.", content: { "application/json": { schema: messageSchema } } },
          404: { description: "Nomor dokumen tidak ditemukan.", content: { "application/json": { schema: messageSchema } } },
          409: { description: "Konflik event idempotensi atau state dokumen.", content: { "application/json": { schema: messageSchema } } },
          422: { description: "Dokumen belum memenuhi prasyarat keputusan.", content: { "application/json": { schema: messageSchema } } },
          502: { description: "Backend SIGAP tidak dapat dihubungi.", content: { "application/json": { schema: messageSchema } } },
        },
      },
    },
  },
});
