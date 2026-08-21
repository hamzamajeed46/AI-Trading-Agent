const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "access_token";

// Deliberate simplification (see PLAN.md): the Bearer token lives in localStorage,
// not an httpOnly cookie, so it's readable by any JS on the page (XSS-exposed).
// Fine for a local learning project; a real deployment would want httpOnly
// cookies or a short-lived token + refresh flow instead.
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // response had no JSON body; fall back to statusText
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type User = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  country: string;
};

export type LoginResponse = User & {
  access_token: string;
  token_type: string;
};

export type SignupInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  country: string;
};

export function signup(input: SignupInput): Promise<User> {
  return apiFetch<User>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      first_name: input.firstName,
      last_name: input.lastName,
      phone_number: input.phoneNumber || null,
      country: input.country,
    }),
  });
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const result = await apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(result.access_token);
  return result;
}

export function me(): Promise<User> {
  return apiFetch<User>("/auth/me");
}

export type BrokerMode = "paper" | "live";

export type BrokerStatus = {
  connected: boolean;
  mode: BrokerMode | null;
  provider: string | null;
};

export function getBrokerStatus(): Promise<BrokerStatus> {
  return apiFetch<BrokerStatus>("/broker/status");
}

export function connectBroker(
  apiKey: string,
  secretKey: string,
  mode: BrokerMode,
): Promise<BrokerStatus> {
  return apiFetch<BrokerStatus>("/broker/connect", {
    method: "POST",
    body: JSON.stringify({ api_key: apiKey, secret_key: secretKey, mode }),
  });
}

export type Decision = "BUY" | "HOLD" | "SELL";

export type AnalyzeResponse = {
  symbol: string;
  asset_name: string | null;
  price_at_call: number;
  metrics: {
    trend_pct: number | null;
    volatility_pct: number | null;
    sma_20: number | null;
    sma_50: number | null;
  };
  rounds: number;
  bull_args: string[];
  bear_args: string[];
  decision: Decision;
  confidence: number;
  rationale: string;
};

export function analyzeSymbol(symbol: string): Promise<AnalyzeResponse> {
  // The signal graph runs a real multi-agent debate (multiple Groq calls per
  // round, up to 3 rounds) -- this routinely takes 30-90 seconds.
  return apiFetch<AnalyzeResponse>(`/analyze/${encodeURIComponent(symbol)}`, {
    method: "POST",
  });
}

export type NodeUpdate = {
  quant?: { asset_name: string | null; price_at_call: number; metrics: AnalyzeResponse["metrics"] };
  bull?: { bull_args: string[]; round: number };
  bear?: { bear_args: string[] };
  pm?: { decision: Decision; confidence: number; rationale: string };
  error?: string;
};

// Streaming counterpart to analyzeSymbol: the backend emits one
// newline-delimited JSON object per completed graph node (quant, then
// bull/bear/pm per round, possibly repeated if the debate loops), so the UI
// can render each round as it's produced instead of waiting for the whole
// graph to finish. `onUpdate` fires once per line.
export async function analyzeSymbolStream(
  symbol: string,
  onUpdate: (update: NodeUpdate) => void,
): Promise<void> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}/analyze/${encodeURIComponent(symbol)}/stream`, {
    method: "POST",
    headers,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // response had no JSON body; fall back to statusText
    }
    throw new ApiError(res.status, detail);
  }

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  function handleLine(line: string) {
    if (!line.trim()) return;
    const parsed: NodeUpdate = JSON.parse(line);
    if (parsed.error) {
      throw new ApiError(500, parsed.error);
    }
    onUpdate(parsed);
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // last entry may be an incomplete line -- keep it for next read
    for (const line of lines) handleLine(line);
  }
  if (buffer.trim()) handleLine(buffer);
}

// Phase 5: the persisted human-in-the-loop pipeline. Unlike analyzeSymbol
// (Phase 4, ephemeral preview -- always ends at the PM's verdict, never
// executes), a recommendation started here can pause mid-graph awaiting
// approval, and only a real approve call can result in a bracket order
// against the connected Alpaca account.
export type RecommendationStatus =
  | "pending_approval"
  | "hold"
  | "submitted"
  | "rejected"
  | "failed"
  | "not_executable"
  | "unknown";

export type RecommendationSummary = {
  thread_id: string;
  recommendation_id: string | null;
  symbol: string;
  asset_name: string | null;
  decision: Decision;
  confidence: number;
  rationale: string;
  proposed_qty: number | null;
  entry_price_hint: number | null;
  stop_price: number | null;
  take_profit_price: number | null;
  recommended_timeline: string | null;
  execution_status: string | null;
  execution_error: string | null;
  order_id: string | null;
  status: RecommendationStatus;
  created_at?: string | null;
};

export function startRecommendation(symbol: string): Promise<RecommendationSummary> {
  return apiFetch<RecommendationSummary>("/recommendations", {
    method: "POST",
    body: JSON.stringify({ symbol }),
  });
}

export function listRecommendations(status?: string): Promise<RecommendationSummary[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<RecommendationSummary[]>(`/recommendations${query}`);
}

export function approveRecommendation(
  threadId: string,
  note?: string,
): Promise<RecommendationSummary> {
  return apiFetch<RecommendationSummary>(`/recommendations/${encodeURIComponent(threadId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ note: note || null }),
  });
}

export function rejectRecommendation(
  threadId: string,
  note?: string,
): Promise<RecommendationSummary> {
  return apiFetch<RecommendationSummary>(`/recommendations/${encodeURIComponent(threadId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ note: note || null }),
  });
}
