-- A lista de designados usa o mesmo acesso à trilha e aos resultados das provas.
create function public.designados_manuais()
returns table (uid uuid, nome text, unidade_id text, unidade_nome text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nome, u.id, u.nome
  from public.usuarios p join public.unidades u on u.id = p.unidade_id
  where app.conta_ativa(p) and u.ativo
    and p.papel in ('franqueado', 'equipe_franqueado') and app.tem_modulo(p, 'manuais')
    and ((select app.fase3_gere('manuais')) or (
      (select app.fase3_aluno('manuais')) and (select (app.perfil()).papel) = 'franqueado'
      and u.id = (select app.minha_unidade_id())
    ))
$$;

create function public.designados_universidade()
returns table (uid uuid, nome text, unidade_id text, unidade_nome text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nome, u.id, u.nome
  from public.usuarios p join public.unidades u on u.id = p.unidade_id
  where app.conta_ativa(p) and u.ativo
    and p.papel in ('franqueado', 'equipe_franqueado') and app.tem_modulo(p, 'universidade')
    and ((select app.fase3_gere('universidade')) or app.fase4_le_resultado_unidade(u.id))
$$;

create function public.unidades_do_estoque()
returns table (id text, nome text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.nome from public.unidades u
  where (select app.gere_estoque()) and u.ativo and 'estoque' = any(u.modulos_liberados)
$$;

-- Serializa a primeira gravação por unidade, inclusive entre sessões. Mantém as
-- políticas e triggers da tabela em vigor e reutiliza a aberta mais recente.
create function public.salvar_contagem_aberta_estoque(p_id text, p_itens jsonb, p_obs text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  perfil public.usuarios := app.perfil();
  contagem_id text := p_id;
  divergencias integer;
begin
  if not coalesce(app.unidade_estoque(), false) then
    raise exception 'Unidade inválida para estoque' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('estoque_contagem:' || perfil.unidade_id, 0));
  select count(*)::integer into divergencias
  from jsonb_array_elements(p_itens) l
  where jsonb_typeof(l->'contado') = 'number' and l->'diferenca' <> '0'::jsonb;

  if contagem_id is null then
    select c.id into contagem_id from public.estoque_contagens c
    where c.unidade_id = perfil.unidade_id and c.status = 'aberta'
    order by c.atualizado_em desc, c.id limit 1;
  end if;

  if contagem_id is null then
    if not exists (select 1 from jsonb_array_elements(p_itens) l where jsonb_typeof(l->'contado') = 'number') then
      raise exception 'Conte pelo menos um item para iniciar a contagem' using errcode = '22023';
    end if;
    insert into public.estoque_contagens (unidade_id, unidade_nome, itens, total_itens, total_divergencias, obs)
    values (perfil.unidade_id, perfil.unidade, p_itens, jsonb_array_length(p_itens), divergencias, p_obs)
    returning id into contagem_id;
  else
    update public.estoque_contagens
    set itens = p_itens, total_itens = jsonb_array_length(p_itens), total_divergencias = divergencias, obs = p_obs
    where id = contagem_id and unidade_id = perfil.unidade_id and status = 'aberta';
    if not found then
      raise exception 'Contagem aberta não disponível' using errcode = '42501';
    end if;
  end if;
  return contagem_id;
end;
$$;

revoke all on function public.designados_manuais(), public.designados_universidade(),
  public.unidades_do_estoque(), public.salvar_contagem_aberta_estoque(text, jsonb, text) from public, anon;
grant execute on function public.designados_manuais(), public.designados_universidade(),
  public.unidades_do_estoque(), public.salvar_contagem_aberta_estoque(text, jsonb, text) to authenticated;
