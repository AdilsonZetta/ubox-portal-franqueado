alter table public.unidades
  add column uf text not null default '' constraint unidades_uf_check check (uf in (
    '', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
    'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  )),
  add column cnpj text not null default '' constraint unidades_cnpj_check check (cnpj = '' or cnpj ~ '^[0-9]{14}$'),
  drop constraint if exists unidades_responsavel_check,
  drop constraint if exists unidades_email_check,
  alter column responsavel set default '',
  alter column email set default '',
  add constraint unidades_responsavel_opcional_check check (responsavel = '' or char_length(responsavel) between 2 and 120),
  add constraint unidades_email_opcional_check check (email = '' or char_length(email) between 4 and 199);

create function public.salvar_unidade(
  p_id text, p_nome text, p_cidade text, p_uf text, p_cnpj text, p_modulos text[], p_ativo boolean
) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  unidade_id_salva text;
begin
  if coalesce(p_id, '') = '' then
    insert into public.unidades (nome, cidade, uf, cnpj, modulos_liberados, ativo, criado_por)
    values (trim(p_nome), trim(p_cidade), p_uf, p_cnpj, p_modulos, p_ativo, (select auth.uid()))
    returning id into unidade_id_salva;
    return unidade_id_salva;
  end if;

  update public.unidades
    set nome = trim(p_nome), cidade = trim(p_cidade), uf = p_uf, cnpj = p_cnpj,
        modulos_liberados = p_modulos, ativo = p_ativo
    where id = p_id;
  if not found then
    raise exception 'Sem permissão para editar a unidade.' using errcode = '42501';
  end if;

  -- O gatilho de usuários consulta o teto de módulos já atualizado.
  update public.usuarios u
    set unidade = trim(p_nome), cidade = trim(p_cidade),
        modulos_liberados = array(select m from unnest(u.modulos_liberados) as m where m = any(p_modulos))
    where u.unidade_id = p_id and u.papel in ('franqueado', 'equipe_franqueado');
  return p_id;
end
$$;

create function public.definir_responsavel_unidade(p_unidade_id text, p_uid uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not app.eh_admin() then
    raise exception 'Sem permissão para definir o responsável.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.usuarios where id = p_uid and unidade_id = p_unidade_id and papel = 'franqueado'
  ) then
    raise exception 'O responsável precisa ser um gestor desta unidade.' using errcode = '22023';
  end if;

  update public.unidades x
    set uid = u.id,
        responsavel = coalesce(nullif(x.responsavel, ''), u.nome),
        email = coalesce(nullif(x.email, ''), u.email)
    from public.usuarios u
    where x.id = p_unidade_id and x.uid is null
      and u.id = p_uid and u.unidade_id = x.id and u.papel = 'franqueado';
end
$$;

revoke all on function public.salvar_unidade(text, text, text, text, text, text[], boolean),
  public.definir_responsavel_unidade(text, uuid) from public, anon;
grant execute on function public.salvar_unidade(text, text, text, text, text, text[], boolean),
  public.definir_responsavel_unidade(text, uuid) to authenticated;
