export function getPublicSupabaseConfig() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = process.env;
  if (!url || !key) return null;
  if (key.startsWith("sb_publishable_")) return { url, key };

  // Older Supabase projects use JWTs as their public anon keys.
  try {
    const claims = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(claims)).role === "anon" ? { url, key } : null;
  } catch {
    return null;
  }
}
