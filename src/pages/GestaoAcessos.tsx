import { useCallback, useEffect, useRef, useState } from 'react'
import { LinkCriado, type AcessoPorLink } from '../components/LinkCriado'
import { Aviso, Button, Campo, Carregando, Selo, Vazio, inputClass } from '../components/ui'
import { SLUGS_FRANQUEADO, MODULOS, subconjunto } from '../data/modulos'
import { atualizarModulosDoUsuario, criarUsuarioEquipe, enviarEmailRedefinicao, listarEquipeDaUnidade } from '../lib/gestao'
import { listarUsuarios } from '../lib/api'
import { useAuth } from '../lib/auth'
import { mensagemErro } from '../lib/errors'
import { BACKEND } from '../lib/backend'
import { AREAS, type Area } from '../data/areas'
import { atualizarUsuarioSb, definirAdmin, gerarLinkSenhaSb, listarEquipeFranqueadoraSb } from '../lib/gestaoSupabase'
import type { Usuario } from '../types'

export function useListaAcessos<T>(consultar: () => Promise<T[]>) {
  const [lista, setLista] = useState<T[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [erro, setErro] = useState('')
  const [tique, setTique] = useState(0)
  const [gravando, setGravando] = useState(false)
  const operacaoEmCurso = useRef(false)

  function recarregar() {
    setCarregando(true)
    setErroCarga('')
    setTique((t) => t + 1)
  }

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    setErroCarga('')
    void consultar()
      .then((dados) => ativo && setLista(dados))
      .catch((falha: unknown) => ativo && setErroCarga(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => { ativo = false }
  }, [consultar, tique])

  async function gravar(acao: () => Promise<unknown>, atualizarLista = true) {
    if (operacaoEmCurso.current || carregando || erroCarga) return
    operacaoEmCurso.current = true
    setGravando(true)
    setErro('')
    try {
      await acao()
      if (atualizarLista) recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      operacaoEmCurso.current = false
      setGravando(false)
    }
  }

  return { lista, carregando, erroCarga, erro, setErro, recarregar, gravar, gravando, bloqueado: gravando || carregando || Boolean(erroCarga) }
}

function EstadoListaAcessos({ carregando, erroCarga, recarregar, vazio, equipe = false }: {
  carregando: boolean
  erroCarga: string
  recarregar: () => void
  vazio: boolean
  equipe?: boolean
}) {
  if (carregando) return <Carregando texto={equipe ? 'Carregando a equipe…' : 'Carregando unidades…'} />
  if (erroCarga) return <Aviso tom="erro"><span role="alert">{erroCarga}</span> <Button variant="ghost" onClick={recarregar}>Tentar novamente</Button></Aviso>
  if (!vazio) return null
  return <Vazio titulo={equipe ? 'Nenhuma pessoa na equipe' : 'Nenhuma unidade cadastrada'} texto="Use o formulário para fazer o primeiro cadastro." />
}

async function listarEquipeFranqueadora() {
  if (BACKEND === 'supabase') return listarEquipeFranqueadoraSb()
  const lista = await listarUsuarios()
  return lista.filter((pessoa) => pessoa.papel === 'equipe_franqueadora')
}

export function Checks({ valor, teto, onChange, disabled }: { valor: string[]; teto: string[]; disabled?: boolean; onChange: (slugs: string[]) => void }) {
  const opcoes = MODULOS.filter((modulo) => teto.includes(modulo.slug))
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {opcoes.map((modulo) => (
        <label key={modulo.slug} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <input
            type="checkbox"
            disabled={disabled}
            checked={valor.includes(modulo.slug)}
            onChange={(evento) => onChange(evento.target.checked ? [...valor, modulo.slug] : valor.filter((slug) => slug !== modulo.slug))}
          />
          {modulo.nome}
        </label>
      ))}
    </div>
  )
}

function SenhaCriada({ email, senha }: { email: string; senha: string }) {
  const [aviso, setAviso] = useState('')
  const enviando = useRef(false)
  const [ocupado, setOcupado] = useState(false)
  return (
    <Aviso tom="ok">
      <p>
        Login criado para <strong className="break-all">{email}</strong>. Senha provisória, mostrada só agora: <strong className="break-all">{senha}</strong>
      </p>
      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="ghost" onClick={async () => {
          try {
            await navigator.clipboard.writeText(senha)
            setAviso('Senha copiada.')
          } catch {
            setAviso('Selecione e copie a senha manualmente.')
          }
        }}>Copiar</Button>
        <Button
          type="button"
          variant="ghost"
          disabled={ocupado}
          onClick={() => {
            if (enviando.current) return
            enviando.current = true
            setOcupado(true)
            setAviso('')
            void enviarEmailRedefinicao(email)
              .then(() => setAviso('E-mail de redefinição enviado.'))
              .catch((falha: unknown) => setAviso(mensagemErro(falha)))
              .finally(() => {
                enviando.current = false
                setOcupado(false)
              })
          }}
        >
          {ocupado ? 'Enviando…' : 'Enviar e-mail de redefinição de senha'}
        </Button>
      </div>
      {aviso ? <p role="status" className="mt-1">{aviso}</p> : null}
    </Aviso>
  )
}

type AcessoCriado = AcessoPorLink | { email: string; senha: string }

function ResultadoCadastro({ acesso, aoFechar, ocupado }: {
  acesso: AcessoCriado | null
  aoFechar: () => void
  ocupado: boolean
}) {
  if (!acesso) return null
  if ('senha' in acesso) return <SenhaCriada {...acesso} />
  return <LinkCriado key={acesso.link ?? acesso.uid} acesso={acesso} aoFechar={aoFechar} ocupado={ocupado} />
}

export function GerarNovoLink({ pessoa, estado, desabilitado, aoGerar }: {
  pessoa: Usuario
  estado: Pick<ReturnType<typeof useListaAcessos<unknown>>, 'gravar' | 'bloqueado'>
  desabilitado?: boolean
  aoGerar: (acesso: AcessoPorLink) => void
}) {
  if (BACKEND !== 'supabase' || pessoa.papel === 'admin') return null

  return (
    <Button type="button" variant="ghost" disabled={estado.bloqueado || desabilitado} onClick={() => {
      if (estado.bloqueado || desabilitado) return
      if (!window.confirm(`Gerar um novo link para ${pessoa.nome || pessoa.email}? O link anterior deixa de funcionar.`)) return
      void estado.gravar(async () => {
        const acesso = await gerarLinkSenhaSb(pessoa.uid)
        aoGerar({ ...acesso, uid: pessoa.uid, email: pessoa.email })
      }, false)
    }}>
      Gerar novo link
    </Button>
  )
}

export function GestaoUsuariosPage() {
  const { user, refresh } = useAuth()
  const [criada, setCriada] = useState<AcessoCriado | null>(null)
  const [form, setForm] = useState({ nome: '', email: '', modulos: ['manuais'] as string[], admin: false })

  const estado = useListaAcessos(listarEquipeFranqueadora)
  const { lista: equipe, erro, gravar, gravando, bloqueado } = estado

  const gerenciaRede = BACKEND === 'supabase' && user?.papel === 'admin'
  const adminsAtivos = equipe.filter((pessoa) => pessoa.papel === 'admin' && pessoa.ativo && !pessoa.recusado).length

  const teto = [...SLUGS_FRANQUEADO, ...MODULOS.filter((modulo) => modulo.audiencia === 'franqueadora' && modulo.slug !== 'gestao-franqueadora' && modulo.slug !== 'gestao-usuarios').map((modulo) => modulo.slug)]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="cabecalho-pagina">
        <h1 className="text-2xl font-bold">Usuários da franqueadora</h1>
        <p className="text-sm text-muted">Gerencie as contas e os módulos da equipe da franqueadora.</p>
      </header>
      {erro ? <Aviso tom="erro"><span role="alert">{erro}</span></Aviso> : null}
      <ResultadoCadastro acesso={criada} aoFechar={() => setCriada(null)} ocupado={gravando} />
      <form
        className="space-y-3 rounded-2xl border border-line bg-surface p-4"
        onSubmit={(evento) => {
          evento.preventDefault()
          if (bloqueado || !user) return
          void gravar(async () => {
            const acesso = await criarUsuarioEquipe({
              nome: form.nome,
              email: form.email,
              papel: 'equipe_franqueadora',
              unidade: 'Franqueadora',
              cidade: '',
              unidadeId: null,
              modulosLiberados: form.modulos,
              ativo: true,
              criadoPor: user.uid,
            })
            setCriada({ email: form.email.trim(), ...acesso })
            setForm({ nome: '', email: '', modulos: ['manuais'], admin: false })
            if (gerenciaRede && form.admin && 'uid' in acesso) {
              try {
                await definirAdmin(acesso.uid, true)
              } catch {
                estado.setErro('A conta foi criada como equipe da franqueadora. Você pode promovê-la na lista de usuários.')
              }
            }
          })
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Campo label="Nome"><input className={inputClass} required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
          <Campo label="E-mail de login"><input className={inputClass} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
        </div>
        {gerenciaRede ? (
          <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={form.admin} disabled={bloqueado} onChange={(e) => setForm({ ...form, admin: e.target.checked })} />
            Criar já como super admin (acesso total)
          </label>
        ) : null}
        <Checks valor={form.modulos} teto={teto} onChange={(modulos) => setForm({ ...form, modulos })} />
        <Button type="submit" disabled={bloqueado}>{gravando ? 'Gravando…' : 'Criar usuário da equipe'}</Button>
      </form>
      <EstadoListaAcessos {...estado} vazio={!equipe.length} equipe />
      <ul className="space-y-2">
        {!estado.carregando && !estado.erroCarga && equipe.map((pessoa) => {
          const admin = pessoa.papel === 'admin'
          const ultimoAdmin = admin && pessoa.ativo && !pessoa.recusado && adminsAtivos <= 1
          const protecao = ultimoAdmin ? 'A rede precisa de pelo menos um admin ativo.' : undefined
          return (
            <li key={pessoa.uid} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="mr-2 font-semibold">{pessoa.nome}</span>
                  {admin ? <Selo tom="marca">Super admin</Selo> : null}
                  <span className="block text-xs text-muted">{pessoa.email} · {pessoa.recusado ? 'Recusado' : pessoa.ativo ? 'Ativo' : 'Inativo'}</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {gerenciaRede && (admin || (pessoa.ativo && !pessoa.recusado)) ? (
                    <span title={protecao}>
                      <Button variant="secondary" aria-disabled={ultimoAdmin || undefined} className={ultimoAdmin ? 'cursor-not-allowed opacity-50' : undefined} disabled={bloqueado} onClick={() => {
                        if (ultimoAdmin) return
                        const efeito = admin
                          ? 'A conta voltará a usar os módulos liberados para a equipe da franqueadora.'
                          : 'A conta terá acesso total à gestão da rede.'
                        if (!window.confirm(`${admin ? 'Remover o acesso de super admin de' : 'Tornar super admin'} ${pessoa.nome}? ${efeito}`)) return
                        void gravar(async () => {
                          await definirAdmin(pessoa.uid, !admin)
                          if (pessoa.uid === user?.uid) await refresh()
                        })
                      }}>{admin ? 'Remover admin' : 'Tornar admin'}</Button>
                    </span>
                  ) : null}
                  {user?.papel === 'admin' && pessoa.uid !== user.uid && <GerarNovoLink pessoa={pessoa} estado={estado} aoGerar={setCriada} />}
                  <Button variant="secondary" disabled={bloqueado || ultimoAdmin} title={protecao} onClick={() => {
                    if (pessoa.ativo && !window.confirm(`Desativar o acesso de ${pessoa.nome}?`)) return
                    void gravar(() => atualizarModulosDoUsuario(pessoa.uid, { ativo: !pessoa.ativo }))
                  }}>
                    {pessoa.ativo ? 'Desativar' : 'Ativar'}
                  </Button>
                </div>
              </div>
              {protecao ? <p className="mt-2 text-xs text-muted">{protecao}</p> : null}
              {gerenciaRede ? (
                <div className="mt-3 max-w-xs">
                  <Campo label={`Área de ${pessoa.nome}`}>
                    <select className={inputClass} value={pessoa.area ?? ''} disabled={bloqueado} onChange={(e) => {
                      const area = (e.target.value || null) as Area | null
                      void gravar(async () => {
                        await atualizarUsuarioSb(pessoa.uid, { area })
                        if (pessoa.uid === user?.uid) await refresh()
                      })
                    }}>
                      <option value="">Sem área</option>
                      {Object.entries(AREAS).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
                    </select>
                  </Campo>
                </div>
              ) : null}
              {!admin ? <div className="mt-3">
                <Checks valor={pessoa.modulosLiberados ?? []} teto={teto} disabled={bloqueado} onChange={(modulos) => void gravar(() => atualizarModulosDoUsuario(pessoa.uid, { modulosLiberados: modulos }))} />
              </div> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function MinhaEquipePage() {
  const { user } = useAuth()
  const [criada, setCriada] = useState<AcessoCriado | null>(null)
  const [form, setForm] = useState({ nome: '', email: '', modulos: [] as string[] })
  const teto = user?.modulosLiberados ?? []

  const unidadeId = user?.unidadeId
  const consultarEquipe = useCallback(() => unidadeId ? listarEquipeDaUnidade(unidadeId) : Promise.resolve([]), [unidadeId])
  const estado = useListaAcessos(consultarEquipe)
  const { lista: equipe, erro, gravar, gravando, bloqueado, setErro } = estado

  if (!user || user.papel !== 'franqueado') return <Aviso tom="erro">Só o franqueado da unidade cria a equipe.</Aviso>

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="cabecalho-pagina">
        <h1 className="text-2xl font-bold">Minha equipe</h1>
        <p className="text-sm text-muted">Cada pessoa acessa só módulos que a unidade já tem. Unidade: {user.unidade || 'não vinculada'}.</p>
      </header>
      {!user.unidadeId ? <Aviso tom="erro">Esta conta ainda não está ligada a uma unidade criada pela franqueadora.</Aviso> : null}
      {user.modulosLiberados === undefined ? <Aviso>A franqueadora ainda precisa gravar os módulos desta unidade antes da equipe ser criada.</Aviso> : null}
      {erro ? <Aviso tom="erro"><span role="alert">{erro}</span></Aviso> : null}
      <ResultadoCadastro acesso={criada} aoFechar={() => setCriada(null)} ocupado={gravando} />
      <form
        className="space-y-3 rounded-2xl border border-line bg-surface p-4"
        onSubmit={(evento) => {
          evento.preventDefault()
          if (bloqueado || !user.unidadeId) return
          if (!subconjunto(form.modulos, teto)) {
            setErro('A equipe não pode receber um módulo que a unidade não tem.')
            return
          }
          void gravar(async () => {
            const acesso = await criarUsuarioEquipe({
              nome: form.nome,
              email: form.email,
              papel: 'equipe_franqueado',
              unidade: user.unidade,
              cidade: user.cidade,
              unidadeId: user.unidadeId ?? null,
              modulosLiberados: form.modulos,
              ativo: true,
              criadoPor: user.uid,
            })
            setCriada({ email: form.email.trim(), ...acesso })
            setForm({ nome: '', email: '', modulos: [] })
          })
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Campo label="Nome"><input className={inputClass} required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
          <Campo label="E-mail de login"><input className={inputClass} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
        </div>
        <Checks valor={form.modulos} teto={teto} onChange={(modulos) => setForm({ ...form, modulos })} />
        <Button type="submit" disabled={bloqueado || !user.unidadeId}>{gravando ? 'Gravando…' : 'Criar pessoa da equipe'}</Button>
      </form>
      {user.unidadeId ? <EstadoListaAcessos {...estado} vazio={!equipe.length} equipe /> : null}
      <ul className="space-y-2">
        {!estado.carregando && !estado.erroCarga && user.unidadeId && equipe.map((pessoa) => (
          <li key={pessoa.uid} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{pessoa.nome}<span className="block text-xs font-normal text-muted">{pessoa.email}</span></span>
              <div className="flex flex-wrap gap-2">
                {pessoa.uid !== user.uid && pessoa.unidadeId === user.unidadeId && pessoa.papel === 'equipe_franqueado' && <GerarNovoLink pessoa={pessoa} estado={estado} aoGerar={setCriada} />}
                <Button variant="secondary" disabled={bloqueado} onClick={() => {
                  if (pessoa.ativo && !window.confirm(`Desativar o acesso de ${pessoa.nome}?`)) return
                  void gravar(() => atualizarModulosDoUsuario(pessoa.uid, { ativo: !pessoa.ativo, teto }))
                }}>
                  {pessoa.ativo ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            </div>
            <div className="mt-3">
              <Checks
                valor={pessoa.modulosLiberados ?? []}
                teto={teto}
                disabled={bloqueado}
                onChange={(modulos) => void gravar(() => atualizarModulosDoUsuario(pessoa.uid, { modulosLiberados: modulos, teto }))}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
