import { describe, expect, it } from "vitest";
import { migratedStorageDisplayUrl } from "@/lib/storage-display-url";

describe("migration presentation URLs", () => {
  const origins = "https://old-storage.test";
  it("remaps only explicitly configured public media to the same-origin gateway", () => {
    expect(migratedStorageDisplayUrl("https://old-storage.test/storage/v1/object/public/lampiran_surat/photo.png", origins))
      .toBe("/storage/v1/object/public/lampiran_surat/photo.png");
    expect(migratedStorageDisplayUrl("https://old-storage.test/storage/v1/object/public/avatars/profile.jpg", origins))
      .toBe("/storage/v1/object/public/avatars/profile.jpg");
  });
  it("does not change saved data or unrelated/private/foreign URLs", () => {
    for (const value of ["/api/profile/avatar/file?path=test", "blob:preview", "https://vendor.test/image.jpg",
      "https://old-storage.test.evil/storage/v1/object/public/avatars/profile.jpg",
      "https://old-storage.test/storage/v1/object/sign/avatars/profile.jpg?token=private",
      "https://user:password@old-storage.test/storage/v1/object/public/avatars/profile.jpg"]) {
      expect(migratedStorageDisplayUrl(value, origins)).toBe(value);
    }
    const data = { file_url: "https://old-storage.test/storage/v1/object/public/lampiran_surat/photo.png" };
    const before = JSON.stringify(data);
    migratedStorageDisplayUrl(data.file_url, origins);
    expect(JSON.stringify(data)).toBe(before);
    expect(migratedStorageDisplayUrl(data.file_url, "")).toBe(data.file_url);
  });
});
