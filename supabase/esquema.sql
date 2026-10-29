-- Dead Zone · esquema de Supabase: clasificación mundial y estadísticas de uso.
-- Se aplica entero en el editor SQL del proyecto (es idempotente: se puede volver a pegar).
--
-- Cómo escribe el juego: sólo a través de las funciones dz_* (security definer) con la clave
-- publicable; las tablas tienen RLS sin políticas de escritura, así nadie puede tocar filas ajenas
-- ni borrar nada por la API REST. Sólo `scores` se lee en abierto (la clasificación).
-- Cómo se lee la analítica: la función `estadisticas(clave, desde)` compara la clave con el hash
-- guardado en `config` (se fija con `select fijar_clave('…')`, que sólo corre el dueño del proyecto).

create extension if not exists pgcrypto with schema extensions;

/* ---------- tablas ---------- */

create table if not exists public.scores (
  uid text primary key,
  name text not null check (length(name) between 1 and 16),
  wave int not null default 0 check (wave between 0 and 999),
  kills int not null default 0 check (kills between 0 and 10000000),
  time int not null default 0 check (time between 0 and 1000000),
  level int not null default 1 check (level between 1 and 999),
  at timestamptz not null default now()
);

-- una por cada vez que se abre el juego (también sin jugar); `ultimo` avanza con cada latido
create table if not exists public.sesiones (
  id uuid primary key,
  dispositivo uuid not null,
  inicio timestamptz not null default now(),
  ultimo timestamptz not null default now(),
  version text,
  tactil boolean,
  origen text,
  partidas int not null default 0
);
create index if not exists sesiones_dispositivo on public.sesiones (dispositivo);
create index if not exists sesiones_inicio on public.sesiones (inicio);

-- una por partida; `fin` queda en 'en_curso' si se cerró la pestaña (abandono = en_curso y sin latido)
create table if not exists public.partidas (
  id uuid primary key,
  sesion uuid,
  dispositivo uuid not null,
  modo text not null check (modo in ('solo', 'online')),
  clase text,
  inicio timestamptz not null default now(),
  ultimo timestamptz not null default now(),
  duracion int not null default 0,
  oleada int not null default 0,
  nivel int not null default 1,
  bajas jsonb not null default '{}'::jsonb,
  bajas_total int not null default 0,
  fin text not null default 'en_curso' check (fin in ('en_curso', 'muerte', 'fin', 'abandono')),
  causa text,
  oleada_muerte int,
  arma_muerte text,
  version text
);
create index if not exists partidas_inicio on public.partidas (inicio);
create index if not exists partidas_dispositivo on public.partidas (dispositivo);

-- cada subida de nivel: qué mejoras se ofrecieron y cuál se eligió
create table if not exists public.elecciones (
  id bigint generated always as identity primary key,
  partida uuid not null,
  dispositivo uuid not null,
  nivel int not null,
  ofrecidas text[] not null,
  elegida text not null,
  at timestamptz not null default now()
);
create index if not exists elecciones_at on public.elecciones (at);

-- cada compra en la tienda
create table if not exists public.compras (
  id bigint generated always as identity primary key,
  partida uuid not null,
  dispositivo uuid not null,
  tipo text not null,
  item text not null,
  cantidad int not null default 1,
  precio int not null default 0,
  oleada int not null default 0,
  at timestamptz not null default now()
);
create index if not exists compras_at on public.compras (at);

-- hash de la clave de la página de estadísticas (nunca se lee por la API)
create table if not exists public.config (
  clave text primary key,
  valor text not null
);

alter table public.scores enable row level security;
alter table public.sesiones enable row level security;
alter table public.partidas enable row level security;
alter table public.elecciones enable row level security;
alter table public.compras enable row level security;
alter table public.config enable row level security;

drop policy if exists "scores: lectura pública" on public.scores;
create policy "scores: lectura pública" on public.scores for select to anon, authenticated using (true);

-- la API no toca la tabla de configuración ni la analítica en bruto
revoke all on public.config from anon, authenticated;
revoke all on public.sesiones, public.partidas, public.elecciones, public.compras from anon, authenticated;

/* ---------- escritura desde el juego ---------- */

create or replace function public.dz_record(r jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(regexp_replace(coalesce(r->>'name', ''), '[[:cntrl:]]', '', 'g'), 16);
begin
  if length(trim(v_name)) = 0 or coalesce(r->>'uid', '') !~ '^[a-z0-9]{8,32}$' then
    return;
  end if;
  insert into public.scores (uid, name, wave, kills, time, level, at)
  values (
    r->>'uid',
    trim(v_name),
    least(999, greatest(0, coalesce((r->>'wave')::int, 0))),
    least(10000000, greatest(0, coalesce((r->>'kills')::int, 0))),
    least(1000000, greatest(0, coalesce((r->>'time')::int, 0))),
    least(999, greatest(1, coalesce((r->>'level')::int, 1))),
    now()
  )
  on conflict (uid) do update
    set name = excluded.name, wave = excluded.wave, kills = excluded.kills,
        time = excluded.time, level = excluded.level, at = now();
end;
$$;

create or replace function public.dz_sesion(s jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sesiones (id, dispositivo, version, tactil, origen, partidas)
  values (
    (s->>'id')::uuid,
    (s->>'dispositivo')::uuid,
    left(s->>'version', 16),
    (s->>'tactil')::boolean,
    left(s->>'origen', 64),
    least(1000, greatest(0, coalesce((s->>'partidas')::int, 0)))
  )
  on conflict (id) do update
    set ultimo = now(),
        partidas = greatest(sesiones.partidas, excluded.partidas);
end;
$$;

create or replace function public.dz_partida(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fin text := coalesce(p->>'fin', 'en_curso');
begin
  if v_fin not in ('en_curso', 'muerte', 'fin', 'abandono') then
    v_fin := 'en_curso';
  end if;
  insert into public.partidas
    (id, sesion, dispositivo, modo, clase, duracion, oleada, nivel, bajas, bajas_total, fin, causa, oleada_muerte, arma_muerte, version)
  values (
    (p->>'id')::uuid,
    (p->>'sesion')::uuid,
    (p->>'dispositivo')::uuid,
    case when p->>'modo' = 'online' then 'online' else 'solo' end,
    left(p->>'clase', 16),
    least(1000000, greatest(0, coalesce((p->>'duracion')::int, 0))),
    least(999, greatest(0, coalesce((p->>'oleada')::int, 0))),
    least(999, greatest(1, coalesce((p->>'nivel')::int, 1))),
    coalesce(case when jsonb_typeof(p->'bajas') = 'object' then p->'bajas' end, '{}'::jsonb),
    least(10000000, greatest(0, coalesce((p->>'bajas_total')::int, 0))),
    v_fin,
    left(p->>'causa', 24),
    (p->>'oleada_muerte')::int,
    left(p->>'arma_muerte', 16),
    left(p->>'version', 16)
  )
  on conflict (id) do update
    set ultimo = now(),
        sesion = coalesce(excluded.sesion, partidas.sesion),
        clase = coalesce(excluded.clase, partidas.clase),
        duracion = excluded.duracion,
        oleada = greatest(partidas.oleada, excluded.oleada),
        nivel = excluded.nivel,
        bajas = excluded.bajas,
        bajas_total = excluded.bajas_total,
        fin = excluded.fin,
        causa = coalesce(excluded.causa, partidas.causa),
        oleada_muerte = coalesce(excluded.oleada_muerte, partidas.oleada_muerte),
        arma_muerte = coalesce(excluded.arma_muerte, partidas.arma_muerte);
end;
$$;

create or replace function public.dz_eleccion(e jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ofrecidas text[];
begin
  select array_agg(left(x, 24)) into v_ofrecidas
  from (
    select x
    from jsonb_array_elements_text(coalesce(case when jsonb_typeof(e->'ofrecidas') = 'array' then e->'ofrecidas' end, '[]'::jsonb)) as t(x)
    limit 8
  ) s;
  insert into public.elecciones (partida, dispositivo, nivel, ofrecidas, elegida)
  values (
    (e->>'partida')::uuid,
    (e->>'dispositivo')::uuid,
    least(999, greatest(1, coalesce((e->>'nivel')::int, 1))),
    coalesce(v_ofrecidas, '{}'),
    left(coalesce(e->>'elegida', ''), 24)
  );
end;
$$;

create or replace function public.dz_compra(c jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.compras (partida, dispositivo, tipo, item, cantidad, precio, oleada)
  values (
    (c->>'partida')::uuid,
    (c->>'dispositivo')::uuid,
    left(coalesce(c->>'tipo', 'objeto'), 16),
    left(coalesce(c->>'item', ''), 24),
    least(1000, greatest(1, coalesce((c->>'cantidad')::int, 1))),
    least(1000000, greatest(0, coalesce((c->>'precio')::int, 0))),
    least(999, greatest(0, coalesce((c->>'oleada')::int, 0)))
  );
end;
$$;

/* ---------- vistas (para el panel de Supabase; la API no las lee) ---------- */

-- abandonada = sin fin registrado y más de dos horas sin latido
create or replace view public.v_partidas with (security_invoker = true) as
select p.*,
  case when p.fin = 'en_curso' and p.ultimo < now() - interval '2 hours' then 'abandono' else p.fin end as estado
from public.partidas p;

create or replace view public.v_visitas_dia with (security_invoker = true) as
select date_trunc('day', inicio)::date as dia,
  count(*) as visitas,
  count(distinct dispositivo) as dispositivos,
  round(avg(extract(epoch from (ultimo - inicio)) / 60)::numeric, 1) as minutos_media
from public.sesiones
group by 1
order by 1 desc;

create or replace view public.v_retencion with (security_invoker = true) as
with d as (
  select dispositivo, min(inicio)::date as primera, max(inicio)::date as ultima, count(*) as visitas
  from public.sesiones group by 1
)
select count(*) as dispositivos,
  count(*) filter (where ultima > primera) as volvieron,
  round(100.0 * count(*) filter (where ultima > primera) / greatest(1, count(*)), 1) as pct
from d;

create or replace view public.v_rondas with (security_invoker = true) as
select oleada, count(*) as partidas from public.v_partidas where estado <> 'en_curso' group by 1 order by 1;

create or replace view public.v_clases with (security_invoker = true) as
select clase, count(*) as partidas, round(avg(oleada)::numeric, 2) as oleada_media, max(oleada) as oleada_max
from public.v_partidas where estado <> 'en_curso' group by 1 order by 2 desc;

create or replace view public.v_mejoras with (security_invoker = true) as
with ofrecidas as (select unnest(ofrecidas) as id from public.elecciones),
  o as (select id, count(*) as ofrecida from ofrecidas group by 1),
  e as (select elegida as id, count(*) as elegida from public.elecciones group by 1)
select o.id, o.ofrecida, coalesce(e.elegida, 0) as elegida,
  round(100.0 * coalesce(e.elegida, 0) / greatest(1, o.ofrecida), 1) as tasa
from o left join e using (id) order by tasa desc;

create or replace view public.v_compras with (security_invoker = true) as
select tipo, item, sum(cantidad) as unidades, count(*) as compras, sum(precio) as gastado,
  round(avg(oleada)::numeric, 1) as oleada_media
from public.compras group by 1, 2 order by compras desc;

create or replace view public.v_muertes with (security_invoker = true) as
select coalesce(causa, 'desconocida') as causa, count(*) as muertes,
  round(avg(oleada_muerte)::numeric, 1) as oleada_media
from public.partidas where fin = 'muerte' group by 1 order by 2 desc;

create or replace view public.v_armas_muerte with (security_invoker = true) as
select coalesce(arma_muerte, 'ninguna') as arma, count(*) as muertes
from public.partidas where fin = 'muerte' group by 1 order by 2 desc;

revoke all on public.v_partidas, public.v_visitas_dia, public.v_retencion, public.v_rondas, public.v_clases,
  public.v_mejoras, public.v_compras, public.v_muertes, public.v_armas_muerte from anon, authenticated;

/* ---------- clave y lectura para la página de estadísticas ---------- */

-- Sólo el dueño: `select fijar_clave('mi clave');` en el editor SQL. Volver a ejecutarla la cambia.
create or replace function public.fijar_clave(clave text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into public.config (clave, valor) values ('stats', extensions.crypt(clave, extensions.gen_salt('bf')))
  on conflict (clave) do update set valor = excluded.valor;
$$;
revoke execute on function public.fijar_clave(text) from public, anon, authenticated;

create or replace function public.clave_valida(clave text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.config
    where config.clave = 'stats' and valor = extensions.crypt(clave_valida.clave, valor)
  );
$$;
revoke execute on function public.clave_valida(text) from public, anon, authenticated;

-- Todo lo que pinta la página: agregados desde `desde` (null = todo). Con clave mala, error.
create or replace function public.estadisticas(clave text, desde timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  d timestamptz := coalesce(desde, '-infinity'::timestamptz);
  res jsonb;
begin
  if not public.clave_valida(clave) then
    raise exception 'clave incorrecta' using errcode = '28000';
  end if;

  with ses as (select * from public.sesiones where inicio >= d),
  par as (select * from public.v_partidas where inicio >= d),
  ele as (select * from public.elecciones where at >= d),
  com as (select * from public.compras where at >= d),
  disp as (
    select dispositivo, min(inicio)::date as primera, max(inicio)::date as ultima, count(*) as visitas
    from public.sesiones group by 1
  ),
  ses_dias as (select s.dispositivo, s.inicio::date as dia from ses s group by 1, 2)
  select jsonb_build_object(
    'generado', now(),
    'desde', desde,
    'resumen', (select jsonb_build_object(
      'visitas', (select count(*) from ses),
      'dispositivos', (select count(distinct dispositivo) from ses),
      'nuevos', (select count(*) from disp where primera >= d),
      'minutos_sesion', (select round(coalesce(avg(extract(epoch from (ultimo - inicio)) / 60), 0)::numeric, 1) from ses),
      'partidas', (select count(*) from par),
      'partidas_terminadas', (select count(*) from par where estado <> 'en_curso'),
      'minutos_partida', (select round(coalesce(avg(duracion) / 60.0, 0)::numeric, 1) from par where estado <> 'en_curso'),
      'oleada_media', (select round(coalesce(avg(oleada), 0)::numeric, 2) from par where estado <> 'en_curso'),
      'oleada_max', (select coalesce(max(oleada), 0) from par),
      'muertes', (select count(*) from par where fin = 'muerte')
    )),
    'visitas_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'visitas', visitas, 'dispositivos', dispositivos) order by dia), '[]'::jsonb)
      from (select inicio::date as dia, count(*) as visitas, count(distinct dispositivo) as dispositivos from ses group by 1) t),
    'retencion', (select jsonb_build_object(
      'dispositivos', count(*),
      'volvieron', count(*) filter (where ultima > primera),
      'pct', round(100.0 * count(*) filter (where ultima > primera) / greatest(1, count(*)), 1),
      -- de los que llegaron en el periodo, cuántos volvieron otro día (dentro o fuera del periodo)
      'nuevos', count(*) filter (where primera >= d),
      'nuevos_volvieron', count(*) filter (where primera >= d and ultima > primera)
    ) from disp),
    'dias_por_dispositivo', (select coalesce(jsonb_agg(jsonb_build_object('dias', dias, 'dispositivos', n) order by dias), '[]'::jsonb)
      from (select dias, count(*) as n from (select dispositivo, count(*) as dias from ses_dias group by 1) x group by 1) y),
    'rondas', (select coalesce(jsonb_agg(jsonb_build_object('oleada', oleada, 'partidas', n) order by oleada), '[]'::jsonb)
      from (select oleada, count(*) as n from par where estado <> 'en_curso' group by 1) t),
    'clases', (select coalesce(jsonb_agg(jsonb_build_object('clase', clase, 'partidas', n, 'oleada_media', om, 'oleada_max', mx) order by n desc), '[]'::jsonb)
      from (select coalesce(clase, '?') as clase, count(*) as n, round(avg(oleada)::numeric, 2) as om, max(oleada) as mx
            from par where estado <> 'en_curso' group by 1) t),
    'modos', (select coalesce(jsonb_agg(jsonb_build_object('modo', modo, 'partidas', n, 'oleada_media', om) order by n desc), '[]'::jsonb)
      from (select modo, count(*) as n, round(avg(oleada)::numeric, 2) as om from par where estado <> 'en_curso' group by 1) t),
    'mejoras', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ofrecida', ofrecida, 'elegida', elegida, 'tasa', tasa) order by tasa desc, elegida desc), '[]'::jsonb)
      from (
        with o as (select unnest(ofrecidas) as id from ele),
          oc as (select id, count(*) as ofrecida from o group by 1),
          ec as (select elegida as id, count(*) as elegida from ele group by 1)
        select oc.id, oc.ofrecida, coalesce(ec.elegida, 0) as elegida,
          round(100.0 * coalesce(ec.elegida, 0) / greatest(1, oc.ofrecida), 1) as tasa
        from oc left join ec using (id)
      ) t),
    'compras', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'item', item, 'unidades', u, 'compras', n, 'gastado', g, 'oleada_media', om) order by n desc), '[]'::jsonb)
      from (select tipo, item, sum(cantidad) as u, count(*) as n, sum(precio) as g, round(avg(oleada)::numeric, 1) as om from com group by 1, 2) t),
    'muertes', (select coalesce(jsonb_agg(jsonb_build_object('causa', causa, 'muertes', n, 'oleada_media', om) order by n desc), '[]'::jsonb)
      from (select coalesce(causa, 'desconocida') as causa, count(*) as n, round(avg(oleada_muerte)::numeric, 1) as om from par where fin = 'muerte' group by 1) t),
    'armas_muerte', (select coalesce(jsonb_agg(jsonb_build_object('arma', arma, 'muertes', n) order by n desc), '[]'::jsonb)
      from (select coalesce(arma_muerte, 'ninguna') as arma, count(*) as n from par where fin = 'muerte' group by 1) t),
    'finales', (select coalesce(jsonb_agg(jsonb_build_object('estado', estado, 'partidas', n) order by n desc), '[]'::jsonb)
      from (select estado, count(*) as n from par group by 1) t),
    'origenes', (select coalesce(jsonb_agg(jsonb_build_object('origen', origen, 'visitas', n) order by n desc), '[]'::jsonb)
      from (select coalesce(origen, '?') as origen, count(*) as n from ses group by 1) t),
    'tactil', (select coalesce(jsonb_agg(jsonb_build_object('tactil', tactil, 'visitas', n) order by n desc), '[]'::jsonb)
      from (select coalesce(tactil, false) as tactil, count(*) as n from ses group by 1) t)
  ) into res;
  return res;
end;
$$;
grant execute on function public.estadisticas(text, timestamptz) to anon, authenticated;
grant execute on function public.dz_record(jsonb), public.dz_sesion(jsonb), public.dz_partida(jsonb),
  public.dz_eleccion(jsonb), public.dz_compra(jsonb) to anon, authenticated;
