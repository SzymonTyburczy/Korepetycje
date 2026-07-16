// Publiczna konfiguracja klienta Supabase.
// Schemat i polityki bazy są wersjonowane w supabase/migrations/.
const SUPABASE_URL = "https://joxezxwwzelpmqjawwmb.supabase.co";
const SUPABASE_ANON_KEY =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpveGV6eHd3emVscG1xamF3d21iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjU2MDYsImV4cCI6MjA4OTYwMTYwNn0.TOQNslNUVG9fiFytfHT8S61Zpowl0Il61_nXm6IYIEk";

// Inicjalizacja klienta Supabase
let supabaseClient;
let supabaseInitPromise;

// ── "ZAPAMIĘTAJ MNIE" ──
// Checkbox na login.html decyduje o magazynie i limicie:
//  - zaznaczony  → localStorage, max REMEMBER_DAYS dni (potem wymuszone wylogowanie)
//  - odznaczony  → sessionStorage (znika po zamknięciu przeglądarki/karty)
const REMEMBER_FLAG_KEY  = 'korepetycje-remember';
const REMEMBER_UNTIL_KEY = 'korepetycje-remember-until';
const REMEMBER_DAYS      = 14;
const AUTH_STORAGE_KEY   = 'korepetycje-auth';

function setRememberMe(remember) {
  if (remember) {
    localStorage.setItem(REMEMBER_FLAG_KEY, '1');
    localStorage.setItem(
      REMEMBER_UNTIL_KEY,
      String(Date.now() + REMEMBER_DAYS * 24 * 60 * 60 * 1000)
    );
  } else {
    localStorage.setItem(REMEMBER_FLAG_KEY, '0');
    localStorage.removeItem(REMEMBER_UNTIL_KEY);
  }
}

function clearRememberMeta() {
  localStorage.removeItem(REMEMBER_FLAG_KEY);
  localStorage.removeItem(REMEMBER_UNTIL_KEY);
}

function chosenAuthStorage() {
  return localStorage.getItem(REMEMBER_FLAG_KEY) === '0' ? sessionStorage : localStorage;
}

// Adapter supabase-js — magazyn wybierany przy każdym odczycie/zapisie,
// więc checkbox tuż przed logowaniem działa od razu.
const rememberAwareStorage = {
  getItem: (key) => chosenAuthStorage().getItem(key),
  setItem: (key, value) => {
    chosenAuthStorage().setItem(key, value);
    const other = chosenAuthStorage() === localStorage ? sessionStorage : localStorage;
    other.removeItem(key);
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

// Wymusza limit REMEMBER_DAYS dla sesji "Zapamiętaj mnie".
async function enforceRememberExpiry() {
  const flag = localStorage.getItem(REMEMBER_FLAG_KEY);
  const hasLocalSession = !!localStorage.getItem(AUTH_STORAGE_KEY);

  // Sesja w sessionStorage (bez "Zapamiętaj") — przeglądarka sama ją czyści.
  if (flag === '0') return;

  // Stara sesja w localStorage bez limitu albo minął termin → wyloguj lokalnie.
  if (hasLocalSession && (flag === null || flag === '1')) {
    const until = Number(localStorage.getItem(REMEMBER_UNTIL_KEY) || 0);
    if (!until || Date.now() > until) {
      clearRememberMeta();
      localStorage.removeItem(AUTH_STORAGE_KEY);
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      if (supabaseClient) {
        try { await supabaseClient.auth.signOut({ scope: 'local' }); } catch (_) { /* ignore */ }
      }
    }
  }
}

function initSupabase() {
  if (supabaseInitPromise) return supabaseInitPromise;
  if (!window.supabase?.createClient) {
    console.error('Biblioteka Supabase nie jest załadowana. Dodaj tag <script> z CDN w <head>.');
    return Promise.reject(new Error('Supabase not loaded'));
  }
  // Najpierw wyczyść przeterminowaną sesję, dopiero potem twórz klienta
  // (createClient od razu czyta magazyn do pamięci).
  supabaseInitPromise = Promise.resolve().then(async () => {
    await enforceRememberExpiry();
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        storageKey: AUTH_STORAGE_KEY,
        storage: rememberAwareStorage,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      }
    });
    return supabaseClient;
  });
  return supabaseInitPromise;
}
// ── AUTH HELPERS ──

async function getCurrentUser() {
	const db = await initSupabase(); // Upewniamy się, że klient jest gotowy
	const {
		data: { user },
		error,
	} = await db.auth.getUser();
	if (error) throw error;
	return user;
}

async function getCurrentProfile() {
	const user = await getCurrentUser();
	if (!user) return null;
	const { data, error } = await supabaseClient
		.from("profiles")
		.select("id, email, full_name, phone, role, avatar_url, created_at")
		.eq("id", user.id)
		.single();
	if (error && error.code !== "PGRST116") throw error;
	if (!data) {
		// Sesja bez profilu (np. usunięty użytkownik) — wyloguj, żeby uniknąć pętli login ↔ dashboard.
		await supabaseClient.auth.signOut({ scope: "local" });
	}
	return data;
}

async function signOut() {
	clearRememberMeta();
	await supabaseClient.auth.signOut();
	window.location.href = "/";
}

// ── REDIRECT GUARD ──
// Wywołaj na stronach wymagających logowania
async function requireAuth(requiredRole = null) {
	await initSupabase();
	const profile = await getCurrentProfile();
	if (!profile) {
		window.location.href = "login.html";
		return null;
	}
	if (
		requiredRole &&
		profile.role !== requiredRole &&
		profile.role !== "admin"
	) {
		window.location.href = "dashboard.html";
		return null;
	}
	return profile;
}
