import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecommendationDecisionSummary, buildRecommendationDecisions } from "@/components/surat/RecommendationDecisionSummary";

const fixture = { items: [{
  id: "speaker",
  status: "recommended",
  applicant_original: { name: "Speaker", quantity: 1 },
  location: "Marketing",
  pic: "Andreas",
  details: [{ id: "speaker-detail", name: "Speaker Simbadda", quantity: 1, action: "purchase_new", description: "Pembelian baru" }],
}, {
  id: "headset",
  status: "not_recommended",
  applicant_original: { name: "headset", quantity: 1 },
  location: "Marketing",
  pic: "Andreas",
  rejection_reason: "Kondisi masih layak",
  details: [{ id: "stale", name: "Headset baru", action: "purchase_new", description: "Pembelian baru" }],
}] };

describe("Inbox recommendation decision summary", () => {
  it("keeps the parent rejection authoritative over stale recommendation details", () => {
    const decisions = buildRecommendationDecisions(fixture);
    expect(decisions[1]).toMatchObject({ recommended: false, rejectionReason: "Kondisi masih layak", details: [] });
  });

  it("shows the recommended replacement and a clear rejection reason", () => {
    render(<RecommendationDecisionSummary value={fixture} />);
    expect(screen.getByText("Keputusan tim rekomendasi")).toBeInTheDocument();
    expect(screen.getByText("Speaker Simbadda · 1")).toBeInTheDocument();
    expect(screen.getByText("Beli baru")).toBeInTheDocument();
    expect(screen.getByText("Tidak direkomendasikan")).toBeInTheDocument();
    expect(screen.getByText(/Kondisi masih layak/)).toBeInTheDocument();
    expect(screen.queryByText("Headset baru")).not.toBeInTheDocument();
  });
});
