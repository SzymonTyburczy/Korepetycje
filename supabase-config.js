// ═══════════════════════════════════════════════════════
// supabase-config.js — konfiguracja Supabase
// ═══════════════════════════════════════════════════════
//
// INSTRUKCJA KONFIGURACJI:
// 1. Wejdź na https://supabase.com i utwórz darmowe konto
// 2. Kliknij "New Project" i utwórz projekt
// 3. Przejdź do Settings → API
// 4. Skopiuj "Project URL" i "anon public key"
// 5. Wklej je poniżej zamiast placeholderów
//
// SCHEMAT BAZY DANYCH (wklej w Supabase → SQL Editor):
/*
-- Tabela profili użytkowników
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  role TEXT DEFAULT 'uczen' CHECK (role IN ('uczen', 'korepetytor', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela lekcji
CREATE TABLE lessons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id),
  tutor_id UUID REFERENCES profiles(id),
  subject TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  status TEXT DEFAULT 'zaplanowana' CHECK (status IN ('zaplanowana', 'odbyta', 'odwolana', 'oczekuje')),
  notes TEXT,
  price NUMERIC(10,2),
  paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela materiałów
CREATE TABLE materials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID REFERENCES lessons(id),
  tutor_id UUID REFERENCES profiles(id),
  student_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela faktur
CREATE TABLE invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id),
  lesson_id UUID REFERENCES lessons(id),
  amount NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'oczekuje' CHECK (status IN ('oczekuje', 'oplacona', 'anulowana')),
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

-- ══════════════════════════════════════════════════════════════
--  BRAKUJĄCE TABELE (używane przez dashboard.html)
-- ══════════════════════════════════════════════════════════════

-- Przypisania uczeń ↔ korepetytor
CREATE TABLE IF NOT EXISTS student_tutor_assignments (
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  tutor_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (student_id, tutor_id)
);

-- Prywatne notatki korepetytora o uczniu (uczeń ich NIE widzi)
CREATE TABLE IF NOT EXISTS tutor_student_notes (
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  tutor_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  note       TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (student_id, tutor_id)
);

-- Notatki admina o użytkownikach (widoczne tylko dla admina)
CREATE TABLE IF NOT EXISTS admin_user_notes (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
--  FUNKCJE POMOCNICZE (SECURITY DEFINER — omijają RLS, więc nie
--  powodują nieskończonej rekurencji w politykach na profiles)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- Czy bieżący użytkownik jest przypisany do danego ucznia jako korepetytor?
CREATE OR REPLACE FUNCTION public.is_my_student(target UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_tutor_assignments
    WHERE tutor_id = auth.uid() AND student_id = target
  );
$$;

-- Czy dany korepetytor jest przypisany do bieżącego użytkownika (ucznia)?
CREATE OR REPLACE FUNCTION public.is_my_tutor(target UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_tutor_assignments
    WHERE student_id = auth.uid() AND tutor_id = target
  );
$$;

-- Reset hasła: sprawdza istnienie profilu po e-mailu (bez ujawniania danych)
CREATE OR REPLACE FUNCTION public.public_profile_exists(lookup_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = lower(lookup_email));
$$;
-- NIE dawaj GRANT anon — umożliwia enumerację e-maili.
GRANT EXECUTE ON FUNCTION public.public_profile_exists(TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════
-- UWAGA: to jest kanoniczny, spojny zestaw polityk. Jesli w bazie
-- istnieja starsze polityki pod polskimi nazwami (np. "Uzytkownik
-- widzi swoj profil", "Admin ma pelen dostep do lekcji" itd.),
-- USUN je najpierw — inaczej beda dzialac lacznie (OR) i moga
-- rozluznic dostep. Wypisz istniejace politykami:
--   SELECT schemaname, tablename, policyname FROM pg_policies ORDER BY tablename;
-- i skasuj zbedne:  DROP POLICY "<nazwa>" ON <tabela>;

ALTER TABLE profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_tutor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_student_notes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_user_notes          ENABLE ROW LEVEL SECURITY;

-- Czyszczenie (re-run friendly) — usuwa polityki o TYCH nazwach.
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;
DROP POLICY IF EXISTS "lessons_select" ON lessons;
DROP POLICY IF EXISTS "lessons_insert" ON lessons;
DROP POLICY IF EXISTS "lessons_update" ON lessons;
DROP POLICY IF EXISTS "lessons_delete" ON lessons;
DROP POLICY IF EXISTS "materials_select" ON materials;
DROP POLICY IF EXISTS "materials_write" ON materials;
DROP POLICY IF EXISTS "invoices_select" ON invoices;
DROP POLICY IF EXISTS "invoices_write" ON invoices;
DROP POLICY IF EXISTS "assignments_select" ON student_tutor_assignments;
DROP POLICY IF EXISTS "assignments_write" ON student_tutor_assignments;
DROP POLICY IF EXISTS "tutor_notes_select" ON tutor_student_notes;
DROP POLICY IF EXISTS "tutor_notes_write" ON tutor_student_notes;
DROP POLICY IF EXISTS "admin_notes_all" ON admin_user_notes;

-- ── PROFILES ──
-- Odczyt: własny profil, admin, oraz profile powiązane przypisaniem.
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (
    id = auth.uid()
    OR public.is_admin()
    OR public.is_my_student(id)   -- korepetytor widzi swoich uczniów
    OR public.is_my_tutor(id)     -- uczeń widzi swoich korepetytorów
  );
-- Aktualizacja: własny profil lub admin (zmiana roli chroniona triggerem niżej).
CREATE POLICY "profiles_update_self" ON profiles FOR UPDATE
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());
-- Usuwanie profilu: tylko admin (INSERT robi trigger handle_new_user).
CREATE POLICY "profiles_delete_admin" ON profiles FOR DELETE
  USING (public.is_admin());

-- Ochrona przed eskalacją uprawnień: zwykły użytkownik NIE może zmienić swojej roli.
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    NEW.role := OLD.role;  -- ignoruj próbę zmiany roli przez nie-admina
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_profile_role ON profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- ── LESSONS ──
CREATE POLICY "lessons_select" ON lessons FOR SELECT
  USING (student_id = auth.uid() OR tutor_id = auth.uid() OR public.is_admin());
-- INSERT: uczeń tylko prośba (oczekuje, nieopłacona) do przypisanego tutora;
--         korepetytor tylko swoich uczniów; admin — pełny dostęp.
CREATE POLICY "lessons_insert" ON lessons FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR (
      student_id = auth.uid()
      AND tutor_id IS NOT NULL
      AND public.is_my_tutor(tutor_id)
      AND status = 'oczekuje'
      AND COALESCE(paid, false) = false
      AND paid_at IS NULL
    )
    OR (
      tutor_id = auth.uid()
      AND student_id IS NOT NULL
      AND public.is_my_student(student_id)
      AND status IN ('zaplanowana', 'odbyta', 'odwolana')
      AND COALESCE(paid, false) = false
      AND paid_at IS NULL
    )
  );
CREATE POLICY "lessons_update" ON lessons FOR UPDATE
  USING (tutor_id = auth.uid() OR public.is_admin())
  WITH CHECK (tutor_id = auth.uid() OR public.is_admin());
CREATE POLICY "lessons_delete" ON lessons FOR DELETE
  USING (tutor_id = auth.uid() OR public.is_admin());

-- Blokada podmiany student_id / tutor_id przez nie-admina
CREATE OR REPLACE FUNCTION public.protect_lesson_parties()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.tutor_id IS DISTINCT FROM OLD.tutor_id THEN
      RAISE EXCEPTION 'Nie wolno zmieniac ucznia ani korepetytora lekcji.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_lesson_parties ON lessons;
CREATE TRIGGER trg_protect_lesson_parties
  BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION public.protect_lesson_parties();

-- ── MATERIALS ──
CREATE POLICY "materials_select" ON materials FOR SELECT
  USING (student_id = auth.uid() OR tutor_id = auth.uid() OR public.is_admin());
CREATE POLICY "materials_write" ON materials FOR ALL
  USING (tutor_id = auth.uid() OR public.is_admin())
  WITH CHECK (tutor_id = auth.uid() OR public.is_admin());

-- ── INVOICES ──
CREATE POLICY "invoices_select" ON invoices FOR SELECT
  USING (student_id = auth.uid() OR public.is_admin());
CREATE POLICY "invoices_write" ON invoices FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── STUDENT_TUTOR_ASSIGNMENTS ──
CREATE POLICY "assignments_select" ON student_tutor_assignments FOR SELECT
  USING (student_id = auth.uid() OR tutor_id = auth.uid() OR public.is_admin());
CREATE POLICY "assignments_write" ON student_tutor_assignments FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── TUTOR_STUDENT_NOTES (uczeń NIE ma dostępu) ──
CREATE POLICY "tutor_notes_select" ON tutor_student_notes FOR SELECT
  USING (tutor_id = auth.uid() OR public.is_admin());
-- Korepetytor moze pisac notatki tylko o PRZYPISANYCH do siebie uczniach.
CREATE POLICY "tutor_notes_write" ON tutor_student_notes FOR ALL
  USING (
    public.is_admin()
    OR (tutor_id = auth.uid() AND public.is_my_student(student_id))
  )
  WITH CHECK (
    public.is_admin()
    OR (tutor_id = auth.uid() AND public.is_my_student(student_id))
  );

-- ── ADMIN_USER_NOTES (tylko admin) ──
CREATE POLICY "admin_notes_all" ON admin_user_notes FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Trigger: automatyczny profil po rejestracji
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Migracja: data wpłaty przy lekcji (uruchom jeśli tabela lessons już istnieje)
-- ALTER TABLE lessons ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
*/

const SUPABASE_URL = "https://joxezxwwzelpmqjawwmb.supabase.co"; // np. https://abcxyz.supabase.co
const SUPABASE_ANON_KEY =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpveGV6eHd3emVscG1xamF3d21iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjU2MDYsImV4cCI6MjA4OTYwMTYwNn0.TOQNslNUVG9fiFytfHT8S61Zpowl0Il61_nXm6IYIEk"; // długi ciąg znaków

// Inicjalizacja klienta Supabase
let supabaseClient;
let supabaseInitPromise;

// async function initSupabase() {
// 	// Dynamicznie ładujemy bibliotekę Supabase
// 	if (supabaseClient) return supabaseClient; // Jeśli już istnieje, po prostu go zwróć

// 	if (!window.supabase) {
// 		await loadScript(
// 			"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js",
// 		);
// 	}
// 	supabaseClient = window.supabase.createClient(
// 		SUPABASE_URL,
// 		SUPABASE_ANON_KEY,
// 	);
// 	return supabaseClient;
// }


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
    return Promise.reject('Supabase not loaded');
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




function loadScript(src) {
	return new Promise((resolve, reject) => {
		const s = document.createElement("script");
		s.src = src;
		s.onload = resolve;
		s.onerror = reject;
		document.head.appendChild(s);
	});
}

// ── AUTH HELPERS ──

async function getCurrentUser() {
	const db = await initSupabase(); // Upewniamy się, że klient jest gotowy
	const {
		data: { user },
	} = await db.auth.getUser();
	return user;
}

async function getCurrentProfile() {
	const user = await getCurrentUser();
	if (!user) return null;
	const { data } = await supabaseClient
		.from("profiles")
		.select("*")
		.eq("id", user.id)
		.single();
	if (!data) {
		// Sesja bez profilu (np. usunięty użytkownik) — wyloguj, żeby uniknąć pętli login ↔ dashboard
		await supabaseClient.auth.signOut();
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
