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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return json({ error: "Brak tokenu autoryzacji." }, 401);
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
      return json({ error: "Nieprawidlowa sesja." }, 401);
    }
    const callerId = userData.user.id;

    // 2. Czy wywolujacy jest adminem?
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();
    if (callerProfile?.role !== "admin") {
      return json({ error: "Tylko administrator moze usuwac konta." }, 403);
    }

    // 3. Kogo usuwamy?
    const { userId } = await req.json().catch(() => ({ userId: null }));
    if (!userId) return json({ error: "Brak userId." }, 400);
    if (userId === callerId) {
      return json({ error: "Nie mozesz usunac wlasnego konta." }, 400);
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
    if (delErr) return json({ error: "Blad usuwania z Auth: " + delErr.message }, 500);

    return json({ success: true });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
