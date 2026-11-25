import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPublicSupabaseConfig } from "@/lib/supabase-config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = getPublicSupabaseConfig();
  const adminEmail = process.env.ADMIN_EMAIL;
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!config) {
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  }
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
      name: "포카 수집가",
      avatarUrl: null,
    },
    isAdmin:
      Boolean(adminEmail && data.user.email) &&
      data.user.email!.toLocaleLowerCase() === adminEmail!.toLocaleLowerCase(),
  });
}
