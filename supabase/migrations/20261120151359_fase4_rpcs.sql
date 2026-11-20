-- As FKs adiadas exigem que prova e gabarito, assim como tentativa e folha,
-- sejam gravados na mesma transação do PostgREST. As RPCs usam o papel de
-- quem chamou para aplicar as políticas RLS e os gatilhos da fase 4.
-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

create function public.salvar_prova_universidade(p_prova jsonb, p_gabarito jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  insert into public.provas (
    id, titulo, nota_minima, perguntas, total_perguntas, manual_retorno_id,
    tempo_reestudo_seg, versao, publicado, atualizado_por, atualizado_por_nome
  )
  select id, titulo, nota_minima, perguntas, total_perguntas, manual_retorno_id,
         tempo_reestudo_seg, versao, publicado, atualizado_por, atualizado_por_nome
  from jsonb_populate_record(null::public.provas, p_prova)
  on conflict (id) do update set
    titulo = excluded.titulo,
    nota_minima = excluded.nota_minima,
    perguntas = excluded.perguntas,
    total_perguntas = excluded.total_perguntas,
    manual_retorno_id = excluded.manual_retorno_id,
    tempo_reestudo_seg = excluded.tempo_reestudo_seg,
    versao = excluded.versao,
    publicado = excluded.publicado,
    atualizado_por = excluded.atualizado_por,
    atualizado_por_nome = excluded.atualizado_por_nome;

  insert into public.provas_gabarito (id, corretas, versao, atualizado_por)
  select id, corretas, versao, atualizado_por
  from jsonb_populate_record(null::public.provas_gabarito, p_gabarito)
  on conflict (id) do update set
    corretas = excluded.corretas,
    versao = excluded.versao,
    atualizado_por = excluded.atualizado_por;
end;
$$;

create function public.enviar_tentativa_universidade(p_tentativa jsonb, p_folha jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  insert into public.tentativas_prova (
    id, uid, curso_id, ciclo, numero, nome, unidade_id, unidade_nome, versao
  )
  select id, uid, curso_id, ciclo, numero, nome, unidade_id, unidade_nome, versao
  from jsonb_populate_record(null::public.tentativas_prova, p_tentativa);

  insert into public.tentativas_prova_folha (tentativa_id, uid, versao, respostas)
  select tentativa_id, uid, versao, respostas
  from jsonb_populate_record(null::public.tentativas_prova_folha, p_folha);
end;
$$;

revoke execute on function public.salvar_prova_universidade(jsonb, jsonb) from public, anon;
revoke execute on function public.enviar_tentativa_universidade(jsonb, jsonb) from public, anon;
grant execute on function public.salvar_prova_universidade(jsonb, jsonb) to authenticated;
grant execute on function public.enviar_tentativa_universidade(jsonb, jsonb) to authenticated;
