type BffError = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
  name?: string;
};

type BffResult<T = any> = {
  data: T | null;
  error: BffError | null;
  count?: number | null;
  status?: number;
  statusText?: string;
};

type QueryOperation = { method: string; args: any[] };
type AuthListener = (event: string, session: any | null) => void;

const clearLegacySupabaseSessions = () => {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    Object.keys(storage)
      .filter((key) => /^sb-[a-z0-9]+-auth-token/i.test(key) || key === 'sb-registration-temp')
      .forEach((key) => storage.removeItem(key));
  }
};

clearLegacySupabaseSessions();

const authListeners = new Set<AuthListener>();
const activeChannels = new Set<RealtimeChannel>();
let cachedSession: any | null = null;
let sessionRequest: Promise<any | null> | null = null;
let sessionCheckedAt = 0;
let sessionLoadError: BffError | null = null;
let authBroadcast: BroadcastChannel | null = null;

const normalizeError = (value: any, fallback: string): BffError => ({
  message: String(value?.message || value?.error || fallback),
  ...(value?.details ? { details: String(value.details) } : {}),
  ...(value?.hint ? { hint: String(value.hint) } : {}),
  ...(value?.code ? { code: String(value.code) } : {}),
  ...(value?.name ? { name: String(value.name) } : {}),
});

const requestJson = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      'X-SIGAP-Client': 'web',
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw normalizeError(payload, `Request gagal (${response.status})`);
  return payload;
};

const notifyAuth = (event: string, session: any | null, broadcast = true) => {
  cachedSession = session;
  sessionCheckedAt = Date.now();
  sessionLoadError = null;
  authListeners.forEach((listener) => listener(event, session));
  if (broadcast) authBroadcast?.postMessage({ event });
};

const loadSession = async (force = false, emitAuthTransition = true) => {
  if (!force && Date.now() - sessionCheckedAt < 5_000) return cachedSession;
  if (sessionRequest) return sessionRequest;
  const hadSession = Boolean(cachedSession);
  sessionRequest = requestJson('/api/auth/session')
    .then((payload) => {
      cachedSession = payload.session || null;
      sessionCheckedAt = Date.now();
      sessionLoadError = null;
      if (emitAuthTransition && hadSession && !cachedSession) notifyAuth('SIGNED_OUT', null);
      return cachedSession;
    })
    .catch((error) => {
      cachedSession = null;
      sessionCheckedAt = Date.now();
      sessionLoadError = normalizeError(error, 'Gagal memeriksa sesi login');
      return null;
    })
    .finally(() => { sessionRequest = null; });
  return sessionRequest;
};

const refreshSessionState = async () => {
  return loadSession(true);
};

if (typeof BroadcastChannel !== 'undefined') {
  authBroadcast = new BroadcastChannel('sigap-auth');
  authBroadcast.onmessage = async (message) => {
    const session = await loadSession(true, false);
    notifyAuth(String(message.data?.event || 'TOKEN_REFRESHED'), session, false);
  };
}

class BffQueryBuilder implements PromiseLike<BffResult> {
  private readonly operations: QueryOperation[] = [];
  private requestSignal?: AbortSignal;

  constructor(
    private readonly kind: 'table' | 'rpc',
    private readonly name: string,
    private readonly args?: any,
    private readonly options?: any,
  ) {}

  private add(method: string, args: any[]) {
    this.operations.push({ method, args });
    return this;
  }

  select(...args: any[]) { return this.add('select', args); }
  insert(...args: any[]) { return this.add('insert', args); }
  update(...args: any[]) { return this.add('update', args); }
  upsert(...args: any[]) { return this.add('upsert', args); }
  delete(...args: any[]) { return this.add('delete', args); }
  eq(...args: any[]) { return this.add('eq', args); }
  neq(...args: any[]) { return this.add('neq', args); }
  gt(...args: any[]) { return this.add('gt', args); }
  gte(...args: any[]) { return this.add('gte', args); }
  lt(...args: any[]) { return this.add('lt', args); }
  lte(...args: any[]) { return this.add('lte', args); }
  like(...args: any[]) { return this.add('like', args); }
  ilike(...args: any[]) { return this.add('ilike', args); }
  is(...args: any[]) { return this.add('is', args); }
  in(...args: any[]) { return this.add('in', args); }
  contains(...args: any[]) { return this.add('contains', args); }
  containedBy(...args: any[]) { return this.add('containedBy', args); }
  overlaps(...args: any[]) { return this.add('overlaps', args); }
  match(...args: any[]) { return this.add('match', args); }
  not(...args: any[]) { return this.add('not', args); }
  or(...args: any[]) { return this.add('or', args); }
  filter(...args: any[]) { return this.add('filter', args); }
  order(...args: any[]) { return this.add('order', args); }
  limit(...args: any[]) { return this.add('limit', args); }
  range(...args: any[]) { return this.add('range', args); }
  single(...args: any[]) { return this.add('single', args); }
  maybeSingle(...args: any[]) { return this.add('maybeSingle', args); }
  csv(...args: any[]) { return this.add('csv', args); }
  throwOnError(...args: any[]) { return this.add('throwOnError', args); }
  abortSignal(signal: AbortSignal) {
    this.requestSignal = signal;
    return this;
  }

  private async execute(): Promise<BffResult> {
    try {
      return await requestJson('/api/bff/query', {
        method: 'POST',
        signal: this.requestSignal,
        body: JSON.stringify({
          kind: this.kind,
          name: this.name,
          args: this.args,
          options: this.options,
          operations: this.operations,
        }),
      });
    } catch (error) {
      return { data: null, error: normalizeError(error, 'Query gagal') };
    }
  }

  then<TResult1 = BffResult, TResult2 = never>(
    onfulfilled?: ((value: BffResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

type RealtimeBinding = {
  event: string;
  table: string;
  callback: (payload: any) => void;
};

let realtimeSource: EventSource | null = null;
let realtimeReconnectTimer: number | null = null;
let realtimeHasConnected = false;
let realtimeBackoffMs = 1_000;
const realtimeReconnectListeners = new Set<() => void>();

/**
 * Register a callback fired once after the stream (re)connects following a
 * disconnect. Providers use it to revalidate query data, because events that
 * arrived while the client was offline are lost — Supabase Realtime does not
 * replay them.
 */
export const onRealtimeReconnect = (listener: () => void): { unsubscribe: () => void } => {
  realtimeReconnectListeners.add(listener);
  return { unsubscribe: () => { realtimeReconnectListeners.delete(listener); } };
};

const notifyReconnect = () => {
  for (const listener of realtimeReconnectListeners) {
    try { listener(); } catch { /* a listener error must not break the stream */ }
  }
};

const subscribedTables = () => [...new Set(
  Array.from(activeChannels).flatMap((channel) => channel.tables()),
)].sort();

const closeRealtimeSource = () => {
  realtimeSource?.close();
  realtimeSource = null;
};

const openRealtimeSource = () => {
  closeRealtimeSource();
  if (realtimeReconnectTimer !== null) window.clearTimeout(realtimeReconnectTimer);
  realtimeReconnectTimer = null;
  const tables = subscribedTables();
  if (!tables.length || document.visibilityState !== 'visible') return;

  const source = new EventSource(`/api/events?tables=${encodeURIComponent(tables.join(','))}`);
  realtimeSource = source;
  source.addEventListener('ready', () => {
    activeChannels.forEach((channel) => channel.notifyStatus('SUBSCRIBED'));
    // Events during the offline gap are lost; revalidate after reconnect only.
    if (realtimeHasConnected) notifyReconnect();
    realtimeHasConnected = true;
    realtimeBackoffMs = 1_000;
  });
  source.addEventListener('postgres_change', (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data || '{}');
      activeChannels.forEach((channel) => channel.dispatch(payload));
    } catch {
      // A malformed event is ignored; the stream remains usable for later events.
    }
  });
  source.addEventListener('stream_error', () => {
    activeChannels.forEach((channel) => channel.notifyStatus('CHANNEL_ERROR'));
  });
  source.onerror = () => {
    if (realtimeSource !== source) return;
    closeRealtimeSource();
    if (realtimeReconnectTimer !== null) window.clearTimeout(realtimeReconnectTimer);
    // Fixed 1s..5s bounded backoff. No exponential blowup: the BFF already caps
    // stream lifetime, and a healed connection must not be delayed long.
    const delay = realtimeBackoffMs;
    realtimeBackoffMs = Math.min(realtimeBackoffMs * 2, 5_000);
    realtimeReconnectTimer = window.setTimeout(openRealtimeSource, delay);
  };
};

const scheduleRealtimeReconnect = (delay = 50) => {
  if (realtimeReconnectTimer !== null) window.clearTimeout(realtimeReconnectTimer);
  realtimeReconnectTimer = window.setTimeout(() => {
    realtimeReconnectTimer = null;
    openRealtimeSource();
  }, delay);
};

class RealtimeChannel {
  private bindings: RealtimeBinding[] = [];
  private statusCallback?: (status: string) => void;

  constructor(readonly name: string) {}

  on(_type: string, filter: { event?: string; table?: string }, callback: (payload: any) => void) {
    const table = String(filter?.table || '');
    if (table && !this.bindings.some((binding) => binding.table === table && binding.callback === callback)) {
      this.bindings.push({ event: String(filter?.event || '*'), table, callback });
    }
    return this;
  }

  subscribe(callback?: (status: string) => void) {
    this.statusCallback = callback;
    activeChannels.add(this);
    scheduleRealtimeReconnect();
    return this;
  }

  tables() {
    return this.bindings.map((binding) => binding.table);
  }

  dispatch(payload: any) {
    this.bindings.forEach((binding) => {
      if (binding.table !== payload.table) return;
      if (binding.event !== '*' && binding.event !== payload.eventType) return;
      binding.callback(payload);
    });
  }

  notifyStatus(status: string) {
    this.statusCallback?.(status);
  }

  unsubscribe() {
    activeChannels.delete(this);
    scheduleRealtimeReconnect();
    return Promise.resolve('ok');
  }
}

const auth = {
  async getSession(options?: { force?: boolean } | boolean) {
    const force = typeof options === 'boolean' ? options : Boolean(options?.force);
    const session = await loadSession(force);
    return { data: { session }, error: sessionLoadError };
  },

  async getUser(options?: { force?: boolean } | boolean) {
    const force = typeof options === 'boolean' ? options : Boolean(options?.force);
    const session = await loadSession(force);
    return { data: { user: session?.user || null }, error: sessionLoadError };
  },

  async signInWithPassword(credentials: { email: string; password: string }) {
    try {
      const payload = await requestJson('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
      notifyAuth('SIGNED_IN', payload.session || null);
      return { data: { user: payload.user || null, session: payload.session || null }, error: null };
    } catch (error) {
      return { data: { user: null, session: null }, error: normalizeError(error, 'Login gagal') };
    }
  },

  async signOut() {
    try {
      await requestJson('/api/auth/logout', { method: 'POST', body: '{}' });
      notifyAuth('SIGNED_OUT', null);
      return { error: null };
    } catch (error) {
      return { error: normalizeError(error, 'Logout gagal') };
    }
  },

  async updateUser(attributes: any) {
    try {
      const payload = await requestJson('/api/auth/update-user', { method: 'POST', body: JSON.stringify(attributes) });
      const session = await loadSession(true);
      notifyAuth('USER_UPDATED', session);
      return { data: { user: payload.user || null }, error: null };
    } catch (error) {
      return { data: { user: null }, error: normalizeError(error, 'Pembaruan pengguna gagal') };
    }
  },

  async verifyOtp(attributes: any) {
    try {
      const payload = await requestJson('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify(attributes) });
      notifyAuth('PASSWORD_RECOVERY', payload.session || null);
      return { data: { user: payload.user || null, session: payload.session || null }, error: null };
    } catch (error) {
      return { data: { user: null, session: null }, error: normalizeError(error, 'Verifikasi token gagal') };
    }
  },

  onAuthStateChange(callback: AuthListener) {
    authListeners.add(callback);
    return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } };
  },
};

export const supabase: any = {
  auth,
  from: (name: string) => new BffQueryBuilder('table', name),
  rpc: (name: string, args?: any, options?: any) => new BffQueryBuilder('rpc', name, args, options),
  channel: (name: string) => new RealtimeChannel(name),
  removeChannel: (channel: RealtimeChannel) => channel.unsubscribe(),
  removeAllChannels: async () => {
    await Promise.all(Array.from(activeChannels).map((channel) => channel.unsubscribe()));
    return 'ok';
  },
  storage: {
    from: (bucket: string) => ({
      download: async (path: string) => {
        try {
          const response = await fetch(`/api/bff/storage/file?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`, {
            credentials: 'same-origin',
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw normalizeError(payload, 'Gagal download file');
          }
          return { data: await response.blob(), error: null };
        } catch (error) {
          return { data: null, error: normalizeError(error, 'Gagal download file') };
        }
      },
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `/api/bff/storage/file?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}` },
      }),
    }),
  },
  functions: {
    invoke: async (name: string, options?: any) => {
      try {
        return await requestJson(`/api/bff/functions/${encodeURIComponent(name)}`, {
          method: 'POST',
          body: JSON.stringify({ options }),
        });
      } catch (error) {
        return { data: null, error: normalizeError(error, 'Function gagal') };
      }
    },
  },
};

window.setInterval(() => { void refreshSessionState(); }, 5 * 60_000);

// Session transitions must reopen the stream: the old session's tables and RLS
// no longer apply, and the new session may be entitled to different rows.
auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    realtimeHasConnected = false;
    closeRealtimeSource();
  } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
    realtimeHasConnected = false;
    scheduleRealtimeReconnect(0);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void refreshSessionState();
    // The source is closed while hidden; reopening also revalidates via the
    // reconnect listener because realtimeHasConnected stays true.
    scheduleRealtimeReconnect(0);
  } else {
    if (realtimeReconnectTimer !== null) window.clearTimeout(realtimeReconnectTimer);
    realtimeReconnectTimer = null;
    closeRealtimeSource();
  }
});
