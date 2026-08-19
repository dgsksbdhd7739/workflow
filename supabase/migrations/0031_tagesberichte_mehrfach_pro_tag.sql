-- Der Unique-Constraint (baustelle_id, datum, erstellt_von) erlaubte pro
-- Nutzer und Tag nur EINEN Tagesbericht je Projekt -- ein zweiter Versuch
-- am selben Tag schlug mit einem rohen Datenbank-Fehler fehl. Die
-- fortlaufende Nummerierung der Berichte (tagesberichtName/-Nummern) geht
-- aber explizit von mehreren Berichten am selben Datum aus, daher war die
-- Beschraenkung ein Bug, keine Absicht.

alter table public.tagesberichte drop constraint if exists tagesberichte_baustelle_id_datum_erstellt_von_key;
