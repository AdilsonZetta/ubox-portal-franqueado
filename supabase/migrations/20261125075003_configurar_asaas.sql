create function public.ubox_asaas_ler_configuracao()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return (
    select decrypted_secret::jsonb
    from vault.decrypted_secrets
    where name = 'ubox_asaas_boletos'
  );
end;
$$;

create function public.ubox_asaas_salvar_configuracao(p_ambiente text, p_chave text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  segredo_id uuid;
  conteudo text;
begin
  if p_ambiente is null or p_ambiente not in ('sandbox', 'producao')
    or p_chave is null or char_length(p_chave) not between 16 and 512
    or p_chave ~ '[[:space:][:cntrl:]]'
    or left(p_chave, 11) <> (case when p_ambiente = 'sandbox' then '$aact_hmlg_' else '$aact_prod_' end)
  then
    raise exception using errcode = '22023', message = 'Configuração do Asaas inválida';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ubox_asaas_boletos', 0));
  conteudo := pg_catalog.jsonb_build_object('ambiente', p_ambiente, 'chave', p_chave)::text;
  select id into segredo_id from vault.secrets where name = 'ubox_asaas_boletos';
  if segredo_id is null then
    perform vault.create_secret(conteudo, 'ubox_asaas_boletos', 'Credencial do Asaas para consultar boletos');
  else
    perform vault.update_secret(segredo_id, conteudo);
  end if;
end;
$$;

revoke all on function public.ubox_asaas_ler_configuracao() from public, anon, authenticated;
revoke all on function public.ubox_asaas_salvar_configuracao(text, text) from public, anon, authenticated;
grant execute on function public.ubox_asaas_ler_configuracao() to service_role;
grant execute on function public.ubox_asaas_salvar_configuracao(text, text) to service_role;
