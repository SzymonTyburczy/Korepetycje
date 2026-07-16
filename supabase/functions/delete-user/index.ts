// ═══════════════════════════════════════════════════════════════
//  Edge Function: delete-user
//  Pelne usuniecie konta uzytkownika (Auth + powiazane dane).
//
//  Dlaczego to jest potrzebne:
//  Klucz `anon` w przegladarce NIE moze usunac uzytkownika z
//  auth.users. Robi to tylko klucz `service_role`, ktory NIGDY nie
//  moze trafic do frontendu. Dlatego usuwanie robimy tutaj, na
//  serwerze, po zweryfikowaniu, ze wywolujacy jest adminem.
//
//  Wdrozenie:
//    supabase functions deploy delete-user
//  Sekrety (ustawiane automatycznie przez Supabase lub recznie):
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const ALLOWED_ORIGINS = new Set([
  "https://korepetycje-tyburczy.pl",
  "https://www.korepetycje-tyburczy.pl",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : [...ALLOWED_ORIGINS][0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const origin = req.headers.get("Origin") ?? "";
    // Przegladarka zawsze wysyla Origin przy cross-origin; odrzuc obce domeny.
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "Origin niedozwolony." }, 403, CORS);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return json({ error: "Brak tokenu autoryzacji." }, 401, CORS);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Klient z uprawnieniami serwisowymi (omija RLS).
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Kim jest wywolujacy? (weryfikacja tokenu)
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ error: "Nieprawidlowa sesja." }, 401, CORS);
    }
    const callerId = userData.user.id;

    // 2. Czy wywolujacy jest adminem?
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();
    if (callerProfile?.role !== "admin") {
      return json({ error: "Tylko administrator moze usuwac konta." }, 403, CORS);
    }

    // 3. Kogo usuwamy?
    const { userId } = await req.json().catch(() => ({ userId: null }));
    if (!userId) return json({ error: "Brak userId." }, 400, CORS);
    if (userId === callerId) {
      return json({ error: "Nie mozesz usunac wlasnego konta." }, 400, CORS);
    }

    // 4. Usun powiazane dane (RLS omijany przez service_role).
    //    Rekordy z kluczami ON DELETE CASCADE znikna przy kroku 5,
    //    ale lessons/materials/invoices czyscimy jawnie.
    await admin.from("materials").delete().or(`student_id.eq.${userId},tutor_id.eq.${userId}`);
    await admin.from("invoices").delete().eq("student_id", userId);
    await admin.from("lessons").delete().or(`student_id.eq.${userId},tutor_id.eq.${userId}`);
    await admin.from("student_tutor_assignments").delete().or(`student_id.eq.${userId},tutor_id.eq.${userId}`);
    await admin.from("tutor_student_notes").delete().or(`student_id.eq.${userId},tutor_id.eq.${userId}`);
    await admin.from("admin_user_notes").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);

    // 5. Usun z auth.users (to jest to, czego frontend nie potrafi).
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ error: "Blad usuwania z Auth: " + delErr.message }, 500, CORS);

    return json({ success: true }, 200, CORS);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500, corsHeaders(req));
  }
});

function json(body: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
