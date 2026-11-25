import { useEffect, useState, type ChangeEvent } from 'react'
import { Aviso, Button, Campo, Carregando, inputClass, Selo, Vazio } from '../components/ui'
import { formatarDiaISO, formatarReais } from '../lib/cliente'
import { listarUnidades } from '../lib/gestao'
import { requireSupabase } from '../lib/supabase'
import { ConsultaBoletos, type BoletoSelecionado } from './ConsultaBoletos'

interface Vinculo {
  pessoa_terminal: string
  asaas_boleto_id: string
  asaas_ambiente: 'sandbox' | 'producao'
  vencimento: string
}

interface Contrato {
  id: string
  nome: string
  box: string
  acesso_facial_vinculos: Vinculo | null
}

interface UnidadeResumida {
  id: string
  nome: string
}

function TestarFoto() {
  const [previa, setPrevia] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => () => {
    if (previa) URL.revokeObjectURL(previa)
  }, [previa])

  function escolher(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0]
    evento.target.value = ''
    setErro('')
    setPrevia('')
    if (!arquivo) return
    if (!['image/jpeg', 'image/png'].includes(arquivo.type) || arquivo.size > 5_000_000) {
      setErro('Escolha uma imagem JPG ou PNG de até 5 MB.')
      return
    }
    setPrevia(URL.createObjectURL(arquivo))
  }

  return (
    <details className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <summary className="cursor-pointer font-semibold">Testar captura de foto</summary>
      <div className="mt-4 space-y-3">
        <p className="text-sm text-muted">Use uma imagem de teste. A prévia fica apenas nesta tela e é descartada ao sair.</p>
        <Campo label="Foto de teste">
          <input name="fotoTeste" type="file" accept="image/jpeg,image/png" capture="user" className={inputClass} onChange={escolher} />
        </Campo>
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        {previa ? (
          <div className="flex flex-wrap items-end gap-3">
            <img alt="Prévia local da foto de teste" src={previa} width={160} height={160} className="size-40 rounded-xl border border-line object-contain" />
            <Button type="button" variant="secondary" onClick={() => setPrevia('')}>Remover foto</Button>
          </div>
        ) : null}
      </div>
    </details>
  )
}

export function PrepararFacial() {
  const [unidades, setUnidades] = useState<UnidadeResumida[] | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [unidadeId, setUnidadeId] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [lista, setLista] = useState<{ unidadeId: string; contratos: Contrato[] } | null>(null)
  const [falha, setFalha] = useState('')
  const [selecionado, setSelecionado] = useState<BoletoSelecionado | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)

  useEffect(() => {
    let vigente = true
    void listarUnidades()
      .then((itens) => { if (vigente) setUnidades(itens.filter((item) => item.ativo)) })
      .catch(() => { if (vigente) setFalha('Não foi possível carregar as unidades.') })
    return () => { vigente = false }
  }, [tentativa])

  useEffect(() => {
    if (!unidadeId) return
    const controller = new AbortController()
    async function carregarContratos() {
      try {
        const { data, error } = await requireSupabase().functions.invoke<{ contratos: Contrato[] }>('consultar-boletos', {
          body: { acao: 'listar-contratos-faciais', unidadeId }, signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (error || !Array.isArray(data?.contratos)) throw new Error()
        setLista({ unidadeId, contratos: data.contratos })
      } catch {
        if (!controller.signal.aborted) setFalha('Não foi possível carregar os contratos da unidade.')
      }
    }
    void carregarContratos()
    return () => controller.abort()
  }, [unidadeId, tentativa])

  const contratos = lista?.unidadeId === unidadeId ? lista.contratos : null
  const contrato = contratos?.find((item) => item.id === clienteId)
  const atual = contrato?.acesso_facial_vinculos

  async function salvar() {
    if (!contrato || !selecionado || !lista) return
    if (atual && !window.confirm('Substituir o boleto vinculado a este contrato?')) return

    setSalvando(true)
    setMensagem(null)
    try {
      const { data, error } = await requireSupabase().functions.invoke<{
        pessoaTerminal: string; ambiente: Vinculo['asaas_ambiente']; boletoId: string; vencimento: string
      }>('consultar-boletos', {
        body: { acao: 'vincular-boleto-facial', clienteId, boletoId: selecionado.boleto.id, mes: selecionado.mes, cpfCnpj: selecionado.cpfCnpj },
      })
      if (error || !data) {
        const resposta = (error as { context?: Response } | null)?.context
        const corpo = await resposta?.json().catch(() => null)
        setMensagem({ tom: 'erro', texto: resposta?.status === 409 && typeof corpo?.erro === 'string'
          ? corpo.erro : 'Não foi possível salvar o vínculo. Tente novamente.' })
        return
      }

      const vinculo: Vinculo = {
        pessoa_terminal: data.pessoaTerminal, asaas_boleto_id: data.boletoId,
        asaas_ambiente: data.ambiente, vencimento: data.vencimento,
      }
      setLista({ ...lista, contratos: lista.contratos.map((item) => item.id === clienteId ? { ...item, acesso_facial_vinculos: vinculo } : item) })
      setSelecionado(null)
      setMensagem({ tom: 'ok', texto: 'Vínculo salvo. Aguardando a integração com o terminal.' })
    } catch {
      setMensagem({ tom: 'erro', texto: 'Não foi possível salvar o vínculo. Tente novamente.' })
    } finally {
      setSalvando(false)
    }
  }

  function limparSelecao() {
    setSelecionado(null)
    setMensagem(null)
  }

  return (
    <>
      <section aria-labelledby="facial-titulo" className="space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div>
          <h2 id="facial-titulo" className="text-lg font-bold">Preparar cadastro facial</h2>
          <p className="mt-1 text-sm text-muted">Selecione o cliente e o box. Escolha o boleto na consulta abaixo para vinculá-lo ao contrato.</p>
        </div>
        {falha ? (
          <Aviso tom="erro">
            {falha}{' '}
            <Button type="button" variant="ghost" onClick={() => { setFalha(''); setTentativa((n) => n + 1) }}>Tentar novamente</Button>
          </Aviso>
        ) : null}
        {!unidades && !falha ? <Carregando texto="Carregando unidades…" /> : null}
        {unidades?.length === 0 ? <Vazio titulo="Nenhuma unidade ativa" texto="Cadastre uma unidade e um contrato para preparar o vínculo." /> : null}
        {unidades?.length ? (
          <fieldset disabled={salvando} className="grid gap-3 sm:grid-cols-2">
            <Campo label="Unidade">
              <select name="unidade" className={inputClass} value={unidadeId} onChange={(e) => {
                setUnidadeId(e.target.value); setClienteId(''); setLista(null); setFalha(''); limparSelecao()
              }}>
                <option value="">Selecione a unidade</option>
                {unidades.map((unidade) => <option key={unidade.id} value={unidade.id}>{unidade.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Cliente e box">
              <select name="cliente" className={inputClass} value={clienteId} disabled={!contratos?.length} onChange={(e) => {
                setClienteId(e.target.value); limparSelecao()
              }}>
                <option value="">Selecione o contrato</option>
                {contratos?.map((item) => <option key={item.id} value={item.id}>{item.nome} · Box {item.box}</option>)}
              </select>
            </Campo>
          </fieldset>
        ) : null}
        {unidadeId && !contratos && !falha ? <Carregando texto="Carregando contratos…" /> : null}
        {contratos?.length === 0 ? <Vazio titulo="Nenhum contrato ativo" texto="Selecione outra unidade ou cadastre o cliente e o contrato na unidade." /> : null}
        {atual ? (
          <div className="space-y-2 rounded-xl border border-line p-4">
            <Selo>Terminal não sincronizado</Selo>
            <p className="text-sm wrap-anywhere">ID na Hikvision: <strong>{atual.pessoa_terminal}</strong></p>
            <p className="text-sm wrap-anywhere">Boleto {atual.asaas_boleto_id} · {formatarDiaISO(atual.vencimento)} · {atual.asaas_ambiente === 'sandbox' ? 'Teste' : 'Produção'}</p>
          </div>
        ) : null}
      </section>
      <ConsultaBoletos
        key={clienteId}
        limparSelecao={limparSelecao}
        selecionar={contrato && !salvando ? (v) => { setSelecionado(v); setMensagem(null) } : undefined}
      />
      {selecionado ? (
        <section aria-label="Vínculo selecionado" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
          <div className="min-w-0 text-sm">
            <p className="font-semibold wrap-anywhere">{selecionado.boleto.descricao || selecionado.boleto.id}</p>
            <p>{formatarDiaISO(selecionado.boleto.vencimento)} · {formatarReais(selecionado.boleto.valorCentavos)}</p>
          </div>
          <Button type="button" disabled={salvando} onClick={() => void salvar()}>{salvando ? 'Vinculando…' : 'Vincular ao contrato'}</Button>
        </section>
      ) : null}
      <div aria-live="polite" className={mensagem ? '' : 'sr-only'}>{mensagem ? <Aviso tom={mensagem.tom}>{mensagem.texto}</Aviso> : null}</div>
      <TestarFoto />
    </>
  )
}
