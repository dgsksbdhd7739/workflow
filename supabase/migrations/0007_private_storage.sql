-- Fotos und Plaene enthalten teils sensible Baustellendaten und waren bisher
-- ueber oeffentliche, erratbare URLs ohne Login abrufbar (public-Bucket
-- umgeht Row Level Security komplett). Buckets werden privat; Zugriff
-- funktioniert nur noch ueber zeitlich begrenzte signierte URLs fuer
-- eingeloggte Nutzer. Die *_url-Spalten enthalten ab jetzt nur noch den
-- Storage-Pfad, nicht mehr die aufgeloeste URL.

update storage.buckets set public = false where id in ('mangel-fotos', 'plaene');

alter table public.maengel rename column foto_url to foto_pfad;
alter table public.plaene rename column datei_url to datei_pfad;
alter table public.mangel_kommentare rename column foto_url to foto_pfad;
