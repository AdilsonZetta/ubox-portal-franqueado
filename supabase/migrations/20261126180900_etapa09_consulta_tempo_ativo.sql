alter table public.manuais_trilha
  add column consulta_livre boolean not null default false;

alter table public.progresso_manuais
  add column segundos_ativos integer not null default 0 check (segundos_ativos between 0 and 14400),
  add column pausado_em timestamptz;

create or replace function app.fase3_cronometro() returns trigger
language plpgsql set search_path = '' as $$
declare
  progresso boolean := tg_table_name = 'progresso_manuais';
  tempo integer;
  pode_concluir boolean;
begin
  if not app.da_api() then return new; end if;
  new.atualizado_em := now();

  if tg_op = 'INSERT' then
    new.iniciado_em := now();
    if progresso then
      new.segundos_ativos := 0;
      new.pausado_em := null;
    end if;
    return new;
  end if;

  if progresso then
    tempo := app.fase3_tempo_manual(old.documento_id);
  end if;

  if old.status = 'em_andamento' and new.status = 'em_andamento'
    and new.reinicios = old.reinicios + 1 then
    if progresso then
      if (to_jsonb(new) - array['iniciado_em', 'reinicios', 'tempo_minimo_seg', 'atualizado_em'])
        is not distinct from (to_jsonb(old) - array['iniciado_em', 'reinicios', 'tempo_minimo_seg', 'atualizado_em'])
        and new.tempo_minimo_seg = tempo then
        new.iniciado_em := now();
        return new;
      end if;
    elsif (to_jsonb(new) - array['iniciado_em', 'reinicios', 'atualizado_em'])
      is not distinct from (to_jsonb(old) - array['iniciado_em', 'reinicios', 'atualizado_em']) then
      new.iniciado_em := now();
      return new;
    end if;
  end if;

  if old.status = 'em_andamento' and new.status = 'concluido'
    and (to_jsonb(new) - array['status', 'concluido_em', 'atualizado_em'])
      is not distinct from (to_jsonb(old) - array['status', 'concluido_em', 'atualizado_em']) then
    if progresso then
      pode_concluir := old.segundos_ativos + case when old.pausado_em is null
        then greatest(0, floor(extract(epoch from now() - old.iniciado_em)))::int
        else 0 end >= tempo;
    else
      pode_concluir := app.fase3_reestudo_pode_concluir(old.id);
    end if;
    if pode_concluir then
      new.concluido_em := now();
      return new;
    end if;
  end if;

  raise exception 'Alteração inválida do cronômetro.' using errcode = '42501';
end
$$;

create function public.cronometro_manual(p_documento text, p_acao text)
returns public.progresso_manuais
language plpgsql security definer set search_path = '' as $$
declare
  progresso public.progresso_manuais;
  -- O app registra a cada 15 s. O limite evita creditar toda a ausência após fechar a aba.
  limite_credito constant integer := 45;
  credito integer := 0;
begin
  if auth.uid() is null or app.fase3_aluno('manuais') is not true then
    raise exception 'Sem permissão para usar o cronômetro.' using errcode = '42501';
  end if;
  if p_acao is null or p_acao not in ('retomar', 'pausar', 'registrar') then
    raise exception 'Ação de cronômetro inválida.' using errcode = '22023';
  end if;

  select * into progresso from public.progresso_manuais
  where id = auth.uid()::text || '_' || p_documento
  for update;
  if not found then
    raise exception 'Progresso não encontrado.' using errcode = 'P0002';
  end if;
  if progresso.status = 'concluido' then return progresso; end if;

  if not exists (select 1 from public.manuais_trilha where id = p_documento and ativo) then
    raise exception 'Este manual não está ativo na trilha.' using errcode = '42501';
  end if;
  if progresso.pausado_em is not null then
    if p_acao = 'pausar' then return progresso; end if;
    if p_acao = 'registrar' then
      raise exception 'Retome a leitura antes de registrar.' using errcode = '42501';
    end if;
  end if;

  if p_acao <> 'retomar' then
    credito := least(limite_credito, greatest(0, floor(extract(epoch from now() - progresso.iniciado_em))));
  end if;

  update public.progresso_manuais
  set segundos_ativos = least(14400, progresso.segundos_ativos + credito),
      iniciado_em = case when p_acao = 'pausar' then progresso.iniciado_em else now() end,
      pausado_em = case when p_acao = 'pausar' then now() else null end,
      atualizado_em = now()
  where id = progresso.id
  returning * into progresso;

  return progresso;
end
$$;

revoke all on function public.cronometro_manual(text, text) from public, anon;
grant execute on function public.cronometro_manual(text, text) to authenticated;
