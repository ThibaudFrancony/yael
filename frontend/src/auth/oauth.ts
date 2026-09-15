// Google (Emergent-managed) + Apple sign-in helpers. The frontend only ever
// talks to our own /api/auth/session — never to Emergent directly.
import { Platform, Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as LinkingExpo from "expo-linking";
import { api } from "@/src/api/client";
import type { User } from "@/src/auth/AuthContext";

WebBrowser.maybeCompleteAuthSession();

const AUTH_BASE = "https://auth.emergentagent.com/";
const sentSessionIds = new Set<string>();

function getRedirectUrl(): string {
  if (Platform.OS === "web") {
    // must be an existing route
    return window.location.origin + "/";
  }
  return LinkingExpo.createURL("");
}

function extractSessionId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function exchange(
  sessionId: string,
  onSuccess: (token: string, user: User) => Promise<void>
): Promise<boolean> {
  if (sentSessionIds.has(sessionId)) return false;
  sentSessionIds.add(sessionId);
  const res = await api.post<{ token: string; user: User }>("/auth/session", { session_id: sessionId });
  await onSuccess(res.token, res.user);
  return true;
}

// Called on web app mount to pick up ?session_id / #session_id after redirect.
export async function processWebSession(
  onSuccess: (token: string, user: User) => Promise<void>
): Promise<boolean> {
  if (Platform.OS !== "web") return false;
  const full = window.location.href;
  const sid = extractSessionId(full);
  if (!sid) return false;
  try {
    const ok = await exchange(sid, onSuccess);
    // clean the URL (remove session_id) after success
    const clean = window.location.href.replace(/[?#&]session_id=[^&#]+/, "");
    window.history.replaceState(window.history.state, "", clean || "/");
    return ok;
  } catch {
    return false;
  }
}

export async function startGoogleLogin(
  onSuccess: (token: string, user: User) => Promise<void>
): Promise<void> {
  const redirectUrl = getRedirectUrl();
  const authUrl = `${AUTH_BASE}?redirect=${encodeURIComponent(redirectUrl)}`;

  if (Platform.OS === "web") {
    window.location.href = authUrl;
    return;
  }

  let capturedUrl: string | null = null;
  const sub = Linking.addEventListener("url", (e) => {
    capturedUrl = e.url;
  });
  try {
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    let url: string | null = null;
    if (result.type === "success" && (result as any).url) url = (result as any).url;
    if (!url && capturedUrl) url = capturedUrl;
    if (!url) url = await Linking.getInitialURL();
    const sid = extractSessionId(url);
    if (sid) await exchange(sid, onSuccess);
  } finally {
    sub.remove();
  }
}
