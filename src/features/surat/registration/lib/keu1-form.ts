export const isKeu1Form = (form: { nomor_form?: string | null } | null | undefined): boolean =>
  String(form?.nomor_form ?? "").trim().toUpperCase() === "FM-UAI.KEU-01-00";
