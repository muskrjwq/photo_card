import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let initialization: Promise<SupabaseClient | null> | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  return browserClient;
}

export function initializeSupabaseBrowserClient() {
  if (browserClient) return Promise.resolve(browserClient);
  initialization ??= (async () => {
    try {
      const response = await fetch("/api/auth/config", { cache: "no-store" });
      if (!response.ok) return null;
      const { url, key } = await response.json() as { url: string; key: string };
      browserClient = createClient(url, key, {
        auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
      });
      return browserClient;
    } catch {
      return null;
    } finally {
      initialization = null;
    }
  })();
  return initialization;
}
