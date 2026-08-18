-- Admin/Planer koennen abgeschlossene Projekte archivieren statt sie zu
-- loeschen. Archivierte Projekte bleiben mit allen Daten erhalten, werden
-- im Dashboard aber standardmaessig ausgeblendet. Keine neue RLS noetig --
-- die bestehende "baustellen: admin/planer aendern"-Policy (Migration 0008)
-- deckt das Setzen dieser Spalte bereits ab.

alter table public.baustellen add column archiviert boolean not null default false;
