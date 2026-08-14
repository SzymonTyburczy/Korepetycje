-- Fix: w polityce materials_write niekwalifikowane kolumny student_id/tutor_id
-- w podzapytaniu EXISTS wiązały się z kolumnami tabeli lessons (wewnętrzny
-- zasięg nazw), przez co warunki porównywały kolumnę samą ze sobą i zawsze
-- były prawdziwe. Sprawdzane było tylko "lekcja o tym id istnieje", więc
-- korepetytor mógł podpiąć materiał pod cudzą lekcję. Kwalifikacja
-- materials.* przywraca zamierzony warunek: lekcja musi należeć do tej samej
-- pary uczeń-korepetytor co materiał.

BEGIN;

DROP POLICY IF EXISTS materials_write ON public.materials;
CREATE POLICY materials_write ON public.materials FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR (
      tutor_id = auth.uid()
      AND public.is_my_student(student_id)
      AND EXISTS (
        SELECT 1 FROM public.lessons lesson
        WHERE lesson.id = materials.lesson_id
          AND lesson.student_id = materials.student_id
          AND lesson.tutor_id = materials.tutor_id
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
        WHERE lesson.id = materials.lesson_id
          AND lesson.student_id = materials.student_id
          AND lesson.tutor_id = materials.tutor_id
      )
    )
  );

COMMIT;
