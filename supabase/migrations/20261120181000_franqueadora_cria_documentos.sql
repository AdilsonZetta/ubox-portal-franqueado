-- Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

alter policy categorias_ler on public.categorias
  using ((select app.fase3_gere('manuais')) or (
    (select app.fase3_ativo()) and (select app.tem_modulo(app.perfil(), 'manuais'))
    and (coalesce(publico, true) or uids @> array[(select auth.uid())])
  ));
alter policy categorias_criar on public.categorias
  with check ((select app.fase3_gere('manuais')) and publico is not null);
alter policy categorias_editar on public.categorias
  using ((select app.fase3_gere('manuais')))
  with check ((select app.fase3_gere('manuais')) and publico is not null);

alter policy documentos_ler on public.documentos
  using ((select app.fase3_gere('manuais')) or (
    (select app.fase3_ativo()) and (select app.tem_modulo(app.perfil(), 'manuais'))
    and status = 'publicado' and (publico or uids @> array[(select auth.uid())])
  ));
alter policy documentos_criar on public.documentos
  with check ((select app.fase3_gere('manuais')) and atualizado_por = (select auth.uid()));
alter policy documentos_editar on public.documentos
  using ((select app.fase3_gere('manuais')))
  with check ((select app.fase3_gere('manuais')) and atualizado_por = (select auth.uid()));

alter policy documento_versoes_ler on public.documento_versoes
  using ((select app.fase3_gere('manuais')));
alter policy documento_versoes_criar on public.documento_versoes
  with check ((select app.fase3_gere('manuais')) and autor_id = (select auth.uid()));
grant update (titulo, formato, conteudo_html, conteudo_texto, html_conteudo, html_url, autor_id, autor_nome)
  on public.documento_versoes to authenticated;
create policy documento_versoes_editar on public.documento_versoes for update to authenticated
  using ((select app.fase3_gere('manuais')))
  with check ((select app.fase3_gere('manuais')) and autor_id = (select auth.uid()));

alter policy avisos_ler on public.avisos
  using ((select app.eh_admin()) or (
    (select app.fase3_gere('manuais')) and tipo in ('novo', 'atualizado') and documento_id <> ''
  ) or (
    (select app.fase3_ativo()) and (select app.tem_modulo(app.perfil(), 'manuais'))
    and (publico or uids @> array[(select auth.uid())])
  ));
alter policy avisos_criar on public.avisos
  with check ((select app.eh_admin()) or (
    (select app.fase3_gere('manuais')) and tipo in ('novo', 'atualizado') and documento_id <> ''
    and exists (
      select 1 from public.documentos d where d.id = avisos.documento_id and d.status = 'publicado'
    )
  ));
grant update (titulo, mensagem, publico, unidades, papeis, uids_extra, uids)
  on public.avisos to authenticated;
create policy avisos_editar on public.avisos for update to authenticated
  using ((select app.fase3_gere('manuais')) and tipo in ('novo', 'atualizado') and documento_id <> '')
  with check ((select app.fase3_gere('manuais')) and tipo in ('novo', 'atualizado') and documento_id <> '');
