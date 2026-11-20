-- Fase 2: gestão de acessos. Duas operações que o Firestore fazia em transação viram funções
-- SECURITY INVOKER (rodam como quem chama: o RLS e os gatilhos da fase 1 continuam valendo).
-- O login da pessoa nova é criado antes pela Edge Function criar-conta (service_role só no servidor).
-- Feito por Grok Bot no Cursor (Antigravity sem cota).

-- Admin cadastra a unidade e o perfil do responsável (login já criado com p_uid), tudo ou nada.
create function public.criar_unidade_com_responsavel(
  p_unidade_id text,
  p_nome text,
  p_cidade text,
  p_responsavel text,
  p_email text,
  p_modulos text[],
  p_uid uuid
) returns text
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.unidades (id, nome, cidade, responsavel, email, modulos_liberados, ativo, criado_por)
  values (p_unidade_id, trim(p_nome), trim(p_cidade), trim(p_responsavel), trim(p_email), p_modulos, true, (select auth.uid()));

  insert into public.usuarios (id, email, nome, papel, ativo, recusado, unidade, cidade, unidade_id, modulos_liberados, criado_por)
  values (p_uid, trim(p_email), trim(p_responsavel), 'franqueado', true, false, trim(p_nome), trim(p_cidade), p_unidade_id, p_modulos, (select auth.uid()));

  update public.unidades set uid = p_uid where id = p_unidade_id;
  if not found then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return p_unidade_id;
end
$$;

-- Admin edita a unidade e propaga para o responsável e a equipe (módulos da equipe ficam dentro dos da unidade).
create function public.atualizar_unidade(
  p_id text,
  p_nome text,
  p_cidade text,
  p_responsavel text,
  p_modulos text[],
  p_ativo boolean
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  dono uuid;
begin
  update public.unidades
     set nome = trim(p_nome), cidade = trim(p_cidade), responsavel = trim(p_responsavel),
         modulos_liberados = p_modulos, ativo = p_ativo
   where id = p_id
  returning uid into dono;
  if not found then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if dono is not null then
    update public.usuarios
       set nome = trim(p_responsavel), unidade = trim(p_nome), cidade = trim(p_cidade),
           modulos_liberados = p_modulos, ativo = p_ativo
     where id = dono;
  end if;

  update public.usuarios u
     set modulos_liberados = array(select m from unnest(u.modulos_liberados) as m where m = any (p_modulos)),
         unidade = trim(p_nome), cidade = trim(p_cidade), ativo = p_ativo
   where u.unidade_id = p_id and u.papel = 'equipe_franqueado' and u.id is distinct from dono;
end
$$;

revoke all on function public.criar_unidade_com_responsavel(text, text, text, text, text, text[], uuid) from public, anon;
revoke all on function public.atualizar_unidade(text, text, text, text, text[], boolean) from public, anon;
grant execute on function public.criar_unidade_com_responsavel(text, text, text, text, text, text[], uuid) to authenticated;
grant execute on function public.atualizar_unidade(text, text, text, text, text[], boolean) to authenticated;

