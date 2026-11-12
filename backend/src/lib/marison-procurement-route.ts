type RouteClient = {
  rpc: (name: string, args: { p_surat_id: string }) => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function getMarisonProcurementRoute(client: RouteClient, suratId: string) {
  const { data, error } = await client.rpc("marison_procurement_routing_block", { p_surat_id: suratId });
  if (error) throw error;
  if (data !== null && (typeof data !== "string" || !["finance_not_connected", "form_not_procurement", "form_identity_unavailable", "internal_goods"].includes(data))) {
    throw new Error("Identitas form untuk tujuan pengiriman belum dapat dipastikan.");
  }
  return {
    eligible: data === null,
    code: data as string | null,
    destination: data === null ? "procurement" : data === "finance_not_connected" ? "sigap_finance_pending" : "sigap",
    reason: data === null ? null : data === "finance_not_connected"
      ? "Form KEU selesai di SIGAP. Integrasi sistem Keuangan belum tersedia; tidak dikirim ke Pengadaan."
      : data === "internal_goods" ? "Permintaan Barang dari Stok GA diproses internal SIGAP; tidak dikirim ke external."
      : "Hanya form PGD dengan identitas yang valid dapat dikirim ke sistem Pengadaan.",
  };
}

export async function assertMarisonProcurementRoute(client: RouteClient, suratId: string) {
  const route = await getMarisonProcurementRoute(client, suratId);
  if (!route.eligible) throw Object.assign(new Error(route.reason!), { status: 409, code: route.code });
}
