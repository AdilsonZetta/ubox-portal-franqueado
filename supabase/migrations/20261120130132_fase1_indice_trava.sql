-- Fase 1: índice da FK da trava do 1º admin (aviso do advisor de desempenho).
create index if not exists admin_lock_uid_idx on public.admin_lock (uid);
