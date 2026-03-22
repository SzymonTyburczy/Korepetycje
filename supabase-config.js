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

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Polityki dostępu
CREATE POLICY "Użytkownik widzi swój profil" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Uczeń widzi swoje lekcje" ON lessons FOR SELECT USING (auth.uid() = student_id OR auth.uid() = tutor_id);
CREATE POLICY "Uczeń widzi swoje materiały" ON materials FOR SELECT USING (auth.uid() = student_id OR auth.uid() = tutor_id);
CREATE POLICY "Uczeń widzi swoje faktury" ON invoices FOR SELECT USING (auth.uid() = student_id);

-- Trigger: automatyczny profil po rejestracji
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
*/

const SUPABASE_URL = "https://joxezxwwzelpmqjawwmb.supabase.co"; // np. https://abcxyz.supabase.co
const SUPABASE_ANON_KEY =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpveGV6eHd3emVscG1xamF3d21iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjU2MDYsImV4cCI6MjA4OTYwMTYwNn0.TOQNslNUVG9fiFytfHT8S61Zpowl0Il61_nXm6IYIEk"; // długi ciąg znaków

// Inicjalizacja klienta Supabase
let supabaseClient;

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


function initSupabase() {
  if (supabaseClient) return Promise.resolve(supabaseClient); // już zainicjowane — nie rób tego dwa razy
  if (!window.supabase?.createClient) {
    console.error('Biblioteka Supabase nie jest załadowana. Dodaj tag <script> z CDN w <head>.');
    return Promise.reject('Supabase not loaded');
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,          // sesja przeżywa przejścia między podstronami
      storageKey:     'korepetycje-auth', // unikalna nazwa klucza w localStorage
      autoRefreshToken: true,        // automatyczne odświeżanie tokenu w tle
      detectSessionInUrl: true,      // wykrywa token z linku reset hasła
    }
  });
  return Promise.resolve(supabaseClient);
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
	return data;
}

async function signOut() {
	await supabaseClient.auth.signOut();
	window.location.href = "index.html";
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
