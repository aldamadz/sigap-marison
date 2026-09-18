/** Flow 11: external parent/dependent fields, loading, empty, and failure. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within, act, fireEvent } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  registerFetchRoute,
  getFetchCalls,
  createDeferred,
  allowServiceCalls,
  assertStrictServiceCalls,
} from "./surat-form-harness";
import {
  MASTER_DATA_DEFAULT,
  EXTERNAL_SELECT_FORM_USAGE_RAW,
  MARISON_DEPARTMENTS_RESPONSE,
  MARISON_TEAMS_RESPONSE,
} from "./surat-form-fixtures";
import {
  configureStandardMocks,
  selectLetterType,
  selectEntity,
  selectCategoryAset,
  clickGetNumber,
  mountFormWithUsage,
  selectOptionByLabel,
  findSelectTrigger,
  selectForm,
  selectUsage,
  selectFormAndUsage,
  selectCategory,
  selectCategoryUnit,
  selectCategoryNonUnit
} from "./surat-form-driver";

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
  registerFetchRoute("/api/data-sources/marison_departments/query", MARISON_DEPARTMENTS_RESPONSE);
  registerFetchRoute("/api/data-sources/marison_teams/query", MARISON_TEAMS_RESPONSE);
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "generateNoSurat",
    "createRegistrationDraft",
  );
});

afterEach(() => teardownTestHarness());

async function reachExternalForm() {
  await mountFormWithUsage(EXTERNAL_SELECT_FORM_USAGE_RAW);
  await selectFormAndUsage();
    await selectLetterType();
  await selectEntity();
  
  await clickGetNumber();
  await screen.findByText("Unit Kerja");
}

function parsedVariables(call: { init?: RequestInit }) {
  return JSON.parse(String(call.init?.body || "{}")) as { variables?: Record<string, unknown> };
}

describe("Flow 11: External dependent fields", () => {
  it("posts auth JSON to parent endpoint, then refetches dependent endpoint with selected parent", async () => {
    await reachExternalForm();
    await waitFor(() => expect(getFetchCalls("marison_departments")).toHaveLength(1));
    const parentCall = getFetchCalls("marison_departments")[0];
    expect(parentCall.init).toEqual(expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "Content-Type": "application/json", Authorization: "Bearer test-token-000000000000000000000000" }),
    }));
    expect(parsedVariables(parentCall).variables).toEqual(expect.objectContaining({ request_category: "asset" }));
    expect(getFetchCalls("marison_teams")).toHaveLength(0);

    await selectOptionByLabel(/^Unit Kerja$/i, /^Teknik$/i);
    await waitFor(() => expect(getFetchCalls("marison_teams")).toHaveLength(1));
    expect(parsedVariables(getFetchCalls("marison_teams")[0]).variables).toEqual(expect.objectContaining({
      unit_kerja: { value: "dept-1", label: "Teknik" },
    }));
    await selectOptionByLabel(/^Tim Kerja$/i, /^Tim Infrastruktur$/i);
    expect(findSelectTrigger(/^Tim Kerja$/i)).toHaveTextContent("Tim Infrastruktur");
    assertStrictServiceCalls();
  });

  it("shows loading while parent request is pending", async () => {
    const deferred = createDeferred<Response>();
    global.fetch = ((url: string, init?: RequestInit) => {
      if (url.includes("marison_departments")) return deferred.promise;
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as typeof fetch;

    await reachExternalForm();
    expect(findSelectTrigger(/^Unit Kerja$/i)).toHaveTextContent("Memuat data...");
    deferred.resolve({ ok: true, status: 200, json: async () => MARISON_DEPARTMENTS_RESPONSE } as Response);
    await waitFor(() => expect(findSelectTrigger(/^Unit Kerja$/i)).toHaveTextContent("Pilih Unit Kerja"));
    assertStrictServiceCalls();
  });

  it("keeps field usable with empty result", async () => {
    registerFetchRoute("/api/data-sources/marison_departments/query", { options: [] });
    await reachExternalForm();
    const trigger = findSelectTrigger(/^Unit Kerja$/i);
    expect(trigger).not.toBeDisabled();
    await act(async () => { fireEvent.click(trigger); });
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByText("Tim Kerja")).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("shows server failure and keeps rest of form editable", async () => {
    registerFetchRoute("/api/data-sources/marison_departments/query", { error: "Vendor unavailable" }, 500);
    await reachExternalForm();
    expect(await screen.findByText("Vendor unavailable")).toBeInTheDocument();
    expect(findSelectTrigger(/^Unit Kerja$/i)).not.toBeDisabled();
    expect(screen.getByPlaceholderText(/Isi Nama Barang/i)).not.toBeDisabled();
    assertStrictServiceCalls();
  });
});
