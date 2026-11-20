do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create schema extensions;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create table public.utenti(id uuid primary key references auth.users(id), player_id text, ruolo text, attivo boolean);
create table public.matches(match_id text primary key, partita text);
create table public.players(player_id text primary key, nome text);
create table public.lnd_seasons(id uuid primary key);
insert into auth.users values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');
insert into public.utenti values ('11111111-1111-1111-1111-111111111111',null,'STAFF',true),('22222222-2222-2222-2222-222222222222','P1','GIOCATORE',true);
insert into public.matches values ('M1','Villanovese - Montagnana'),('M2','Partita successiva');
insert into public.players values ('P1','Atleta test');
