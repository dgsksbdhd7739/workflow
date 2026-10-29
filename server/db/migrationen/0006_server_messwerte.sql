-- Messwerte des Servers (CPU, RAM, Festplatte, Netzwerk) fuer die Seite
-- "Serverzustand" der Plattform-Verwaltung. Das Backend schreibt jede Minute
-- eine Zeile und loescht Werte nach 8 Tagen.
--
-- Eigenes Schema statt public: Die Daten-Schnittstelle gibt nur Tabellen aus
-- public frei, und diese Tabelle hat keinen Firmenbezug -- sie ist nur ueber
-- /api/betrieb/serverzustand (Plattform-Admins) erreichbar.

create schema if not exists betrieb;
revoke all on schema betrieb from public;
grant usage on schema betrieb to service_role;

create table if not exists betrieb.messwerte (
  zeit timestamptz primary key default now(),
  cpu_prozent real not null,
  ram_belegt bigint not null,
  ram_gesamt bigint not null,
  platte_belegt bigint not null,
  platte_gesamt bigint not null,
  -- Bytes seit der vorherigen Messung (null bei der ersten nach dem Start)
  netz_rein bigint,
  netz_raus bigint,
  last_1min real not null
);

revoke all on betrieb.messwerte from public;
grant select, insert, delete on betrieb.messwerte to service_role;

insert into private.schema_migrationen (name)
values ('0006_server_messwerte.sql')
on conflict do nothing;
