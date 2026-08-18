-- Beim Stoppen der Arbeitszeit-Stoppuhr muss ein Foto vom IST-Stand
-- angehaengt werden (in der App erzwungen). Wird im gleichen Bucket wie
-- Mangel-/Kommentarfotos abgelegt.

alter table public.zeiterfassung add column foto_pfad text;
