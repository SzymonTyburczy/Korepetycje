# Zmiany w bazie danych do ustalenia

Ten plik opisuje zmiany potrzebne do nowych funkcji panelu administratora, korepetytora i oplat.
Nie traktuj tego jeszcze jako finalnej migracji. Najpierw warto porownac to z aktualnym stanem Supabase.

## Cel zmian

Nowe widoki potrzebuja relacji wiele-do-wielu pomiedzy uczniami i korepetytorami:

- jeden uczen moze byc przypisany do wielu korepetytorow,
- jeden korepetytor moze miec wielu uczniow,
- administrator przypisuje uczniow do korepetytorow w panelu Przeglad,
- korepetytor w zakladce Uczniowie widzi tylko przypisanych do siebie uczniow,
- formularz rezerwacji ogranicza liste uczniow/korepetytorow do przypisanych relacji,
- panel Oplaty administratora pokazuje pary uczen-korepetytor i lekcje danej pary.

## Proponowana nowa tabela

```sql
CREATE TABLE student_tutor_assignments (
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  tutor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (student_id, tutor_id)
);
```

Ta tabela przechowuje same przypisania. Szczegoly osob dalej zostaja w `profiles`, a lekcje nadal zostaja w `lessons`.

## Proponowane RLS

```sql
ALTER TABLE student_tutor_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin zarzadza przypisaniami"
ON student_tutor_assignments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  )
);

CREATE POLICY "Uzytkownik widzi swoje przypisania"
ON student_tutor_assignments
FOR SELECT
USING (
  auth.uid() = student_id
  OR auth.uid() = tutor_id
);
```

## Jesli tabela juz istnieje

Jesli `student_tutor_assignments` juz istnieje, trzeba sprawdzic:

- czy ma kolumny `student_id`, `tutor_id`, `created_at`,
- czy kluczem glownym jest para `(student_id, tutor_id)`,
- czy oba pola wskazuja na `profiles(id)`,
- czy wlaczone jest RLS,
- czy admin ma pelne uprawnienia,
- czy uczen/korepetytor moga odczytac tylko swoje przypisania.

## Zmiany uzywane juz przez kod

Kod w `dashboard.html` odczytuje:

```js
supabaseClient
  .from("student_tutor_assignments")
  .select("student_id, tutor_id");
```

Kod zapisuje przypisanie:

```js
supabaseClient
  .from("student_tutor_assignments")
  .upsert(
    { student_id: studentId, tutor_id: tutorId },
    { onConflict: "student_id,tutor_id" }
  );
```

Kod usuwa przypisanie:

```js
supabaseClient
  .from("student_tutor_assignments")
  .delete()
  .eq("student_id", studentId)
  .eq("tutor_id", tutorId);
```

## Lekcje i oplaty

Obecny kod dalej uzywa tabeli `lessons` jako zrodla lekcji i rozliczen.
Do panelu oplat potrzebne sa pola:

- `student_id`,
- `tutor_id`,
- `subject`,
- `date`,
- `duration_minutes`,
- `status`,
- `price`,
- `paid`,
- `paid_at`.

Jesli `paid_at` nie istnieje, proponowana migracja:

```sql
ALTER TABLE lessons
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
```

Statusy lekcji uzywane przez panel:

- `zaplanowana` - lekcja jeszcze przed terminem,
- `odbyta` - lekcja odbyla sie i wchodzi do rozliczen,
- `odwolana` - lekcja sie nie odbyla,
- `oczekuje` - prosba o lekcje czeka na akceptacje.

## Notatki administratora

W aktualnym kodzie jest tez obsluga prywatnych notatek administratora o uzytkownikach.
Jesli tabela nie istnieje, proponowany schemat:

```sql
CREATE TABLE admin_user_notes (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_user_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin czyta notatki"
ON admin_user_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  )
);

CREATE POLICY "Admin zapisuje notatki"
ON admin_user_notes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  )
);

CREATE POLICY "Admin aktualizuje notatki"
ON admin_user_notes
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  )
);

CREATE POLICY "Admin usuwa notatki"
ON admin_user_notes
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  )
);
```

## Do potwierdzenia po pokazaniu aktualnej bazy

1. Czy `profiles.role` ma dokladnie wartosci `uczen`, `korepetytor`, `admin`.
2. Czy tabela `lessons` ma kolumny `paid` i `paid_at`.
3. Czy RLS pozwala adminowi czytac wszystkie profile i lekcje.
4. Czy korepetytor ma prawo odczytywac przypisanych uczniow z `profiles`.
5. Czy uczen ma prawo odczytywac przypisanych korepetytorow z `profiles`.
6. Czy chcemy, aby admin tez mogl byc korepetytorem w przypisaniach.

