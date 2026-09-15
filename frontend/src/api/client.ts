// Central API client for Buddiz. Uses EXPO_PUBLIC_BACKEND_URL and a bearer
// token stored securely. One shared in-memory token so every request carries it.
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const TOKEN_KEY = "buddiz_token";

let memToken: string | null = null;

export async function loadToken(): Promise<string | null> {
  if (memToken) return memToken;
  const t = await storage.secureGet<string>(TOKEN_KEY, "");
  memToken = t && t.length > 0 ? t : null;
  return memToken;
}

export async function setToken(token: string | null) {
  memToken = token;
  if (token) await storage.secureSet(TOKEN_KEY, token);
  else await storage.secureRemove(TOKEN_KEY);
}

export function getBaseUrl() {
  return BASE;
}

// Turn a stored image ref into an absolute URL. Seed meals use full unsplash
// URLs; uploads are stored as "/api/files/...".
export function resolveImage(ref?: string | null): string | undefined {
  if (!ref) return undefined;
  if (ref.startsWith("http")) return ref;
  return `${BASE}${ref.startsWith("/") ? "" : "/"}${ref}`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await loadToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = (data && data.detail) || (typeof data === "string" ? data : "Une erreur est survenue.");
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: any) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: any) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  raw: request,
};

// Multipart image upload. Handles web (Blob) vs native (uri object) shapes.
// Never sets Content-Type manually so the runtime adds the multipart boundary.
export async function uploadImage(uri: string): Promise<{ path: string; url: string }> {
  const { Platform } = await import("react-native");
  const token = await loadToken();
  const form = new FormData();
  const name = `photo_${Date.now()}.jpg`;
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type: "image/jpeg" } as any);
  }
  const res = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new ApiError(res.status, t || "Échec du téléversement");
  }
  return res.json();
}
