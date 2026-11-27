import { useEffect, useState, type FormEvent } from 'react'
import { Aviso, Button, Campo, Carregando, inputClass, Selo, Vazio } from '../../components/ui'
import { formatarDiaISO } from '../../lib/cliente'
import { requireSupabase } from '../../lib/supabase'
import { chamarAcesso, mensagemAcesso } from './api'

interface ClienteAcesso {
  id: string
  nome: string
  box: string
  status: 'Liberado' | 'Bloqueado por inadimplência' | 'Liberado manualmente' | 'Sem facial'
  tem_conta_asaas: boolean
  tem_liberacao: boolean
}

interface EventoAcesso {
  id: string
  texto: string
  autor_nome: string
  criado_em: string
}

export function ListaAcessos({ unidade, revisao }: { unidade: string; revisao: number }) {
  const [clientes, setClientes] = useState<ClienteAcesso[] | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [erroLista, setErroLista] = useState('')
  const [liberar, setLiberar] = useState<ClienteAcesso | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [progresso, setProgresso] = useState('')
  const [eventos, setEventos] = useState<EventoAcesso[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void chamarAcesso<ClienteAcesso[]>('acesso-inteligente', 'listar_acessos', { unidade_id: unidade }, controller.signal)
      .then(lista => { if (!controller.signal.aborted) { setClientes(lista); setErroLista('') } })
      .catch(erro => { if (!controller.signal.aborted) setErroLista(mensagemAcesso(erro)) })
    void requireSupabase().from('acesso_inteligente_eventos')
      .select('id, texto, autor_nome, criado_em')
      .eq('unidade_id', unidade)
      .order('criado_em', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (controller.signal.aborted) return
        setEventos(error ? [] : (data ?? []) as EventoAcesso[])
      })
    return () => controller.abort()
  }, [unidade, revisao, tentativa])

  async function sincronizar() {
    const vinculados = clientes?.filter(cliente => cliente.tem_conta_asaas) ?? []
    setOcupado(true)
    setAviso(null)
    let falhas = 0
    try {
      for (const [indice, cliente] of vinculados.entries()) {
        setProgresso(`Sincronizando ${indice + 1} de ${vinculados.length} clientes…`)
        try {
          await chamarAcesso('asaas-unidade', 'sincronizar_cliente', { cliente_id: cliente.id })
        } catch {
          falhas++
        }
      }
      setTentativa(atual => atual + 1)
      setAviso(falhas
        ? { tom: 'erro', texto: `Falha ao sincronizar ${falhas} de ${vinculados.length} clientes. Confira a conta Asaas e tente novamente.` }
        : { tom: 'ok', texto: 'Cobranças sincronizadas.' })
    } finally {
      setProgresso('')
      setOcupado(false)
    }
  }

  async function alterar(cliente: ClienteAcesso, acao: 'liberar_acesso' | 'remover_liberacao', form?: FormData) {
    setOcupado(true)
    setAviso(null)
    try {
      await chamarAcesso('acesso-inteligente', acao, {
        cliente_id: cliente.id, motivo: form?.get('motivo'), valido_ate: form?.get('validade') || null,
      })
      setTentativa(atual => atual + 1)
      setLiberar(null)
      setAviso({ tom: 'ok', texto: acao === 'liberar_acesso' ? 'Liberação manual registrada.' : 'Liberação manual removida.' })
    } catch (erro) {
      setAviso({ tom: 'erro', texto: mensagemAcesso(erro) })
    } finally {
      setOcupado(false)
    }
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (liberar) void alterar(liberar, 'liberar_acesso', new FormData(evento.currentTarget))
  }

  return (
    <section aria-labelledby="titulo-clientes-acesso" className="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-clientes-acesso" className="text-lg font-semibold">Clientes e situação de acesso</h2>
          <p className="text-sm text-muted">Acompanhe as liberações e as cobranças vencidas da unidade.</p>
        </div>
        <Button type="button" variant="secondary" disabled={ocupado || !!erroLista || !clientes?.some(cliente => cliente.tem_conta_asaas)} onClick={() => void sincronizar()}>
          Sincronizar cobranças
        </Button>
      </header>
      {progresso && <Carregando texto={progresso} />}
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      {erroLista ? (
        <div className="space-y-2">
          <Aviso tom="erro">{erroLista}</Aviso>
          <Button variant="secondary" onClick={() => { setErroLista(''); setTentativa(atual => atual + 1) }}>Tentar novamente</Button>
        </div>
      ) : !clientes ? <Carregando texto="Carregando clientes da unidade…" /> : !clientes.length ? (
        <Vazio titulo="Nenhum cliente ativo" texto="Cadastre ou reative um contrato em Clientes para acompanhar seu acesso aqui." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {clientes.map(cliente => (
            <li key={cliente.id} className="space-y-3 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{cliente.nome}</p>
                  <p className="text-sm text-muted">Box {cliente.box}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Selo tom={cliente.status === 'Sem facial' ? 'neutro' : cliente.status === 'Bloqueado por inadimplência' ? 'alerta' : 'lima'}>
                    {cliente.status}
                  </Selo>
                  {cliente.tem_liberacao ? (
                    <Button type="button" variant="secondary" disabled={ocupado} onClick={() => {
                      if (window.confirm(`Remover a liberação manual de ${cliente.nome}?`)) void alterar(cliente, 'remover_liberacao')
                    }}>Remover liberação</Button>
                  ) : (
                    <Button type="button" variant="secondary" disabled={ocupado}
                      aria-expanded={liberar?.id === cliente.id} onClick={() => setLiberar(cliente)}>
                      Liberar acesso
                    </Button>
                  )}
                </div>
              </div>
              {liberar?.id === cliente.id && (
                <form onSubmit={enviar} className="space-y-3 rounded-xl border border-line bg-paper p-3">
                  {cliente.status === 'Sem facial' && <Aviso>O status permanece “Sem facial” até haver um cadastro facial utilizável.</Aviso>}
                  <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                    <Campo label="Motivo"><input className={inputClass} name="motivo" required maxLength={500} /></Campo>
                    <Campo label="Até a data" hint="Opcional"><input className={inputClass} type="date" name="validade" /></Campo>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={ocupado}>Confirmar liberação</Button>
                    <Button type="button" variant="secondary" disabled={ocupado} onClick={() => setLiberar(null)}>Cancelar</Button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {eventos && eventos.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Histórico de liberações</h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {eventos.map(evento => (
              <li key={evento.id} className="px-3 py-2 text-sm">
                <p className="break-words">{evento.texto}</p>
                <p className="text-xs text-muted">{evento.autor_nome} · {formatarDiaISO(evento.criado_em.slice(0, 10))}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
