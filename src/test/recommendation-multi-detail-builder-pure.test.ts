import { describe, expect, it } from "vitest";
import type {
  RecommendationMultiDetail,
  RecommendationParentItem,
} from "@sigap/shared";
import {
  buildRecommendationMultiDetail,
  createRecommendationClientId,
  createRecommendationDetail,
  recommendationActionDescription,
  recommendationMultiDetailErrors,
  syncRecommendationMultiDetailInput,
} from "@/features/surat/registration/lib/recommendation-multi-detail-builder";

describe("buildRecommendationMultiDetail pure unit tests", () => {
  const sequentialIdFactory = (prefix = "id") => {
    let count = 0;
    return () => `${prefix}-${++count}`;
  };

  it("1. one parent item recommended with one detail", () => {
    const idGen = sequentialIdFactory();
    const applicantItems = [
      {
        id: "app-1",
        nama_barang: "Laptop ThinkPad",
        jumlah: 1,
        keterangan: "Layar bergaris",
      },
    ];
    const existingInput = {
      recommendation_items: [
        {
          parent_item_id: "app-1",
          nama_barang: "ThinkPad T14 Gen 3",
          jumlah: 1,
          recommendation_action: "beli_baru",
          uraian: "Pengadaan unit baru",
          keterangan: "Butuh segera",
          lokasi: "Pusat - IT",
          pic: "Budi",
        },
      ],
    };

    const result = buildRecommendationMultiDetail(applicantItems, existingInput, idGen);

    expect(result.version).toBe(1);
    expect(result.items).toHaveLength(1);
    const parent = result.items[0];
    expect(parent.id).toBe("app-1");
    expect(parent.status).toBe("recommended");
    expect(parent.location).toBe("Pusat - IT");
    expect(parent.pic).toBe("Budi");
    expect(parent.applicant_original).toEqual({
      name: "Laptop ThinkPad",
      quantity: 1,
      notes: "Layar bergaris",
    });
    expect(parent.details).toHaveLength(1);
    expect(parent.details[0]).toMatchObject({
      action: "purchase_new",
      name: "ThinkPad T14 Gen 3",
      quantity: 1,
      description: "Pengadaan unit baru",
      notes: "Butuh segera",
    });
  });

  it("2. one parent item recommended with multiple details (via canonical model)", () => {
    const canonical: RecommendationMultiDetail = {
      version: 1,
      items: [
        {
          id: "p-1",
          order: 0,
          status: "recommended",
          rejection_reason: "",
          applicant_original: {
            name: "Server Rack",
            quantity: 1,
            notes: "Perlu upgrade",
          },
          location: "Server Room",
          pic: "Aldama",
          details: [
            {
              id: "d-1",
              order: 0,
              action: "replace",
              name: "Power Supply 850W",
              quantity: 2,
              description: "Penggantian komponen PSU",
              description_manually_edited: true,
              notes: "Redundant PSU rusak 1",
              attachments: [],
              reference_links: [],
            },
            {
              id: "d-2",
              order: 1,
              action: "service",
              name: "Fan Cleaning",
              quantity: 1,
              description: "Servis berkala",
              description_manually_edited: false,
              notes: "Pembersihan kipas server",
              attachments: [],
              reference_links: [],
            },
          ],
        },
      ],
    };

    const result = buildRecommendationMultiDetail([], { recommendation_multi_detail: canonical });

    expect(result.version).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].details).toHaveLength(2);
    expect(result.items[0].details[0].name).toBe("Power Supply 850W");
    expect(result.items[0].details[1].name).toBe("Fan Cleaning");
  });

  it("3. multiple parent items", () => {
    const idGen = sequentialIdFactory("rec");
    const applicantItems = [
      { id: "app-1", nama_barang: "Monitor", jumlah: 2 },
      { id: "app-2", nama_barang: "Keyboard Mechanical", jumlah: 1 },
      { id: "app-3", nama_barang: "Mouse Wireless", jumlah: 3 },
    ];

    const result = buildRecommendationMultiDetail(applicantItems, {}, idGen);

    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("app-1");
    expect(result.items[0].applicant_original.name).toBe("Monitor");
    expect(result.items[0].applicant_original.quantity).toBe(2);
    expect(result.items[1].id).toBe("app-2");
    expect(result.items[1].applicant_original.name).toBe("Keyboard Mechanical");
    expect(result.items[2].id).toBe("app-3");
    expect(result.items[2].applicant_original.name).toBe("Mouse Wireless");
  });

  it("4. not_recommended parent excludes details from outbound-shape expectation if applicable", () => {
    const idGen = sequentialIdFactory();
    const applicantItems = [
      { id: "app-1", nama_barang: "Printer Lama", jumlah: 1 },
    ];
    const existingInput = {
      recommendation_items: [
        {
          parent_item_id: "app-1",
          recommendation_action: "tidak_direkomendasikan",
          rejection_reason: "Masih dalam masa garansi vendor",
          lokasi: "Cabang Bandung",
          pic: "Santoso",
        },
      ],
    };

    const result = buildRecommendationMultiDetail(applicantItems, existingInput, idGen);

    expect(result.items).toHaveLength(1);
    const parent = result.items[0];
    expect(parent.status).toBe("not_recommended");
    expect(parent.rejection_reason).toBe("Masih dalam masa garansi vendor");
    expect(parent.details).toEqual([]);
  });

  it("5. location/PIC inheritance from legacy input", () => {
    const idGen = sequentialIdFactory();
    const applicantItems = [{ id: "app-1", nama_barang: "AC 1PK", jumlah: 1 }];
    const existingInput = {
      recommendation_items: [
        {
          parent_item_id: "app-1",
          lokasi: "Lantai 2 Ruang Meeting",
          pic: "Andi PIC",
        },
      ],
    };

    const result = buildRecommendationMultiDetail(applicantItems, existingInput, idGen);

    expect(result.items[0].location).toBe("Lantai 2 Ruang Meeting");
    expect(result.items[0].pic).toBe("Andi PIC");
  });

  it("6. manual description preserved", () => {
    const idGen = sequentialIdFactory();
    const applicantItems = [{ id: "app-1", nama_barang: "Scanner", jumlah: 1 }];
    const existingInput = {
      recommendation_items: [
        {
          parent_item_id: "app-1",
          recommendation_action: "service",
          uraian: "Kalibrasi optik sensor khusus",
          description_manually_edited: true,
        },
      ],
    };

    const result = buildRecommendationMultiDetail(applicantItems, existingInput, idGen);

    expect(result.items[0].details[0].description).toBe("Kalibrasi optik sensor khusus");
    expect(result.items[0].details[0].description_manually_edited).toBe(true);
  });

  it("7. attachment/reference link association preserved", () => {
    const idGen = sequentialIdFactory();
    const applicantItems = [{ id: "app-1", nama_barang: "UPS 1200VA", jumlah: 1 }];
    const existingInput = {
      recommendation_items: [
        {
          parent_item_id: "app-1",
          detail_id: "det-ups-1",
          recommendation_attachment: {
            draft_file_id: "file-ups-1",
            file_url: "https://storage.sigap.com/ups.jpg",
            file_name: "ups-rusak.jpg",
            source: "camera",
            file_size: 102400,
            file_type: "image/jpeg",
          },
          reference_link: "https://tokopedia.com/ups-1200va",
        },
      ],
    };

    const result = buildRecommendationMultiDetail(applicantItems, existingInput, idGen);

    const detail = result.items[0].details[0];
    expect(detail.id).toBe("det-ups-1");
    expect(detail.attachments).toHaveLength(1);
    expect(detail.attachments[0]).toMatchObject({
      storage_path: "https://storage.sigap.com/ups.jpg",
      caption: "ups-rusak.jpg",
      source: "camera",
    });
    expect(detail.reference_links).toHaveLength(1);
    expect(detail.reference_links[0]).toMatchObject({
      url: "https://tokopedia.com/ups-1200va",
    });
  });

  it("8. stable parent/detail IDs preserved across rebuilds", () => {
    const idGen = sequentialIdFactory();
    const applicantItems = [{ id: "app-orig-id", nama_barang: "CCTV", jumlah: 1 }];
    const existingInput = {
      recommendation_items: [
        {
          parent_item_id: "app-orig-id",
          detail_id: "detail-stable-id",
        },
      ],
    };

    const result = buildRecommendationMultiDetail(applicantItems, existingInput, idGen);

    expect(result.items[0].id).toBe("app-orig-id");
    expect(result.items[0].details[0].id).toBe("detail-stable-id");
  });

  it("9. item removed/obsolete behavior preserved if current builder handles it", () => {
    const idGen = sequentialIdFactory();
    // Parent item was removed by applicant, only 1 remains
    const applicantItems = [{ id: "app-2", nama_barang: "Item 2", jumlah: 1 }];
    const existingInput = {
      recommendation_items: [
        { parent_item_id: "app-1", nama_barang: "Item 1" },
        { parent_item_id: "app-2", nama_barang: "Item 2" },
      ],
    };

    const result = buildRecommendationMultiDetail(applicantItems, existingInput, idGen);

    // Builder maps over applicantItems length, matching legacy index
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("app-1"); // Matches index 0 of legacy
  });

  it("10. legacy-shaped input output remains identical", () => {
    const idGen = sequentialIdFactory("gen");
    const applicantItems = [
      {
        id: "item-1",
        nama: "Kursi Ergonomis",
        barang: "Kursi",
        jumlah: 4,
        catatan: "Kaki patah",
      },
    ];
    const existingInput = {
      recommendation_items: [
        {
          name: "Kursi Herman Miller",
          ganti: "true",
          keterangan: "Ganti hidrolik dan kaki",
          lokasi_pic: "Finance Office",
        },
      ],
    };

    const result = buildRecommendationMultiDetail(applicantItems, existingInput, idGen);

    expect(result.items[0]).toMatchObject({
      id: "item-1",
      status: "recommended",
      applicant_original: {
        name: "Kursi Ergonomis",
        quantity: 4,
        notes: "Kaki patah",
      },
      location: "Finance Office",
      pic: "Finance Office",
    });
    expect(result.items[0].details[0]).toMatchObject({
      action: "replace",
      name: "Kursi Herman Miller",
      description: "Penggantian komponen",
      notes: "Ganti hidrolik dan kaki",
    });
  });

  it("11. syncRecommendationMultiDetailInput updates formInputData cleanly", () => {
    const canonical: RecommendationMultiDetail = {
      version: 1,
      items: [
        {
          id: "p-1",
          order: 0,
          status: "recommended",
          rejection_reason: "",
          applicant_original: { name: "Router", quantity: 1, notes: "" },
          location: "Rak Server",
          pic: "Aldama",
          details: [
            {
              id: "d-1",
              order: 0,
              action: "purchase_new",
              name: "MikroTik CCR2004",
              quantity: 1,
              description: "Pembelian baru",
              description_manually_edited: false,
              notes: "Upgrade bandwidth",
              attachments: [],
              reference_links: [],
            },
          ],
        },
      ],
    };

    const synced = syncRecommendationMultiDetailInput({ request_category: "asset" }, canonical);

    expect(synced.recommendation_multi_detail).toEqual(canonical);
    expect(synced.recommendation_items).toBeDefined();
    expect(Array.isArray(synced.recommendation_items)).toBe(true);
  });

  it("12. createRecommendationDetail initializes default shape", () => {
    const idGen = sequentialIdFactory("det");
    const parent: RecommendationParentItem = {
      id: "p-1",
      order: 0,
      status: "recommended",
      rejection_reason: "",
      applicant_original: { name: "PC All-in-One", quantity: 1, notes: "" },
      location: "Frontdesk",
      pic: "Siti",
      details: [],
    };

    const detail = createRecommendationDetail(parent, idGen);

    expect(detail).toMatchObject({
      id: "det-1",
      order: 0,
      action: "purchase_new",
      name: "PC All-in-One",
      quantity: 1,
      description: "Pembelian baru",
      description_manually_edited: false,
      notes: "",
      attachments: [],
      reference_links: [],
    });
  });

  it("13. action descriptions match expected Indonesian mappings", () => {
    expect(recommendationActionDescription("purchase_new")).toBe("Pembelian baru");
    expect(recommendationActionDescription("replace")).toBe("Penggantian komponen");
    expect(recommendationActionDescription("service")).toBe("Servis");
  });

  it("14. validation errors for incomplete multi-detail model", () => {
    const incomplete: RecommendationMultiDetail = {
      version: 1,
      items: [
        {
          id: "p-1",
          order: 0,
          status: "recommended",
          rejection_reason: "",
          applicant_original: { name: "PC", quantity: 1, notes: "" },
          location: "",
          pic: "",
          details: [
            {
              id: "d-1",
              order: 0,
              action: "purchase_new",
              name: "",
              quantity: 0,
              description: "",
              description_manually_edited: false,
              notes: "",
              attachments: [],
              reference_links: [{ id: "l-1", order: 0, url: "invalid-url" }],
            },
          ],
        },
      ],
    };

    const errors = recommendationMultiDetailErrors(incomplete);
    expect(errors).toContain("Item 1: lokasi wajib dipilih.");
    expect(errors).toContain("Item 1: PIC wajib dipilih.");
    expect(errors).toContain("Item 1.1: nama atau spesifikasi wajib diisi.");
    expect(errors).toContain("Item 1.1: jumlah minimal 1.");
    expect(errors).toContain("Item 1.1: uraian wajib diisi.");
    expect(errors).toContain("Item 1.1: keterangan wajib diisi.");
    expect(errors).toContain("Item 1.1: lampiran gambar wajib ditambahkan.");
    expect(errors).toContain("Item 1.1: link 1 tidak valid.");
  });

  it("15. createRecommendationClientId produces unique non-empty string fallback", () => {
    const id = createRecommendationClientId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(5);
  });
});
