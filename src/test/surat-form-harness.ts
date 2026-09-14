/**
 * Strict mock harness for SuratForm characterization tests.
 *
 * Design:
 * - suratService: 16 methods, each a vi.fn().
 *   DEFAULT = unresolved Promise (tests MUST configure before expecting a call).
 *   getMasterData and getActiveRegistrationDrafts are SAFE defaults (always called on mount).
 * - supabase: auth.getUser, auth.getSession, from(), channel(), removeChannel().
 *   from() returns a chainable mock. Table-specific results via registerSupabaseTable().
 * - fetch: DEFAULT = throws on unexpected URL. Register per-URL via registerFetchRoute().
 * - toast, appDialog.confirm: spies returned to the test.
 *
 * STRICT GUARD (afterEach):
 *   Any suratService method that was called but NOT in the allowlist
 *   causes the test to fail. Tests declare allowlist via allowServiceCalls().
 */

import { vi, type Mock } from "vitest";

// ─── Service Mock ───────────────────────────────────────────────
export const serviceMock = {
  getMasterData: vi.fn(),
  getActiveRegistrationDrafts: vi.fn(),
  getRegistrationDraft: vi.fn(),
  createRegistrationDraft: vi.fn(),
  saveRegistrationDraft: vi.fn(),
  voidRegistrationDraft: vi.fn(),
  finishRegistrationDraft: vi.fn(),
  generateNoSurat: vi.fn(),
  createRegistrasi: vi.fn(),
  cancelRegistration: vi.fn(),
  getRecommendationParentSummary: vi.fn(),
  completeRecommendationTask: vi.fn(),
  linkRecommendationDocument: vi.fn(),
  autoApproveRecommendationFirstStep: vi.fn(),
  uploadRegistrationDraftFiles: vi.fn(),
  deleteRegistrationDraftFile: vi.fn(),
};

// ─── Supabase Mock ─────────────────────────────────────────────
type SupabaseChain = {
  select: Mock;
  eq: Mock;
  order: Mock;
  single: Mock;
  in: Mock;
  then: (resolve: (v: { data: unknown; error: unknown }) => void) => void;
};

const tableHandlers = new Map<string, unknown>();

export function registerSupabaseTable(table: string, data: unknown) {
  tableHandlers.set(table, data);
}

function makeChain(table: string): SupabaseChain {
  const result = tableHandlers.has(table)
    ? { data: tableHandlers.get(table), error: null }
    : { data: null, error: null };
  const chain: SupabaseChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    in: vi.fn().mockReturnThis(),
    then: (resolve) => resolve(result),
  };
  return chain;
}

let channelInstance: { on: Mock; subscribe: Mock } | null = null;

export const supabaseMock = {
  auth: {
    getUser: vi.fn(),
    getSession: vi.fn(),
  },
  from: vi.fn((table: string) => makeChain(table)),
  channel: vi.fn(() => {
    channelInstance = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    };
    return channelInstance;
  }),
  removeChannel: vi.fn(),
};

// ─── Fetch Call Recording ───────────────────────────────────────
export const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

export function getFetchCalls(urlPattern?: string) {
  if (!urlPattern) return [...fetchCalls];
  return fetchCalls.filter(c => c.url.includes(urlPattern));
}

// ─── Fetch Mock ─────────────────────────────────────────────────
type FetchRoute = { response: unknown; status?: number };
const fetchRoutes = new Map<string, FetchRoute>();

export function registerFetchRoute(url: string, response: unknown, status = 200) {
  fetchRoutes.set(url, { response, status });
}

const originalFetch = global.fetch;

function mockFetch(url: string, _init?: RequestInit): Promise<Response> {
  fetchCalls.push({ url, init: _init });
  const route = fetchRoutes.get(url);
  if (!route) {
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  }
  return Promise.resolve({
    ok: (route.status ?? 200) >= 200 && (route.status ?? 200) < 300,
    status: route.status ?? 200,
    json: () => Promise.resolve(route.response),
  } as Response);
}

// ─── Toast & Dialog Mocks ───────────────────────────────────────
export const toastMock = vi.fn();
export const confirmMock = vi.fn().mockResolvedValue(true);
export const onSuccessMock = vi.fn();
export const setIsLoadingMock = vi.fn();
export const setJudulForDisplayMock = vi.fn();

// ─── Strict Call Tracking ───────────────────────────────────────
const allowedServiceCalls = new Set<string>();

export function allowServiceCalls(...names: (keyof typeof serviceMock)[]) {
  for (const name of names) allowedServiceCalls.add(name);
}

// ─── Search Params Override ────────────────────────────────────
let searchParamsOverride: URLSearchParams | null = null;

export function setSearchParamsOverride(params: URLSearchParams) {
  searchParamsOverride = params;
}

export function clearSearchParamsOverride() {
  searchParamsOverride = null;
}

// ─── Setup / Teardown ───────────────────────────────────────────
// ─── jsdom Polyfills ────────────────────────────────────────────
function installJsdomPolyfills() {
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  // ResizeObserver polyfill for cmdk (used in Popover + Command)
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  // Element.prototype.scroll polyfill for cmdk
  if (!Element.prototype.scroll) {
    Element.prototype.scroll = () => {};
  }
}

export function setupTestHarness() {
  installJsdomPolyfills();
  // Reset all mocks
  tableHandlers.clear();
  fetchRoutes.clear();
  fetchCalls.length = 0;
  allowedServiceCalls.clear();
  channelInstance = null;

  // Safe default: always called on mount
  serviceMock.getMasterData.mockResolvedValue(undefined);
  serviceMock.getActiveRegistrationDrafts.mockResolvedValue([]);

  // Supabase auth defaults
  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" } },
  });
  supabaseMock.auth.getSession.mockResolvedValue({
    data: { session: { access_token: "test-token-000000000000000000000000" } },
  });

  // Fetch mock
  global.fetch = mockFetch as typeof fetch;

  // Mock modules
  vi.doMock("@/services/surat.service", () => ({ suratService: serviceMock }));
  vi.doMock("@/lib/supabase", () => ({ supabase: supabaseMock }));
  vi.doMock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));
  vi.doMock("@/components/app/AppDialogProvider", () => ({
    useAppDialog: () => ({ confirm: confirmMock }),
  }));
  vi.doMock("react-router", () => {
    const setSearchParams = vi.fn();
    return {
      useSearchParams: () => [searchParamsOverride || new URLSearchParams(), setSearchParams],
      useNavigate: () => vi.fn(),
      useLocation: () => ({ pathname: "/", search: "", hash: "", state: null, key: "default" }),
      useParams: () => ({}),
      Outlet: ({ children }: { children?: React.ReactNode }) => children ?? null,
      BrowserRouter: ({ children }: { children?: React.ReactNode }) => children ?? null,
    };
  });
}

export function teardownTestHarness() {
  global.fetch = originalFetch;
  searchParamsOverride = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();

  // Reset all service mock implementations
  for (const fn of Object.values(serviceMock)) {
    fn.mockReset();
  }
  supabaseMock.from.mockReset();
  supabaseMock.auth.getUser.mockReset();
  supabaseMock.auth.getSession.mockReset();
  supabaseMock.channel.mockReset();
  supabaseMock.removeChannel.mockReset();
  toastMock.mockReset();
  confirmMock.mockReset().mockResolvedValue(true);
  onSuccessMock.mockReset();
  setIsLoadingMock.mockReset();
  setJudulForDisplayMock.mockReset();
}

export function assertStrictServiceCalls() {
  for (const [name, fn] of Object.entries(serviceMock)) {
    if (fn.mock.calls.length > 0 && !allowedServiceCalls.has(name)) {
      throw new Error(
        `STRICT MOCK VIOLATION: suratService.${name} was called ${fn.mock.calls.length} time(s) but not in allowlist.\n` +
        `  Calls: ${JSON.stringify(fn.mock.calls.map((c: unknown[]) => c.map(String)))}`
      );
    }
  }
}

// ─── Deferred Promise Utility ───────────────────────────────────
export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ─── Default Props Factory ──────────────────────────────────────
export function defaultProps() {
  return {
    onSuccess: onSuccessMock,
    isLoading: false,
    setIsLoading: setIsLoadingMock,
    setJudulForDisplay: setJudulForDisplayMock,
  };
}
