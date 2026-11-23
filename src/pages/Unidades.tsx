import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, ChevronRight } from 'lucide-react'
import { LinkCriado, type AcessoPorLink } from '../components/LinkCriado'
import { Aviso, Button, Campo, Carregando, Selo, Vazio, inputClass } from '../components/ui'
import { SLUGS_FRANQUEADO } from '../data/modulos'
import { BACKEND } from '../lib/backend'
import { atualizarModulosDoUsuario, atualizarUnidade, listarUnidades } from '../lib/gestao'
import {
  buscarUnidadeSb, criarContaSb, definirResponsavelUnidadeSb, listarUsuariosDaUnidadeSb,
  salvarUnidadeSb, type DadosUnidade,
} from '../lib/gestaoSupabase'
import { cnpjValido, filtrarUnidades, formatarCnpj, ufValida, UFS_BRASIL, type FiltroStatusUnidade } from '../lib/unidades'
import type { Unidade, Usuario } from '../types'
import { Checks, GerarNovoLink, useListaAcessos } from './GestaoAcessos'

const usaSupabase = BACKEND === 'supabase'
const classeFormulario = 'space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-6'
const classeLink = 'inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-ink hover:underline'

function LocalUnidade({ unidade }: { unidade: Unidade }) {
  const local = [unidade.cidade, unidade.uf].filter(Boolean).join(' / ')
  return (
    <div className="space-y-1 text-sm text-muted">
      {local && <p>{local}</p>}
      {unidade.cnpj && <p>CNPJ {formatarCnpj(unidade.cnpj)}</p>}
    </div>
  )
}

function EstadoUnidade({ ativo }: { ativo: boolean }) {
  return <Selo tom={ativo ? 'lima' : 'neutro'}>{ativo ? 'Ativa' : 'Inativa'}</Selo>
}

function ErroCarga({ erro, tentar }: { erro: string; tentar: () => void }) {
  return <Aviso tom="erro"><span role="alert">{erro}</span> <Button variant="ghost" onClick={tentar}>Tentar novamente</Button></Aviso>
}

function confirmarStatusUnidade(unidade: Unidade, ativo: boolean) {
  return window.confirm(ativo
    ? `Ativar a unidade ${unidade.nome}?`
    : `Desativar a unidade ${unidade.nome}? As pessoas desta unidade perderão o acesso ao portal.`)
}

function salvarUnidade(unidade: Unidade | null, dados: DadosUnidade) {
  if (!usaSupabase && unidade) {
    return atualizarUnidade(unidade, { ...dados, responsavel: unidade.responsavel })
  }
  return salvarUnidadeSb(unidade?.id ?? null, dados)
}

function FormUnidade({ unidade, ocupado, cancelar, salvar }: {
  unidade: Unidade | null
  ocupado: boolean
  cancelar: () => void
  salvar: (dados: DadosUnidade) => void
}) {
  const [dados, setDados] = useState<DadosUnidade>(() => unidade ?? {
    nome: '', cidade: '', uf: '', cnpj: '', modulosLiberados: ['manuais', 'universidade'], ativo: true,
  })
  const [erro, setErro] = useState('')
  const cnpj = dados.cnpj ?? ''
  const uf = dados.uf ?? ''

  return (
    <form className={classeFormulario} onSubmit={(evento) => {
      evento.preventDefault()
      if (ocupado) return
      setErro('')
      if (dados.nome.trim().length < 2 || !dados.cidade.trim()) {
        setErro('Informe o nome e a cidade da unidade.')
        return
      }
      // Unidades antigas podem manter a UF em branco.
      if (usaSupabase && !ufValida(uf) && (uf || !unidade || unidade.uf)) {
        setErro('Selecione uma UF brasileira.')
        return
      }
      if (usaSupabase && !cnpjValido(cnpj)) {
        setErro('Informe um CNPJ com dígitos verificadores válidos.')
        return
      }
      if (unidade && dados.ativo !== unidade.ativo && !confirmarStatusUnidade(unidade, dados.ativo)) return
      salvar({ ...dados, nome: dados.nome.trim(), cidade: dados.cidade.trim(), cnpj: cnpj.replace(/\D/g, '') })
    }}>
      <h2 className="text-lg font-semibold">{unidade ? 'Editar unidade' : 'Nova unidade'}</h2>
      {erro && <Aviso tom="erro"><span role="alert">{erro}</span></Aviso>}
      <fieldset disabled={ocupado} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome da unidade"><input name="nome" autoComplete="organization" className={inputClass} required maxLength={120} value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} /></Campo>
          <Campo label="Cidade"><input name="cidade" autoComplete="address-level2" className={inputClass} required maxLength={120} value={dados.cidade} onChange={(e) => setDados({ ...dados, cidade: e.target.value })} /></Campo>
          {usaSupabase && <>
            <Campo label="UF">
              <select name="uf" autoComplete="address-level1" className={inputClass} required={!unidade || Boolean(unidade.uf)} value={uf} onChange={(e) => setDados({ ...dados, uf: e.target.value })}>
                <option value="">Selecione</option>
                {UFS_BRASIL.map((sigla) => <option key={sigla}>{sigla}</option>)}
              </select>
            </Campo>
            <Campo label="CNPJ (opcional)">
              <input name="cnpj" className={inputClass} inputMode="numeric" value={formatarCnpj(cnpj)} onChange={(e) => setDados({ ...dados, cnpj: formatarCnpj(e.target.value) })} />
            </Campo>
          </>}
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Módulos liberados</legend>
          <Checks valor={dados.modulosLiberados} teto={SLUGS_FRANQUEADO} onChange={(modulosLiberados) => setDados({ ...dados, modulosLiberados })} />
        </fieldset>
        <label className="flex min-h-11 w-fit items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={dados.ativo} onChange={(e) => setDados({ ...dados, ativo: e.target.checked })} /> Ativa
        </label>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar unidade'}</Button>
        <Button type="button" variant="secondary" disabled={ocupado} onClick={cancelar}>Cancelar</Button>
      </div>
    </form>
  )
}

export function FranqueadoraPage() {
  const estado = useListaAcessos(listarUnidades)
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState<FiltroStatusUnidade>('todas')
  const [form, setForm] = useState<{ unidade: Unidade | null } | null>(null)
  const navegar = useNavigate()
  const filtradas = filtrarUnidades(estado.lista, busca, status)
  const pronto = !estado.carregando && !estado.erroCarga

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="cabecalho-pagina flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Unidades e usuários</h1>
          <p className="text-sm text-muted">Crie as unidades franqueadas e os usuários de cada uma.</p>
        </div>
        {usaSupabase && <Button disabled={estado.bloqueado || Boolean(form)} onClick={() => { estado.setErro(''); setForm({ unidade: null }) }}>Nova unidade</Button>}
      </header>
      {!usaSupabase && <Aviso>O cadastro de unidades e a gestão dos usuários de cada unidade estão disponíveis com o backend Supabase.</Aviso>}
      {estado.erro && <Aviso tom="erro"><span role="alert">{estado.erro}</span></Aviso>}
      {form && <FormUnidade key={form.unidade?.id ?? 'nova'} unidade={form.unidade} ocupado={estado.bloqueado}
        cancelar={() => { setForm(null); estado.setErro('') }}
        salvar={(dados) => void estado.gravar(async () => {
          const id = await salvarUnidade(form.unidade, dados)
          setForm(null)
          if (!form.unidade && id) navegar(`/franqueadora/unidade/${encodeURIComponent(id)}`)
        })} />}
      <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-[1fr_12rem]">
        <Campo label="Buscar unidade"><input name="busca" type="search" className={inputClass} placeholder="Nome ou cidade" value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
        <Campo label="Status">
          <select name="status" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as FiltroStatusUnidade)}>
            <option value="todas">Todas</option><option value="ativas">Ativas</option><option value="inativas">Inativas</option>
          </select>
        </Campo>
      </div>
      {estado.carregando && <Carregando texto="Carregando unidades…" />}
      {estado.erroCarga && <ErroCarga erro={estado.erroCarga} tentar={estado.recarregar} />}
      {pronto && filtradas.length === 0 && (
        busca || status !== 'todas'
          ? <Vazio titulo="Nenhuma unidade encontrada" texto="Ajuste a busca ou limpe os filtros." acao={<Button variant="secondary" onClick={() => { setBusca(''); setStatus('todas') }}>Limpar filtros</Button>} />
          : <Vazio titulo="Nenhuma unidade cadastrada" texto={usaSupabase ? 'Cadastre a primeira unidade para começar a adicionar usuários.' : 'As unidades cadastradas aparecerão aqui.'} />
      )}
      {pronto && filtradas.length > 0 && <ul className="grid gap-4 sm:grid-cols-2">
        {filtradas.map((unidade) => (
          <li key={unidade.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="flex items-start gap-3 p-4 sm:p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-dark"><Building2 className="size-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1 space-y-1">
                <h2 className="break-words font-semibold">
                  {usaSupabase ? <Link className="rounded-sm underline-offset-4 hover:underline" to={`/franqueadora/unidade/${encodeURIComponent(unidade.id)}`}>{unidade.nome}</Link> : unidade.nome}
                </h2>
                <LocalUnidade unidade={unidade} />
              </div>
              <EstadoUnidade ativo={unidade.ativo} />
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
              {usaSupabase && <Link className={classeLink + ' mr-auto'} to={`/franqueadora/unidade/${encodeURIComponent(unidade.id)}`}>
                Ver usuários<ChevronRight className="size-4" aria-hidden="true" />
              </Link>}
              <Button variant="ghost" disabled={estado.bloqueado || Boolean(form)} onClick={() => { estado.setErro(''); setForm({ unidade }) }}>Editar</Button>
              <Button variant={unidade.ativo ? 'danger' : 'secondary'} disabled={estado.bloqueado || Boolean(form)} onClick={() => {
                const ativo = !unidade.ativo
                if (confirmarStatusUnidade(unidade, ativo)) void estado.gravar(() => salvarUnidade(unidade, { ...unidade, ativo }))
              }}>{unidade.ativo ? 'Desativar' : 'Ativar'}</Button>
            </div>
          </li>
        ))}
      </ul>}
    </div>
  )
}

type PapelDaUnidade = 'franqueado' | 'equipe_franqueado'

function FormUsuario({ unidade, ocupado, cancelar, criado }: {
  unidade: Unidade
  ocupado: boolean
  cancelar: () => void
  criado: (dados: { nome: string; email: string; papel: PapelDaUnidade; modulosLiberados: string[] }) => void
}) {
  const [dados, setDados] = useState({ nome: '', email: '', papel: 'equipe_franqueado' as PapelDaUnidade, modulosLiberados: [] as string[] })
  return (
    <form className={classeFormulario} onSubmit={(evento) => {
      evento.preventDefault()
      if (!ocupado) criado({ ...dados, nome: dados.nome.trim(), email: dados.email.trim().toLowerCase() })
    }}>
      <h3 className="text-lg font-semibold">Novo usuário</h3>
      <fieldset disabled={ocupado} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome"><input name="nome" autoComplete="off" className={inputClass} required minLength={2} maxLength={120} value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} /></Campo>
          <Campo label="E-mail"><input name="email" type="email" autoComplete="off" spellCheck={false} className={inputClass} required maxLength={199} value={dados.email} onChange={(e) => setDados({ ...dados, email: e.target.value })} /></Campo>
          <Campo label="Função">
            <select name="papel" className={inputClass} value={dados.papel} onChange={(e) => setDados({ ...dados, papel: e.target.value as PapelDaUnidade })}>
              <option value="franqueado">Gestor da unidade</option>
              <option value="equipe_franqueado">Colaborador</option>
            </select>
          </Campo>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Módulos liberados</legend>
          {unidade.modulosLiberados.length ? <Checks valor={dados.modulosLiberados} teto={unidade.modulosLiberados} onChange={(modulosLiberados) => setDados({ ...dados, modulosLiberados })} />
            : <p className="text-sm text-muted">Esta unidade ainda não tem módulos liberados.</p>}
        </fieldset>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={ocupado}>{ocupado ? 'Criando…' : 'Criar usuário'}</Button>
        <Button type="button" variant="secondary" disabled={ocupado} onClick={cancelar}>Cancelar</Button>
      </div>
    </form>
  )
}

function ModulosUsuario({ pessoa, unidade, ocupado, salvar, cancelar }: {
  pessoa: Usuario
  unidade: Unidade
  ocupado: boolean
  salvar: (modulos: string[]) => void
  cancelar: () => void
}) {
  const [modulos, setModulos] = useState(() => (pessoa.modulosLiberados ?? []).filter((slug) => unidade.modulosLiberados.includes(slug)))
  return (
    <form className="mt-4 space-y-3 border-t border-line pt-4" onSubmit={(evento) => { evento.preventDefault(); if (!ocupado) salvar(modulos) }}>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Módulos de {pessoa.nome}</legend>
        {unidade.modulosLiberados.length ? <Checks valor={modulos} teto={unidade.modulosLiberados} disabled={ocupado} onChange={setModulos} />
          : <p className="text-sm text-muted">Esta unidade ainda não tem módulos liberados.</p>}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar módulos'}</Button>
        <Button type="button" variant="secondary" disabled={ocupado} onClick={cancelar}>Cancelar</Button>
      </div>
    </form>
  )
}

function DetalheUnidade({ id }: { id: string }) {
  const consultar = useCallback(async () => {
    const [unidade, pessoas] = await Promise.all([buscarUnidadeSb(id), listarUsuariosDaUnidadeSb(id)])
    return unidade ? [{ unidade, pessoas }] : []
  }, [id])
  const estado = useListaAcessos(consultar)
  const [painel, setPainel] = useState<{ tipo: 'unidade' | 'novo' } | { tipo: 'modulos'; uid: string } | null>(null)
  const [acessoCriado, setAcessoCriado] = useState<AcessoPorLink | null>(null)
  const [avisoResponsavel, setAvisoResponsavel] = useState(false)
  const { unidade, pessoas } = estado.lista[0] ?? { unidade: null, pessoas: [] }
  const bloquear = estado.bloqueado || Boolean(painel)

  function fecharPainel() {
    estado.setErro('')
    setPainel(null)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/franqueadora" className={classeLink}><ArrowLeft className="size-4" aria-hidden="true" /> Voltar para unidades</Link>
      {estado.erro && <Aviso tom="erro"><span role="alert">{estado.erro}</span></Aviso>}
      {acessoCriado && <LinkCriado key={acessoCriado.link ?? acessoCriado.uid} acesso={acessoCriado} aoFechar={() => setAcessoCriado(null)} ocupado={estado.gravando} />}
      {avisoResponsavel && <Aviso><span role="status">O login foi criado, mas não foi possível registrar esse gestor como responsável da unidade.</span></Aviso>}
      {estado.carregando && <Carregando texto="Carregando unidade e usuários…" />}
      {estado.erroCarga && <ErroCarga erro={estado.erroCarga} tentar={estado.recarregar} />}
      {!estado.carregando && !estado.erroCarga && !unidade && <Vazio titulo="Unidade não encontrada" texto="Volte à lista para escolher outra unidade." />}
      {unidade && !estado.erroCarga && <>
        <header className="cabecalho-pagina flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="break-words text-2xl font-bold">{unidade.nome}</h1>
              <EstadoUnidade ativo={unidade.ativo} />
            </div>
            <LocalUnidade unidade={unidade} />
          </div>
          <Button variant="secondary" disabled={bloquear} onClick={() => setPainel({ tipo: 'unidade' })}>Editar</Button>
        </header>
        {!unidade.ativo && <Aviso>Unidade inativa. Nenhum usuário desta unidade consegue entrar no portal.</Aviso>}
        {painel?.tipo === 'unidade' && <FormUnidade unidade={unidade} ocupado={estado.bloqueado} cancelar={fecharPainel}
          salvar={(dados) => void estado.gravar(async () => { await salvarUnidadeSb(id, dados); fecharPainel() })} />}
        <section aria-labelledby="usuarios-unidade" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="usuarios-unidade" className="text-xl font-bold">Usuários da unidade</h2>
            <Button disabled={bloquear} onClick={() => {
              setAcessoCriado(null)
              setAvisoResponsavel(false)
              estado.setErro('')
              setPainel({ tipo: 'novo' })
            }}>Novo usuário</Button>
          </div>
          {painel?.tipo === 'novo' && <FormUsuario unidade={unidade} ocupado={estado.bloqueado} cancelar={fecharPainel}
            criado={(novo) => void estado.gravar(async () => {
              if (novo.nome.length < 2) throw new Error('Informe o nome do usuário.')
              const acesso = await criarContaSb({
                ...novo, tipo: 'equipe', ativo: true, unidadeId: id, unidade: unidade.nome, cidade: unidade.cidade,
              })
              setAcessoCriado({ ...acesso, email: novo.email })
              fecharPainel()
              if (novo.papel === 'franqueado' && !unidade.uid) {
                try {
                  await definirResponsavelUnidadeSb(id, acesso.uid)
                } catch {
                  setAvisoResponsavel(true)
                }
              }
            })} />}
          {!estado.carregando && !pessoas.length && <Vazio titulo="Nenhum usuário na unidade" texto="Cadastre um gestor ou colaborador em Novo usuário." />}
          {pessoas.length > 0 && <ul className="space-y-3">
            {pessoas.map((pessoa) => (
              <li key={pessoa.uid} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h3 className="break-words font-semibold">{pessoa.nome}</h3>
                    <p className="break-all text-sm text-muted">{pessoa.email}</p>
                    <div className="flex flex-wrap gap-2">
                      <Selo>{pessoa.papel === 'franqueado' ? 'Gestor' : 'Colaborador'}</Selo>
                      <Selo tom={pessoa.ativo ? 'lima' : 'neutro'}>{pessoa.ativo ? 'Ativo' : 'Inativo'}</Selo>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <GerarNovoLink pessoa={pessoa} estado={estado} desabilitado={Boolean(painel)} aoGerar={setAcessoCriado} />
                    <Button variant="ghost" disabled={bloquear} onClick={() => { estado.setErro(''); setPainel({ tipo: 'modulos', uid: pessoa.uid }) }}>Editar módulos</Button>
                    <Button variant={pessoa.ativo ? 'danger' : 'secondary'} disabled={bloquear} onClick={() => {
                      const acao = pessoa.ativo ? 'Desativar' : 'Reativar'
                      if (window.confirm(`${acao} o acesso de ${pessoa.nome}?`)) {
                        void estado.gravar(() => atualizarModulosDoUsuario(pessoa.uid, { ativo: !pessoa.ativo }))
                      }
                    }}>{pessoa.ativo ? 'Desativar' : 'Reativar'}</Button>
                  </div>
                </div>
                {painel?.tipo === 'modulos' && painel.uid === pessoa.uid && <ModulosUsuario pessoa={pessoa} unidade={unidade}
                  ocupado={estado.bloqueado} cancelar={fecharPainel}
                  salvar={(modulosLiberados) => void estado.gravar(async () => {
                    await atualizarModulosDoUsuario(pessoa.uid, { modulosLiberados, teto: unidade.modulosLiberados })
                    fecharPainel()
                  })} />}
              </li>
            ))}
          </ul>}
        </section>
      </>}
    </div>
  )
}

export function UnidadePage() {
  const { id } = useParams()
  if (!usaSupabase) return <Aviso>Disponível com o backend Supabase.</Aviso>
  return id ? <DetalheUnidade key={id} id={id} /> : null
}
