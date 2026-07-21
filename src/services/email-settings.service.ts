import { supabase } from "@/lib/supabase";

export type EmailFileMode = "secure_link" | "attachment";

export type EmailSettingsConfig = {
  enabled: boolean;
  inherit_global: boolean;
  app_url: string;
  recipients: {
    user: boolean;
    department: boolean;
    office: boolean;
  };
  privacy: {
    include_nik: boolean;
  };
  files: {
    main_pdf: EmailFileMode;
    initial_attachments: EmailFileMode;
    approval_attachments: EmailFileMode;
    max_total_attachment_mb: number;
  };
  link_ttl_hours: number;
};

const runtimeAppUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";

export const defaultEmailSettings: EmailSettingsConfig = {
  enabled: true,
  inherit_global: true,
  app_url: runtimeAppUrl,
  recipients: {
    user: true,
    department: true,
    office: true,
  },
  privacy: {
    include_nik: false,
  },
  files: {
    main_pdf: "secure_link",
    initial_attachments: "secure_link",
    approval_attachments: "secure_link",
    max_total_attachment_mb: 15,
  },
  link_ttl_hours: 72,
};

export const normalizeEmailSettings = (value: any): EmailSettingsConfig => {
  const raw = typeof value === "string" ? (() => {
    try { return JSON.parse(value || "{}"); } catch { return {}; }
  })() : (value || {});

  const normalizeMode = (mode: any): EmailFileMode =>
    mode === "attachment" ? "attachment" : "secure_link";

  return {
    enabled: raw.enabled !== false,
    inherit_global: raw.inherit_global !== false,
    app_url: String(runtimeAppUrl || raw.app_url || defaultEmailSettings.app_url).trim().replace(/\/+$/, ""),
    recipients: {
      user: raw.recipients?.user !== false,
      department: raw.recipients?.department !== false,
      office: raw.recipients?.office !== false,
    },
    privacy: {
      include_nik: raw.privacy?.include_nik === true,
    },
    files: {
      main_pdf: normalizeMode(raw.files?.main_pdf),
      initial_attachments: normalizeMode(raw.files?.initial_attachments),
      approval_attachments: normalizeMode(raw.files?.approval_attachments),
      max_total_attachment_mb: Math.max(Number(raw.files?.max_total_attachment_mb || 15), 1),
    },
    link_ttl_hours: Math.max(Number(raw.link_ttl_hours || 72), 1),
  };
};

export const emailSettingsService = {
  async getGlobal() {
    const { data, error } = await supabase
      .from("system_email_settings")
      .select("*")
      .eq("id", "global")
      .maybeSingle();
    if (error) throw error;
    return normalizeEmailSettings(data?.config);
  },

  async saveGlobal(config: EmailSettingsConfig) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("system_email_settings")
      .upsert({
        id: "global",
        config,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });
    if (error) throw error;
  },
};
