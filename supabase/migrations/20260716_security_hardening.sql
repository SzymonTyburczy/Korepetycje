-- Security and data-integrity hardening for the tutoring platform.
-- Apply once through `supabase db push` or the Supabase SQL Editor.
-- The migration is idempotent for policies, functions, triggers and indexes.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version TEXT;

-- Pending student requests intentionally have no price until approval. This
-- also reverses the NOT NULL introduced by an earlier draft of this migration.
ALTER TABLE public.lessons ALTER COLUMN price DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- Canonical helper functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_my_student(target UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_tutor_assignments
    WHERE tutor_id = auth.uid() AND student_id = target
  );
$$;

CREATE OR REPLACE FUNCTION public.is_my_tutor(target UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_tutor_assignments
    WHERE student_id = auth.uid() AND tutor_id = target
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, terms_accepted_at, terms_version)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(BTRIM(LEFT(COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 120)), ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'terms_accepted' = 'true'
      THEN NOW()
      ELSE NULL
    END,
    NULLIF(LEFT(COALESCE(NEW.raw_user_meta_data->>'terms_version', ''), 40), '')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Nie wolno zmieniac roli konta.';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Nie wolno zmieniac chronionych pol profilu.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_lesson_parties()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.tutor_id IS DISTINCT FROM OLD.tutor_id THEN
      RAISE EXCEPTION 'Nie wolno zmieniac ucznia ani korepetytora lekcji.';
    END IF;
    IF NEW.subject IS DISTINCT FROM OLD.subject
       OR NEW.date IS DISTINCT FROM OLD.date
       OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
       OR NEW.notes IS DISTINCT FROM OLD.notes THEN
      RAISE EXCEPTION 'Tylko administrator moze zmienic szczegoly prosby ucznia.';
    END IF;
    IF OLD.status IN ('odbyta', 'odwolana')
       AND NEW.price IS DISTINCT FROM OLD.price THEN
      RAISE EXCEPTION 'Tylko administrator moze zmienic cene zakonczonej lekcji.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Prevent two confirmed lessons for the same tutor from overlapping.
CREATE OR REPLACE FUNCTION public.prevent_lesson_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'zaplanowana' THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.tutor_id::TEXT));
  END IF;

  IF NEW.status = 'zaplanowana' AND EXISTS (
    SELECT 1
    FROM public.lessons existing
    WHERE existing.tutor_id = NEW.tutor_id
      AND existing.id IS DISTINCT FROM NEW.id
      AND existing.status = 'zaplanowana'
      AND existing.date < NEW.date + NEW.duration_minutes * INTERVAL '1 minute'
      AND NEW.date < existing.date + existing.duration_minutes * INTERVAL '1 minute'
  ) THEN
    RAISE EXCEPTION 'Korepetytor ma juz zaplanowana lekcje w tym terminie.';
  END IF;
  RETURN NEW;
END;
$$;

-- Students request lessons through this function without setting a price.
-- A tutor or administrator adds the agreed price while confirming the lesson.
CREATE OR REPLACE FUNCTION public.request_lesson(
  p_tutor_id UUID,
  p_subject TEXT,
  p_date TIMESTAMPTZ,
  p_duration_minutes INTEGER,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Wymagane jest logowanie.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'uczen'
  ) THEN
    RAISE EXCEPTION 'Tylko uczen moze wyslac prosbe o lekcje.';
  END IF;

  IF NOT public.is_my_tutor(p_tutor_id) THEN
    RAISE EXCEPTION 'Wybrany korepetytor nie jest przypisany do ucznia.';
  END IF;

  p_subject := BTRIM(COALESCE(p_subject, ''));
  p_notes := NULLIF(BTRIM(COALESCE(p_notes, '')), '');

  IF CHAR_LENGTH(p_subject) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Przedmiot musi miec od 1 do 120 znakow.';
  END IF;
  IF p_notes IS NOT NULL AND CHAR_LENGTH(p_notes) > 2000 THEN
    RAISE EXCEPTION 'Notatka moze miec maksymalnie 2000 znakow.';
  END IF;
  IF p_duration_minutes NOT IN (60, 90, 120) THEN
    RAISE EXCEPTION 'Nieprawidlowy czas trwania lekcji.';
  END IF;
  IF p_date < NOW() THEN
    RAISE EXCEPTION 'Nie mozna zarezerwowac lekcji w przeszlosci.';
  END IF;
  IF p_date > NOW() + INTERVAL '1 year' THEN
    RAISE EXCEPTION 'Termin jest zbyt odlegly.';
  END IF;
  IF (
    SELECT COUNT(*)
    FROM public.lessons
    WHERE student_id = auth.uid()
      AND status = 'oczekuje'
      AND date >= NOW()
  ) >= 10 THEN
    RAISE EXCEPTION 'Masz zbyt wiele oczekujacych prosb o lekcje.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE student_id = auth.uid()
      AND tutor_id = p_tutor_id
      AND date = p_date
      AND status IN ('oczekuje', 'zaplanowana')
  ) THEN
    RAISE EXCEPTION 'Taka prosba o lekcje juz istnieje.';
  END IF;

  INSERT INTO public.lessons (
    student_id, tutor_id, subject, date, duration_minutes,
    status, notes, price, paid, paid_at
  ) VALUES (
    auth.uid(), p_tutor_id, p_subject, p_date, p_duration_minutes,
    'oczekuje', p_notes, NULL, FALSE, NULL
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- Uses database time instead of the browser clock. RLS still limits updates to
-- the current tutor or an administrator because this function is invoker-safe.
CREATE OR REPLACE FUNCTION public.mark_finished_lessons()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.lessons
  SET status = 'odbyta'
  WHERE status = 'zaplanowana'
    AND date + duration_minutes * INTERVAL '1 minute' < NOW()
    AND (tutor_id = auth.uid() OR public.is_admin());
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- The old e-mail enumeration RPC is unused and should not exist.
DROP FUNCTION IF EXISTS public.public_profile_exists(TEXT);

-- ---------------------------------------------------------------------------
-- Normalize existing nullable values before adding constraints
-- ---------------------------------------------------------------------------

UPDATE public.profiles SET role = 'uczen' WHERE role IS NULL;
UPDATE public.profiles SET created_at = NOW() WHERE created_at IS NULL;

UPDATE public.lessons SET duration_minutes = 60 WHERE duration_minutes IS NULL;
UPDATE public.lessons SET status = 'zaplanowana' WHERE status IS NULL;
UPDATE public.lessons
SET price = NULL, paid = FALSE, paid_at = NULL
WHERE status = 'oczekuje';
UPDATE public.lessons SET paid = FALSE WHERE paid IS NULL;
UPDATE public.lessons SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.lessons SET paid_at = NULL WHERE paid = FALSE;
UPDATE public.lessons SET paid_at = date WHERE paid = TRUE AND paid_at IS NULL;

UPDATE public.invoices SET status = 'oczekuje' WHERE status IS NULL;
UPDATE public.invoices SET issued_at = NOW() WHERE issued_at IS NULL;
UPDATE public.invoices SET paid_at = issued_at WHERE status = 'oplacona' AND paid_at IS NULL;

UPDATE public.materials SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.student_tutor_assignments SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.tutor_student_notes SET updated_at = NOW() WHERE updated_at IS NULL;
UPDATE public.admin_user_notes SET updated_at = NOW() WHERE updated_at IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN role SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.lessons
  ALTER COLUMN student_id SET NOT NULL,
  ALTER COLUMN tutor_id SET NOT NULL,
  ALTER COLUMN duration_minutes SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN paid SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.materials
  ALTER COLUMN lesson_id SET NOT NULL,
  ALTER COLUMN tutor_id SET NOT NULL,
  ALTER COLUMN student_id SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.invoices
  ALTER COLUMN student_id SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN issued_at SET NOT NULL;

ALTER TABLE public.student_tutor_assignments
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.tutor_student_notes
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.admin_user_notes
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_allowed,
  DROP CONSTRAINT IF EXISTS profiles_full_name_len,
  DROP CONSTRAINT IF EXISTS profiles_email_len,
  DROP CONSTRAINT IF EXISTS profiles_phone_len,
  DROP CONSTRAINT IF EXISTS profiles_terms_version_len,
  ADD CONSTRAINT profiles_role_allowed CHECK (role IN ('uczen', 'korepetytor', 'admin')),
  ADD CONSTRAINT profiles_full_name_len CHECK (CHAR_LENGTH(COALESCE(full_name, '')) <= 120),
  ADD CONSTRAINT profiles_email_len CHECK (CHAR_LENGTH(COALESCE(email, '')) <= 320),
  ADD CONSTRAINT profiles_phone_len CHECK (CHAR_LENGTH(COALESCE(phone, '')) <= 32),
  ADD CONSTRAINT profiles_terms_version_len CHECK (CHAR_LENGTH(COALESCE(terms_version, '')) <= 40);

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_status_allowed,
  DROP CONSTRAINT IF EXISTS lessons_subject_len,
  DROP CONSTRAINT IF EXISTS lessons_notes_len,
  DROP CONSTRAINT IF EXISTS lessons_duration_allowed,
  DROP CONSTRAINT IF EXISTS lessons_price_range,
  DROP CONSTRAINT IF EXISTS lessons_confirmed_price_required,
  DROP CONSTRAINT IF EXISTS lessons_pending_unpaid,
  DROP CONSTRAINT IF EXISTS lessons_payment_consistency,
  ADD CONSTRAINT lessons_status_allowed CHECK (status IN ('oczekuje', 'zaplanowana', 'odbyta', 'odwolana')),
  ADD CONSTRAINT lessons_subject_len CHECK (CHAR_LENGTH(BTRIM(subject)) BETWEEN 1 AND 120),
  ADD CONSTRAINT lessons_notes_len CHECK (CHAR_LENGTH(COALESCE(notes, '')) <= 2000),
  ADD CONSTRAINT lessons_duration_allowed CHECK (duration_minutes IN (60, 90, 120)),
  ADD CONSTRAINT lessons_price_range CHECK (price IS NULL OR price BETWEEN 0 AND 100000),
  ADD CONSTRAINT lessons_confirmed_price_required CHECK (
    status NOT IN ('zaplanowana', 'odbyta') OR price IS NOT NULL
  ),
  ADD CONSTRAINT lessons_pending_unpaid CHECK (
    status <> 'oczekuje' OR (paid = FALSE AND paid_at IS NULL)
  ),
  ADD CONSTRAINT lessons_payment_consistency CHECK (
    (paid = FALSE AND paid_at IS NULL) OR
    (paid = TRUE AND paid_at IS NOT NULL)
  );

ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_title_len,
  DROP CONSTRAINT IF EXISTS materials_description_len,
  DROP CONSTRAINT IF EXISTS materials_file_url_len,
  DROP CONSTRAINT IF EXISTS materials_file_name_len,
  ADD CONSTRAINT materials_title_len CHECK (CHAR_LENGTH(BTRIM(title)) BETWEEN 1 AND 200),
  ADD CONSTRAINT materials_description_len CHECK (CHAR_LENGTH(COALESCE(description, '')) <= 4000),
  ADD CONSTRAINT materials_file_url_len CHECK (CHAR_LENGTH(COALESCE(file_url, '')) <= 2048),
  ADD CONSTRAINT materials_file_name_len CHECK (CHAR_LENGTH(COALESCE(file_name, '')) <= 255);

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_status_allowed,
  DROP CONSTRAINT IF EXISTS invoices_amount_positive,
  DROP CONSTRAINT IF EXISTS invoices_payment_consistency,
  ADD CONSTRAINT invoices_status_allowed CHECK (status IN ('oczekuje', 'oplacona', 'anulowana')),
  ADD CONSTRAINT invoices_amount_positive CHECK (amount > 0 AND amount <= 100000),
  ADD CONSTRAINT invoices_payment_consistency CHECK (status <> 'oplacona' OR paid_at IS NOT NULL);

ALTER TABLE public.tutor_student_notes
  DROP CONSTRAINT IF EXISTS tutor_student_notes_note_len,
  ADD CONSTRAINT tutor_student_notes_note_len CHECK (CHAR_LENGTH(COALESCE(note, '')) <= 500);

ALTER TABLE public.admin_user_notes
  DROP CONSTRAINT IF EXISTS admin_user_notes_note_len,
  ADD CONSTRAINT admin_user_notes_note_len CHECK (CHAR_LENGTH(COALESCE(note, '')) <= 500);

-- Cascades make Auth deletion atomic through profiles -> lessons -> materials.
ALTER TABLE public.materials DROP CONSTRAINT IF EXISTS materials_lesson_id_fkey;
ALTER TABLE public.materials
  ADD CONSTRAINT materials_lesson_id_fkey
  FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

-- Keep an invoice if only its lesson is removed. Deleting the student still
-- follows the existing invoices_student_id_fkey ON DELETE CASCADE rule.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_lesson_id_fkey;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_lesson_id_fkey
  FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

DROP TRIGGER IF EXISTS trg_protect_lesson_parties ON public.lessons;
CREATE TRIGGER trg_protect_lesson_parties
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.protect_lesson_parties();

DROP TRIGGER IF EXISTS trg_prevent_lesson_overlap ON public.lessons;
CREATE TRIGGER trg_prevent_lesson_overlap
  BEFORE INSERT OR UPDATE OF tutor_id, date, duration_minutes, status
  ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.prevent_lesson_overlap();

-- ---------------------------------------------------------------------------
-- Canonical RLS policies: remove all current policies, then rebuild the exact
-- set. The database audit confirmed that these are the only application tables.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_tutor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_student_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_user_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
DROP POLICY IF EXISTS profiles_delete_admin ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin() OR public.is_my_student(id) OR public.is_my_tutor(id));
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS lessons_select ON public.lessons;
DROP POLICY IF EXISTS lessons_insert ON public.lessons;
DROP POLICY IF EXISTS lessons_update ON public.lessons;
DROP POLICY IF EXISTS lessons_delete ON public.lessons;
CREATE POLICY lessons_select ON public.lessons FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR tutor_id = auth.uid() OR public.is_admin());
-- Students use request_lesson(); only tutors and admins insert rows directly.
CREATE POLICY lessons_insert ON public.lessons FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      tutor_id = auth.uid()
      AND public.is_my_student(student_id)
      AND status = 'zaplanowana'
      AND date > NOW()
      AND price BETWEEN 0 AND 100000
      AND paid = FALSE
      AND paid_at IS NULL
    )
  );
CREATE POLICY lessons_update ON public.lessons FOR UPDATE TO authenticated
  USING (tutor_id = auth.uid() OR public.is_admin())
  WITH CHECK (tutor_id = auth.uid() OR public.is_admin());
-- Financial history cannot be hard-deleted by tutors.
CREATE POLICY lessons_delete ON public.lessons FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS materials_select ON public.materials;
DROP POLICY IF EXISTS materials_write ON public.materials;
CREATE POLICY materials_select ON public.materials FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR tutor_id = auth.uid() OR public.is_admin());
CREATE POLICY materials_write ON public.materials FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR (
      tutor_id = auth.uid()
      AND public.is_my_student(student_id)
      AND EXISTS (
        SELECT 1 FROM public.lessons lesson
        WHERE lesson.id = lesson_id
          AND lesson.student_id = student_id
          AND lesson.tutor_id = tutor_id
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      tutor_id = auth.uid()
      AND public.is_my_student(student_id)
      AND EXISTS (
        SELECT 1 FROM public.lessons lesson
        WHERE lesson.id = lesson_id
          AND lesson.student_id = student_id
          AND lesson.tutor_id = tutor_id
      )
    )
  );

DROP POLICY IF EXISTS invoices_select ON public.invoices;
DROP POLICY IF EXISTS invoices_write ON public.invoices;
CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_admin());
CREATE POLICY invoices_write ON public.invoices FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS assignments_select ON public.student_tutor_assignments;
DROP POLICY IF EXISTS assignments_write ON public.student_tutor_assignments;
CREATE POLICY assignments_select ON public.student_tutor_assignments FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR tutor_id = auth.uid() OR public.is_admin());
CREATE POLICY assignments_write ON public.student_tutor_assignments FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS tutor_notes_select ON public.tutor_student_notes;
DROP POLICY IF EXISTS tutor_notes_write ON public.tutor_student_notes;
CREATE POLICY tutor_notes_select ON public.tutor_student_notes FOR SELECT TO authenticated
  USING (tutor_id = auth.uid() OR public.is_admin());
CREATE POLICY tutor_notes_write ON public.tutor_student_notes FOR ALL TO authenticated
  USING (public.is_admin() OR (tutor_id = auth.uid() AND public.is_my_student(student_id)))
  WITH CHECK (public.is_admin() OR (tutor_id = auth.uid() AND public.is_my_student(student_id)));

DROP POLICY IF EXISTS admin_notes_all ON public.admin_user_notes;
CREATE POLICY admin_notes_all ON public.admin_user_notes FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- Least-privilege grants
-- ---------------------------------------------------------------------------

REVOKE ALL PRIVILEGES ON TABLE
  public.profiles,
  public.lessons,
  public.materials,
  public.invoices,
  public.student_tutor_assignments,
  public.tutor_student_notes,
  public.admin_user_notes
FROM anon, authenticated;

GRANT SELECT (id, email, full_name, phone, role, avatar_url, created_at)
  ON public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, avatar_url, role) ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_tutor_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_student_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_user_notes TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_lesson_parties() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_lesson_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_my_student(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_my_tutor(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_lesson(UUID, TEXT, TIMESTAMPTZ, INTEGER, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_finished_lessons() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_student(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_tutor(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_lesson(UUID, TEXT, TIMESTAMPTZ, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_finished_lessons() TO authenticated;

-- ---------------------------------------------------------------------------
-- Indexes for RLS predicates, joins and cascading deletes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_lessons_student_date ON public.lessons(student_id, date);
CREATE INDEX IF NOT EXISTS idx_lessons_tutor_date ON public.lessons(tutor_id, date);
CREATE INDEX IF NOT EXISTS idx_lessons_status ON public.lessons(status);
CREATE INDEX IF NOT EXISTS idx_materials_lesson ON public.materials(lesson_id);
CREATE INDEX IF NOT EXISTS idx_materials_student ON public.materials(student_id);
CREATE INDEX IF NOT EXISTS idx_materials_tutor ON public.materials(tutor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student ON public.invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_lesson ON public.invoices(lesson_id);
CREATE INDEX IF NOT EXISTS idx_assignments_tutor_student
  ON public.student_tutor_assignments(tutor_id, student_id);
CREATE INDEX IF NOT EXISTS idx_tutor_notes_tutor_student
  ON public.tutor_student_notes(tutor_id, student_id);

COMMIT;
