-- Dokumente bekommen eine eigene Kategorie (projekt/aufgabe) statt beim
-- Hochladen direkt einer Aufgabe zugeordnet zu werden. Aufgabendokumente
-- landen zunaechst unzugeordnet (mangel_id = null) in einem Pool und werden
-- danach direkt an der Markierung/Aufgabe zugeordnet (PlanDetail/MangelDetails).

alter table public.dokumente add column kategorie text not null default 'projekt' check (kategorie in ('projekt', 'aufgabe'));

update public.dokumente set kategorie = 'aufgabe' where mangel_id is not null;
