// NEXT_PUBLIC_ vars are inlined at build time.
// Fall back to 8001 which is what run.py uses.
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

export interface AnalyzePayload {
  name: string;
  email: string;
  reason: string;
  user_agent?: string;
  platform?: string;
  language?: string;
  timezone?: string;
  screen_width?: number;
  screen_height?: number;
  color_depth?: number;
  hardware_concurrency?: number;
  device_memory?: number;
  touch_support?: boolean;
  cookie_enabled?: boolean;
  do_not_track?: string;
  gpu_vendor?: string;
  gpu_renderer?: string;
  webdriver?: boolean;
  canvas_hash?: string;
  plugins_count?: number;
  // New signals
  audio_hash?: string;
  audio_available?: boolean;
  webrtc_available?: boolean;
  font_count?: number;
  chrome_obj_missing?: boolean;
  stealth_detected?: boolean;
  battery_available?: boolean;
  gpu_consistency?: number;
  timezone_consistency?: number;
  mouse_entropy?: number;
  typing_delay?: number;
  scroll_events?: number;
  time_on_page?: number;
  click_variance?: number;
  click_count?: number;
}

export interface AnalyzeResult {
  visit_id: number;
  verdict: "HUMAN" | "SUSPICIOUS" | "BOT";
  bot_probability: number;
  browser_score: number;
  behavior_score: number;
  network_score: number;
  ml_probability: number;
  weights: { browser: number; network: number; behavior: number; ml: number };
  weight_profile?: string;    // e.g. "automation", "datacenter", "base"
  network_tier?: string;      // tor / vpn / proxy / datacenter / residential
  network_reasons?: string[]; // why this network score was given
}

export interface Visit {
  id: number;
  created_at: string;
  ip: string | null;
  asn: string | null;
  name: string | null;
  email: string | null;
  reason: string | null;
  user_agent: string | null;
  platform: string | null;
  language: string | null;
  timezone: string | null;
  screen_width: number | null;
  screen_height: number | null;
  color_depth: number | null;
  hardware_concurrency: number | null;
  device_memory: number | null;
  touch_support: boolean | null;
  cookie_enabled: boolean | null;
  do_not_track: string | null;
  gpu_vendor: string | null;
  gpu_renderer: string | null;
  webdriver: boolean | null;
  canvas_hash: string | null;
  plugins_count: number | null;
  audio_hash: string | null;
  audio_available: boolean | null;
  webrtc_available: boolean | null;
  font_count: number | null;
  chrome_obj_missing: boolean | null;
  stealth_detected: boolean | null;
  battery_available: boolean | null;
  gpu_consistency: number | null;
  timezone_consistency: number | null;
  mouse_entropy: number | null;
  typing_delay: number | null;
  scroll_events: number | null;
  time_on_page: number | null;
  browser_score: number | null;
  behavior_score: number | null;
  network_score: number | null;
  ml_probability: number | null;
  bot_probability: number | null;
  verdict: string | null;
}

export interface PaginatedVisits {
  total: number;
  page: number;
  page_size: number;
  items: Visit[];
}

export async function analyze(payload: AnalyzePayload): Promise<AnalyzeResult> {
  const res = await fetch(`${API}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // FastAPI validation errors return detail as an array of objects
    const detail = (err as { detail?: unknown }).detail;
    if (Array.isArray(detail)) {
      throw new Error(detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join(", "));
    }
    throw new Error(typeof detail === "string" ? detail : `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchVisits(
  page = 1,
  pageSize = 20,
  verdict?: string
): Promise<PaginatedVisits> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (verdict) params.set("verdict", verdict);

  const res = await fetch(`${API}/visits?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchVisit(id: number): Promise<Visit> {
  const res = await fetch(`${API}/visits/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
