import "jsr:@supabase/functions-js@^2.4.1/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

// Decode a JWT payload without signature verification. Supabase has
// already validated the token before this function runs (verify_jwt is
// on for this endpoint), so we just need to read the claims to gate on
// is_platform_admin. Browser-style atob via TextDecoder.
function decodeJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const padding = (4 - (padded.length % 4)) % 4;
    const b64 = padded + "=".repeat(padding);
    const bin = atob(b64);
    return JSON.parse(bin);
  } catch {
    return null;
  }
}

// CORS — admin-mutations is called from the browser admin panel, so it
// needs the full preflight + response-header treatment. We allow any
// origin because auth is enforced via the bearer token below; Origin is
// not a security boundary here.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "Missing bearer token" }, 401);

    const claims = decodeJwtClaims(token);
    const meta = (claims?.app_metadata as Record<string, unknown> | undefined) || {};
    if (meta.is_platform_admin !== true) {
      return jsonResponse({ error: "Forbidden: platform admin required" }, 403);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload = await req.json().catch(() => ({}));
    const action = payload?.action as string | undefined;

    switch (action) {
      case "create_org": {
        const slug = String(payload.slug || "").trim().toLowerCase();
        const name = String(payload.name || "").trim();
        if (!slug || !name) return jsonResponse({ error: "slug and name required" }, 400);
        if (!/^[a-z0-9-]+$/.test(slug)) {
          return jsonResponse({ error: "slug must be lowercase letters, numbers, hyphens" }, 400);
        }
        const { data, error } = await admin
          .from("organizations")
          .insert({ slug, name })
          .select("id, slug, name, inbound_email_key")
          .single();
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ org: data });
      }

      case "list_members": {
        const orgIds = (payload.org_ids as string[]) || [];
        if (orgIds.length === 0) return jsonResponse({ members: {} });

        const { data: rows, error } = await admin
          .from("org_members")
          .select("org_id, user_id, role")
          .in("org_id", orgIds);
        if (error) return jsonResponse({ error: error.message }, 400);

        // Hydrate emails via auth admin API. listUsers paginates; for
        // first-org-provisioning scale this single page is sufficient.
        const { data: usersList, error: usersErr } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        if (usersErr) return jsonResponse({ error: usersErr.message }, 400);
        const emailById = new Map(
          (usersList?.users || []).map((u) => [u.id, u.email || ""])
        );

        const grouped: Record<string, Array<{ user_id: string; role: string; email: string }>> = {};
        for (const r of rows || []) {
          if (!grouped[r.org_id]) grouped[r.org_id] = [];
          grouped[r.org_id].push({
            user_id: r.user_id,
            role: r.role,
            email: emailById.get(r.user_id) || "(unknown)",
          });
        }
        return jsonResponse({ members: grouped });
      }

      case "invite_member": {
        const orgId = String(payload.org_id || "");
        const email = String(payload.email || "").trim().toLowerCase();
        const password = String(payload.password || "");
        const role = String(payload.role || "manager");
        if (!orgId || !email || !password) {
          return jsonResponse({ error: "org_id, email, password required" }, 400);
        }
        if (!["owner", "manager", "kitchen_staff"].includes(role)) {
          return jsonResponse({ error: "invalid role" }, 400);
        }

        // Find or create the auth user. Re-inviting an existing user just
        // links them to the new org instead of erroring.
        const { data: existingList, error: listErr } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        if (listErr) return jsonResponse({ error: listErr.message }, 400);
        let userId = (existingList?.users || []).find(
          (u) => (u.email || "").toLowerCase() === email
        )?.id;

        if (!userId) {
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });
          if (createErr) return jsonResponse({ error: createErr.message }, 400);
          userId = created.user?.id;
        }
        if (!userId) return jsonResponse({ error: "Failed to resolve user id" }, 500);

        const { error: insertErr } = await admin
          .from("org_members")
          .insert({ org_id: orgId, user_id: userId, role });
        if (insertErr && !insertErr.message.includes("duplicate")) {
          return jsonResponse({ error: insertErr.message }, 400);
        }
        return jsonResponse({ user_id: userId, org_id: orgId, role });
      }

      case "remove_member": {
        const orgId = String(payload.org_id || "");
        const userId = String(payload.user_id || "");
        if (!orgId || !userId) return jsonResponse({ error: "org_id, user_id required" }, 400);
        const { error } = await admin
          .from("org_members")
          .delete()
          .eq("org_id", orgId)
          .eq("user_id", userId);
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ removed: true });
      }

      case "rotate_inbound_key": {
        const orgId = String(payload.org_id || "");
        if (!orgId) return jsonResponse({ error: "org_id required" }, 400);
        // Generate a fresh 32-char hex key (same shape as the column default).
        const newKey = crypto.randomUUID().replace(/-/g, "");
        const { data, error } = await admin
          .from("organizations")
          .update({ inbound_email_key: newKey })
          .eq("id", orgId)
          .select("id, inbound_email_key")
          .single();
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ org: data });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("admin-mutations error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
