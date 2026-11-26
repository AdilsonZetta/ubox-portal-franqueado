alter table public.chamados
  add column pausado_em timestamptz,
  add column pausa_acumulada_seg integer not null default 0 check (pausa_acumulada_seg >= 0);

update public.chamados
set pausado_em = coalesce(atualizado_em, now())
where status = 'aguardando_franqueado' and pausado_em is null;

create function app.chamado_pausa_prazo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.pausa_acumulada_seg := 0;
    new.pausado_em := case when new.status = 'aguardando_franqueado' then now() end;
    return new;
  end if;

  if new.reaberto_em is distinct from old.reaberto_em then
    new.pausa_acumulada_seg := 0;
    new.pausado_em := case when new.status = 'aguardando_franqueado' then now() end;
    return new;
  end if;

  new.pausa_acumulada_seg := old.pausa_acumulada_seg;
  new.pausado_em := old.pausado_em;
  if old.status = 'aguardando_franqueado' and new.status <> 'aguardando_franqueado' then
    if old.pausado_em is not null then
      new.pausa_acumulada_seg := old.pausa_acumulada_seg
        + greatest(0, floor(extract(epoch from now() - old.pausado_em)))::int;
    end if;
    new.pausado_em := null;
  elsif new.status = 'aguardando_franqueado' and old.status <> 'aguardando_franqueado' then
    new.pausado_em := now();
  end if;

  return new;
end
$$;

revoke all on function app.chamado_pausa_prazo() from public, anon, authenticated;

-- A ordem alfabética executa este gatilho depois de chamado_carimbo, que carimba a reabertura.
create trigger chamado_pausa_prazo before insert or update on public.chamados
  for each row execute function app.chamado_pausa_prazo();
