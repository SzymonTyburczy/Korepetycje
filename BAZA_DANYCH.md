# Baza danych i bezpieczeństwo Supabase

Ten dokument jest jedyną aktualną instrukcją wdrożenia zmian bazy dla projektu. Właściwy SQL znajduje się w pliku:

`supabase/migrations/20260716_security_hardening.sql`

Nie wklejaj już schematu z `supabase-config.js` — ten plik zawiera wyłącznie publiczną konfigurację klienta przeglądarkowego.

## Co zmienia migracja

- odtwarza jeden kanoniczny zestaw polityk RLS dla siedmiu tabel aplikacji;
- odbiera role `anon` dostęp do tabel i ogranicza uprawnienia `authenticated`;
- usuwa funkcję `public_profile_exists`, która umożliwiała sprawdzanie, czy adres e-mail istnieje;
- dodaje `request_lesson(...)`, przez którą uczeń wysyła rezerwację bez ceny i bez możliwości ustawienia statusu;
- wymaga podania stawki przez korepetytora lub administratora podczas zatwierdzania prośby;
- blokuje zmianę stron lekcji, roli profilu oraz ceny zakończonej lekcji przez osoby inne niż administrator;
- wykrywa nakładające się potwierdzone terminy korepetytora i serializuje równoległe zapisy;
- dodaje ograniczenia długości, dozwolone statusy, spójność `paid`/`paid_at` i zakresy kwot;
- dodaje brakujące indeksy dla kluczy obcych, filtrów RLS i list lekcji;
- poprawia zachowanie kluczy obcych przy usuwaniu kont, materiałów i faktur;
- zapisuje serwerowy czas oraz wersję akceptowanego regulaminu dla nowych kont;
- dodaje funkcję aktualizacji zakończonych lekcji według czasu bazy, a nie zegara urządzenia.

## Kolejność wdrożenia

### 1. Wykonaj kopię zapasową

Przed zmianą produkcji utwórz backup w panelu Supabase lub wykonaj zrzut bazy. Migracja jest transakcyjna, więc jej błąd wycofa bieżący przebieg, ale kopia jest potrzebna na wypadek problemu wykrytego dopiero po wdrożeniu.

### 2. Uruchom kontrolę danych

W Supabase otwórz **SQL Editor → New query**, wklej poniższe zapytanie i uruchom je. Każdy wynik w kolumnie `invalid_rows` powinien wynosić `0`.

```sql
SELECT 'lessons_missing_parties' AS check_name, COUNT(*) AS invalid_rows
FROM public.lessons WHERE student_id IS NULL OR tutor_id IS NULL
UNION ALL
SELECT 'materials_missing_relations', COUNT(*)
FROM public.materials WHERE lesson_id IS NULL OR student_id IS NULL OR tutor_id IS NULL
UNION ALL
SELECT 'invoices_missing_student', COUNT(*)
FROM public.invoices WHERE student_id IS NULL
UNION ALL
SELECT 'invalid_lesson_values', COUNT(*)
FROM public.lessons
WHERE status NOT IN ('oczekuje', 'zaplanowana', 'odbyta', 'odwolana')
   OR duration_minutes NOT IN (60, 90, 120)
   OR price < 0 OR price > 100000
   OR (status IN ('zaplanowana', 'odbyta') AND price IS NULL)
UNION ALL
SELECT 'invalid_invoice_values', COUNT(*)
FROM public.invoices
WHERE status NOT IN ('oczekuje', 'oplacona', 'anulowana')
   OR amount <= 0 OR amount > 100000
UNION ALL
SELECT 'inconsistent_payments', COUNT(*)
FROM public.lessons
WHERE (paid = FALSE AND paid_at IS NOT NULL)
   OR (paid = TRUE AND paid_at IS NULL)
UNION ALL
SELECT 'overlapping_confirmed_lessons', COUNT(*)
FROM public.lessons first_lesson
JOIN public.lessons second_lesson
  ON first_lesson.tutor_id = second_lesson.tutor_id
 AND first_lesson.id < second_lesson.id
 AND first_lesson.status = 'zaplanowana'
 AND second_lesson.status = 'zaplanowana'
 AND first_lesson.date < second_lesson.date + second_lesson.duration_minutes * INTERVAL '1 minute'
 AND second_lesson.date < first_lesson.date + first_lesson.duration_minutes * INTERVAL '1 minute';
```

Pierwsze pięć kontroli oraz `overlapping_confirmed_lessons` powinno zwrócić `0`; w przeciwnym razie migracja może się zatrzymać albo pozostawić istniejący konflikt do ręcznego rozstrzygnięcia. `inconsistent_payments` jest kontrolą informacyjną — migracja automatycznie wyczyści zbędne `paid_at` i uzupełni brakującą datę wpłaty datą lekcji. Nie kasuj ani nie poprawiaj rekordów masowo bez potwierdzenia, co dane oznaczają biznesowo.

### 3. Zastosuj migrację

Najprostsza metoda:

1. Otwórz lokalny plik `supabase/migrations/20260716_security_hardening.sql`.
2. Skopiuj cały plik — od `BEGIN;` do `COMMIT;` wraz z definicjami funkcji.
3. Wklej go do nowego zapytania w Supabase SQL Editor.
4. Kliknij **Run** i upewnij się, że nie pojawił się błąd.

Jeśli uruchamiałeś wcześniejszą wersję tej migracji, zastosuj ponownie cały aktualny plik. Aktualna wersja usuwa `NOT NULL` z `lessons.price` i czyści cenę istniejących próśb ze statusem `oczekuje`, aby stawkę można było nadać dopiero przy zatwierdzeniu.

Alternatywnie, po zainicjowaniu i połączeniu projektu Supabase CLI, migrację można wysłać przez `supabase db push`.

### 4. Wdróż funkcję usuwania kont

Funkcja znajduje się w `supabase/functions/delete-user/index.ts`. Uruchom w katalogu projektu:

```powershell
supabase login
supabase functions deploy delete-user --project-ref joxezxwwzelpmqjawwmb
```

Supabase udostępnia funkcji `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` po stronie serwera. Nigdy nie kopiuj klucza `service_role` do HTML, JavaScriptu przeglądarkowego, repozytorium ani dokumentacji.

Funkcja przyjmuje wyłącznie `POST`, sprawdza JWT wywołującego, rolę administratora, format UUID, pochodzenie żądania, zakazuje samousunięcia i chroni ostatnie konto administratora.

### 5. Sprawdź ustawienia Auth

W **Authentication → URL Configuration** ustaw:

- Site URL: `https://korepetycje-tyburczy.pl`
- Redirect URL: `https://korepetycje-tyburczy.pl/login.html`

Włącz potwierdzanie adresu e-mail i ustaw minimalną długość hasła na co najmniej 8 znaków. Adres localhost dodawaj do Redirect URLs tylko na czas świadomych testów lokalnych.

### 6. Zweryfikuj wdrożenie

Uruchom poniższe zapytanie jako całość. Zwraca ono wszystkie kontrole w jednej tabeli, więc Supabase nie ukryje wcześniejszych wyników za ostatnim `SELECT`:

```sql
WITH
app_tables(table_name) AS (
  VALUES
    ('profiles'), ('lessons'), ('materials'), ('invoices'),
    ('student_tutor_assignments'), ('tutor_student_notes'), ('admin_user_notes')
),
required_functions(function_name) AS (
  VALUES
    ('is_admin'), ('is_my_student'), ('is_my_tutor'), ('request_lesson'),
    ('mark_finished_lessons'), ('handle_new_user'), ('protect_profile_role'),
    ('protect_lesson_parties'), ('prevent_lesson_overlap')
),
required_indexes(index_name) AS (
  VALUES
    ('idx_assignments_tutor_student'), ('idx_invoices_lesson'),
    ('idx_invoices_student'), ('idx_lessons_status'),
    ('idx_lessons_student_date'), ('idx_lessons_tutor_date'),
    ('idx_materials_lesson'), ('idx_materials_student'),
    ('idx_materials_tutor'), ('idx_profiles_role'),
    ('idx_tutor_notes_tutor_student')
),
checks AS (
  SELECT
    'RLS na 7 tabelach' AS kontrola,
    COUNT(*) FILTER (WHERE tables.rowsecurity) = 7 AS passed,
    FORMAT('%s/7 tabel z RLS', COUNT(*) FILTER (WHERE tables.rowsecurity)) AS szczegoly
  FROM app_tables expected
  LEFT JOIN pg_tables tables
    ON tables.schemaname = 'public' AND tables.tablename = expected.table_name

  UNION ALL

  SELECT
    '15 polityk tylko dla authenticated',
    COUNT(*) = 15 AND COUNT(*) FILTER (
      WHERE policies.roles = ARRAY['authenticated']::NAME[]
    ) = 15,
    FORMAT('%s/15 poprawnych polityk', COUNT(*) FILTER (
      WHERE policies.roles = ARRAY['authenticated']::NAME[]
    ))
  FROM pg_policies policies
  JOIN app_tables expected ON expected.table_name = policies.tablename
  WHERE policies.schemaname = 'public'

  UNION ALL

  SELECT
    '9 wymaganych funkcji',
    COUNT(DISTINCT procedures.proname) = 9,
    FORMAT('%s/9 funkcji', COUNT(DISTINCT procedures.proname))
  FROM required_functions expected
  LEFT JOIN pg_proc procedures ON procedures.proname = expected.function_name
  LEFT JOIN pg_namespace namespaces
    ON namespaces.oid = procedures.pronamespace AND namespaces.nspname = 'public'
  WHERE namespaces.oid IS NOT NULL

  UNION ALL

  SELECT
    'Usunięta funkcja public_profile_exists',
    to_regprocedure('public.public_profile_exists(text)') IS NULL,
    COALESCE(to_regprocedure('public.public_profile_exists(text)')::TEXT, 'brak — prawidłowo')

  UNION ALL

  SELECT
    'Brak dostępu anon do tabel',
    COUNT(*) FILTER (WHERE
      has_table_privilege('anon', FORMAT('public.%I', table_name), 'SELECT') OR
      has_table_privilege('anon', FORMAT('public.%I', table_name), 'INSERT') OR
      has_table_privilege('anon', FORMAT('public.%I', table_name), 'UPDATE') OR
      has_table_privilege('anon', FORMAT('public.%I', table_name), 'DELETE')
    ) = 0,
    FORMAT('%s tabel dostępnych dla anon', COUNT(*) FILTER (WHERE
      has_table_privilege('anon', FORMAT('public.%I', table_name), 'SELECT') OR
      has_table_privilege('anon', FORMAT('public.%I', table_name), 'INSERT') OR
      has_table_privilege('anon', FORMAT('public.%I', table_name), 'UPDATE') OR
      has_table_privilege('anon', FORMAT('public.%I', table_name), 'DELETE')
    ))
  FROM app_tables

  UNION ALL

  SELECT
    '11 wymaganych indeksów',
    COUNT(indexes.indexname) = 11,
    FORMAT('%s/11 indeksów', COUNT(indexes.indexname))
  FROM required_indexes expected
  LEFT JOIN pg_indexes indexes
    ON indexes.schemaname = 'public' AND indexes.indexname = expected.index_name

  UNION ALL

  SELECT
    'Cena oczekujących próśb jest pusta',
    COUNT(*) = 0,
    FORMAT('%s oczekujących próśb ze stawką', COUNT(*))
  FROM public.lessons
  WHERE status = 'oczekuje' AND price IS NOT NULL

  UNION ALL

  SELECT
    'Zatwierdzone lekcje mają stawkę',
    COUNT(*) = 0,
    FORMAT('%s zatwierdzonych lekcji bez stawki', COUNT(*))
  FROM public.lessons
  WHERE status IN ('zaplanowana', 'odbyta') AND price IS NULL
)
SELECT
  kontrola,
  CASE WHEN passed THEN 'OK' ELSE 'BŁĄD' END AS wynik,
  szczegoly
FROM checks
ORDER BY kontrola;
```

Oczekiwany rezultat: osiem wierszy i `OK` w każdym wierszu kolumny `wynik`. Jeśli pojawi się `BŁĄD`, kolumna `szczegoly` wskaże, czego brakuje.

### 7. Dopiero teraz opublikuj frontend

Nowy panel korzysta z funkcji `request_lesson` i `mark_finished_lessons`, dlatego kolejność publikacji ma znaczenie: najpierw migracja, potem Edge Function, na końcu pliki strony. Po wdrożeniu hostingu sprawdź także, czy odpowiedzi zawierają nagłówki z pliku `_headers`, szczególnie CSP, HSTS i `Cache-Control: no-store` dla logowania oraz panelu.

## Testy aplikacyjne po wdrożeniu

Przetestuj osobno konta ucznia, korepetytora i administratora:

1. Uczeń widzi tylko siebie i przypisanych korepetytorów, może wysłać prośbę tylko do przypisanego korepetytora, a prośba trafia do bazy z `price = NULL`.
2. Korepetytor widzi tylko przypisanych uczniów, przy zatwierdzaniu musi wpisać stawkę, może zatwierdzić termin bez konfliktu i nie może zmieniać stron istniejącej lekcji.
3. Po zatwierdzeniu uczeń widzi ustaloną stawkę przy lekcji; przed zatwierdzeniem widzi komunikat „Do ustalenia”.
4. Administrator widzi całość, może zarządzać przypisaniami i usunąć inne konto przez Edge Function, ale nie siebie ani ostatniego administratora.
5. Zmiana `paid` ustawia lub czyści `paid_at` i nie narusza ograniczenia spójności.
6. Termin wpisany w polskiej strefie czasowej po odświeżeniu nadal pokazuje tę samą lokalną godzinę.
7. Reset hasła i rejestracja nie ujawniają, czy podany adres e-mail istnieje.

Lokalną kontrolę statyczną uruchom poleceniem:

```powershell
npm test
```

## Cofnięcie i diagnostyka

- Jeśli migracja zakończy się błędem przed `COMMIT`, PostgreSQL automatycznie wycofa wszystkie zmiany z tego przebiegu.
- Nie uruchamiaj fragmentów migracji pojedynczo po nieudanym przebiegu. Popraw przyczynę i uruchom cały plik ponownie.
- Po udanym `COMMIT` nie ma automatycznego skryptu cofającego, ponieważ odtworzenie słabszych polityk i funkcji enumerującej e-maile obniżyłoby bezpieczeństwo. W razie krytycznego problemu odtwórz wcześniej wykonany backup.
- Szczegóły błędów aplikacja zapisuje w konsoli przeglądarki lub logach Edge Function; użytkownik otrzymuje komunikat ogólny, bez ujawniania struktury bazy.

## Znane ograniczenie

Nagłówek CSP nadal dopuszcza `'unsafe-inline'`, ponieważ istniejący interfejs używa skryptów i obsługi zdarzeń osadzonych w HTML. Pozostałe źródła są ograniczone do wymaganych domen. Pełne usunięcie `'unsafe-inline'` wymaga osobnego refaktoru wszystkich stron do zewnętrznych skryptów lub CSP z nonce/hashami.
