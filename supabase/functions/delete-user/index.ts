import { createClient } from "jsr:@supabase/supabase-js@2.110.7";

const ALLOWED_ORIGINS = new Set([
  "https://korepetycje-tyburczy.pl",
  "https://www.korepetycje-tyburczy.pl",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const origin = req.headers.get("Origin") ?? "";

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json({ error: "Origin niedozwolony." }, 403, cors);
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ error: "Dozwolona jest tylko metoda POST." }, 405, cors);
  }
  if (!(req.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) {
    return json({ error: "Wymagany jest Content-Type application/json." }, 415, cors);
  }

  try {
    const authMatch = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i);
    const token = authMatch?.[1]?.trim();
    if (!token) return json({ error: "Brak tokenu autoryzacji." }, 401, cors);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      console.error("delete-user: missing Supabase environment variables");
      return json({ error: "Funkcja nie jest poprawnie skonfigurowana." }, 500, cors);
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: "Nieprawidlowa lub wygasla sesja." }, 401, cors);
    }
    const callerId = userData.user.id;

    const { data: callerProfile, error: callerError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();
    if (callerError) {
      console.error("delete-user: caller profile lookup failed", callerError);
      return json({ error: "Nie udalo sie zweryfikowac uprawnien." }, 500, cors);
    }
    if (callerProfile.role !== "admin") {
      return json({ error: "Tylko administrator moze usuwac konta." }, 403, cors);
    }

    const contentLength = Number(req.headers.get("Content-Length") ?? "0");
    if (contentLength > 2048) return json({ error: "Zbyt duze zadanie." }, 413, cors);

    const body: unknown = await req.json().catch(() => null);
    const userId = typeof body === "object" && body !== null && "userId" in body
      ? (body as { userId?: unknown }).userId
      : null;
    if (typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
      return json({ error: "Nieprawidlowy identyfikator uzytkownika." }, 400, cors);
    }
    if (userId === callerId) {
      return json({ error: "Nie mozesz usunac wlasnego konta." }, 400, cors);
    }

    const { data: targetProfile, error: targetError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (targetError) {
      console.error("delete-user: target profile lookup failed", targetError);
      return json({ error: "Nie udalo sie odczytac usuwanego konta." }, 500, cors);
    }
    if (!targetProfile) return json({ error: "Konto nie istnieje." }, 404, cors);

    if (targetProfile.role === "admin") {
      const { count, error: countError } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (countError) {
        console.error("delete-user: admin count failed", countError);
        return json({ error: "Nie udalo sie sprawdzic kont administratorow." }, 500, cors);
      }
      if ((count ?? 0) <= 1) {
        return json({ error: "Nie mozna usunac ostatniego administratora." }, 409, cors);
      }
    }

    // The database migration adds cascading foreign keys. Deleting auth.users
    // is then one database transaction: any FK problem aborts the whole delete
    // instead of leaving a partially removed account.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("delete-user: Auth deletion failed", deleteError);
      return json({ error: "Nie udalo sie usunac konta." }, 500, cors);
    }

    return json({ success: true }, 200, cors);
  } catch (error) {
    console.error("delete-user: unexpected error", error);
    return json({ error: "Wystapil nieoczekiwany blad serwera." }, 500, cors);
  }
});

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
