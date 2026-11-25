import { getPublicSupabaseConfig } from "@/lib/supabase-config";

export const dynamic = "force-dynamic";

export function GET() {
  const config = getPublicSupabaseConfig();
  return Response.json(config ?? { error: "auth_not_configured" }, {
    status: config ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
