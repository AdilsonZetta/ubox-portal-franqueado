import { useEffect, useState } from 'react'
import { Logo } from '../../components/Logo'
import { Aviso, Button, Carregando, Selo, Vazio } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { listarFaturasAsaas, ROTULOS_FATURA, type Fatura } from '../../lib/asaasUnidade'
import {
  formatarCompetencia, formatarDiaISO, formatarReais, hojeISO, situacao, type Cliente, type Cobranca, type Recado,
} from '../../lib/cliente'
import { carregarMeuContrato, carregarMeusRecados, carregarMinhasCobrancas, consultarStatusAcesso } from '../../lib/clienteSupabase'
import { formatarData } from '../../lib/format'
import type { Usuario } from '../../types'
import { FacialCliente } from './FacialCliente'
import { diaDe, SituacaoSelo } from './partes'

const card = 'space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm'
type Consulta<T> = { dados: T | null; erro: boolean }

function useConsulta<T>(carregar: () => Promise<T>, chave: string) {
  const [resultado, setResultado] = useState<Consulta<T>>({ dados: null, erro: false })
  const [revisao, setRevisao] = useState(0)
  useEffect(() => {
    let vivo = true
    setResultado({ dados: null, erro: false })
    void carregar().then((dados) => {
      if (vivo) setResultado({ dados, erro: false })
    }).catch(() => { if (vivo) setResultado({ dados: null, erro: true }) })
    return () => { vivo = false }
    // A chave representa os parâmetros efetivos da consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, revisao])
  return { ...resultado, tentar: () => setRevisao((r) => r + 1) }
}

export function PortalClientePage({ usuario }: { usuario: Usuario }) {
  const { sair } = useAuth()
  const [erroSaida, setErroSaida] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const id = usuario.clienteId ?? ''
  const contrato = useConsulta(async () => {
    const cliente = id ? await carregarMeuContrato(id) : null
    if (!cliente) throw new Error('Contrato indisponível')
    return cliente
  }, id)

  async function encerrarSessao() {
    setSaindo(true)
    setErroSaida(false)
    try { await sair() } catch { setErroSaida(true) } finally { setSaindo(false) }
  }

  return <div className="min-h-dvh bg-paper text-ink">
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Logo compacto />
          <div><p className="font-bold">Portal do cliente</p><p className="text-sm text-ink-soft">{usuario.unidade}</p></div>
        </div>
        <Button type="button" variant="secondary" disabled={saindo} onClick={() => void encerrarSessao()}>{saindo ? 'Saindo…' : 'Sair'}</Button>
      </div>
    </header>
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
      {erroSaida && <Aviso tom="erro">Não foi possível sair. Tente novamente.</Aviso>}
      {contrato.erro ? <Vazio titulo="Contrato indisponível" texto="Confira a conexão ou fale com sua unidade UBOX."
        acao={<Button type="button" onClick={contrato.tentar}>Tentar novamente</Button>} /> :
        contrato.dados ? <ConteudoPortal key={contrato.dados.painelToken} cliente={contrato.dados} /> : <Carregando texto="Carregando seu contrato…" />}
    </main>
  </div>
}

function ConteudoPortal({ cliente }: { cliente: Cliente }) {
  const acesso = useConsulta(() => consultarStatusAcesso(cliente.id), cliente.id)
  return <>
    <section className={card}>
      <h1 className="text-xl font-bold">Meu contrato</h1>
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div><dt className="text-ink-soft">Box</dt><dd className="font-semibold">{cliente.box}</dd></div>
        <div><dt className="text-ink-soft">Período</dt><dd className="font-semibold">{formatarDiaISO(diaDe(cliente.contratoInicioMs))} {cliente.contratoFimMs ? `a ${formatarDiaISO(diaDe(cliente.contratoFimMs))}` : '· sem prazo definido'}</dd></div>
        <div><dt className="text-ink-soft">Mensalidade</dt><dd className="font-semibold">{formatarReais(cliente.valorMensalCentavos)}</dd></div>
        <div><dt className="text-ink-soft">Vencimento</dt><dd className="font-semibold">Dia {cliente.diaVencimento}</dd></div>
      </dl>
    </section>
    {acesso.dados && <section className={card}><h2 className="text-lg font-bold">Status de acesso</h2><Selo>{acesso.dados}</Selo></section>}
    <Faturas cliente={cliente} />
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Recados token={cliente.painelToken} />
      <FacialCliente cliente={cliente} origem="cliente" />
    </div>
  </>
}

function Recados({ token }: { token: string }) {
  const consulta = useConsulta<Recado[]>(() => carregarMeusRecados(token), token)
  return <section className={card}>
    <h2 className="text-lg font-bold">Recados</h2>
    {consulta.erro ? <ErroConsulta texto="Não foi possível carregar os recados." tentar={consulta.tentar} /> :
      !consulta.dados ? <Carregando texto="Carregando recados…" /> :
      consulta.dados.length === 0 ? <p className="text-sm text-ink-soft">Sua unidade ainda não publicou recados.</p> :
      <ul className="divide-y divide-line">{consulta.dados.map((recado) => <li className="space-y-1 py-2 text-sm" key={recado.id}>
        <p className="whitespace-pre-wrap break-words">{recado.texto}</p>
        <p className="text-xs text-ink-soft">{recado.autor} · {formatarData(recado.criadoEmMs)}</p>
      </li>)}</ul>}
  </section>
}

function ErroConsulta({ texto, tentar }: { texto: string; tentar: () => void }) {
  return <><Aviso tom="erro">{texto}</Aviso><Button type="button" variant="secondary" onClick={tentar}>Tentar novamente</Button></>
}

function boletoSeguro(fatura: Fatura) {
  for (const endereco of [fatura.link_boleto, fatura.invoice_url]) {
    if (typeof endereco !== 'string') continue
    try {
      const url = new URL(endereco)
      if (url.protocol === 'https:') return url.href
    } catch { /* Tenta o próximo endereço. */ }
  }
  return null
}

function Faturas({ cliente }: { cliente: Cliente }) {
  const [aviso, setAviso] = useState('')
  const consulta = useConsulta(async (): Promise<{ asaas: Fatura[] } | { manual: Cobranca[] }> => {
    const asaas = await listarFaturasAsaas(cliente.unidadeId, cliente.id)
    return asaas ? { asaas } : { manual: await carregarMinhasCobrancas(cliente.painelToken) }
  }, cliente.painelToken)

  async function copiarPix(pix: string) {
    try {
      await navigator.clipboard.writeText(pix)
      setAviso('Código Pix copiado.')
    } catch {
      setAviso('Não foi possível copiar o Pix. Tente novamente.')
    }
  }

  const dados = consulta.dados
  const vazia = dados && ('asaas' in dados ? dados.asaas.length === 0 : dados.manual.length === 0)
  const hoje = hojeISO()
  return <section className={card}>
    <h2 className="text-lg font-bold">Minhas faturas</h2>
    {consulta.erro ? <ErroConsulta texto="Não foi possível carregar as faturas." tentar={consulta.tentar} /> :
      !dados ? <Carregando texto="Carregando faturas…" /> :
      vazia ? <p className="text-sm text-ink-soft">Nenhuma fatura disponível. Consulte sua unidade sobre cobranças.</p> :
      <ul className="divide-y divide-line">
        {'asaas' in dados ? dados.asaas.map((fatura) => {
          const boleto = boletoSeguro(fatura)
          const pix = typeof fatura.pix_copia_cola === 'string' ? fatura.pix_copia_cola : ''
          return <li key={fatura.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
            <div className="mr-auto"><p className="font-semibold">{formatarReais(fatura.valor * 100)}</p><p>Vence em {formatarDiaISO(fatura.vencimento)}</p></div>
            <Selo>{ROTULOS_FATURA[fatura.status]}</Selo>
            {boleto && <a className="rounded-xl border border-line px-3 py-2 font-semibold text-brand-dark hover:bg-paper"
              href={boleto} target="_blank" rel="noopener noreferrer">Ver boleto</a>}
            {pix && <Button type="button" variant="secondary" onClick={() => void copiarPix(pix)}>Copiar Pix</Button>}
          </li>
        }) : dados.manual.map((cobranca) => <li key={cobranca.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
          <div className="mr-auto"><p className="font-semibold">{formatarCompetencia(cobranca.competencia)}</p><p>Vence em {formatarDiaISO(cobranca.vencimento)}</p></div>
          <span>{formatarReais(cobranca.valorCentavos)}</span><SituacaoSelo s={situacao(cobranca, hoje)} />
        </li>)}
      </ul>}
    <p role="status" className={aviso ? 'text-sm' : 'sr-only'}>{aviso}</p>
  </section>
}
