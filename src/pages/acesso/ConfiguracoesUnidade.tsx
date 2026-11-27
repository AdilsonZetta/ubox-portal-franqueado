import { useEffect, useState, type FormEvent } from 'react'
import { Aviso, Button, Campo, Carregando, inputClass, Selo } from '../../components/ui'
import { chamarAcesso, mensagemAcesso } from './api'

interface Configuracao {
  tolerancia_dias: number
  asaas_ambiente: 'sandbox' | 'producao' | null
  hikvision_tipo: 'terminal_facial' | 'hikcentral' | null
  hikvision_host: string | null
  hikvision_porta: number | null
  webhook_token_prefix: string | null
}

const cartao = 'space-y-3 rounded-xl border border-line p-4'
const tipos = { terminal_facial: 'Terminal facial', hikcentral: 'HikCentral' }

export function ConfiguracoesUnidade({ unidade, aoAlterarStatus }: { unidade: string; aoAlterarStatus: () => void }) {
  const [config, setConfig] = useState<Configuracao | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [erroInicial, setErroInicial] = useState('')
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [editarHikvision, setEditarHikvision] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const dadosUnidade = { unidade_id: unidade }

  useEffect(() => {
    const controller = new AbortController()
    void chamarAcesso<Configuracao>('acesso-inteligente', 'ler_configuracao', { unidade_id: unidade }, controller.signal)
      .then(dados => { if (!controller.signal.aborted) setConfig(dados) })
      .catch(erro => { if (!controller.signal.aborted) setErroInicial(mensagemAcesso(erro)) })
    return () => controller.abort()
  }, [unidade, tentativa])

  async function executar(operacao: () => Promise<string>) {
    setAviso(null)
    setOcupado(true)
    try {
      setAviso({ tom: 'ok', texto: await operacao() })
    } catch (erro) {
      setAviso({ tom: 'erro', texto: mensagemAcesso(erro) })
    } finally {
      setOcupado(false)
    }
  }

  function salvarAsaas(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const form = new FormData(evento.currentTarget)
    const chave = evento.currentTarget.elements.namedItem('chave')
    if (chave instanceof HTMLInputElement) chave.value = ''
    void executar(async () => {
      const dados = await chamarAcesso<{ ambiente: Configuracao['asaas_ambiente']; configurada: true }>(
        'asaas-unidade', 'salvar_chave', { ...dadosUnidade, ambiente: form.get('ambiente'), chave: form.get('chave') },
      )
      setConfig(atual => atual && { ...atual, asaas_ambiente: dados.ambiente })
      aoAlterarStatus()
      return 'Conta Asaas da unidade configurada.'
    })
  }

  function salvarHikvision(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const form = new FormData(evento.currentTarget)
    const senha = evento.currentTarget.elements.namedItem('senha')
    if (senha instanceof HTMLInputElement) senha.value = ''
    void executar(async () => {
      setConfig(await chamarAcesso<Configuracao>('acesso-inteligente', 'salvar_hikvision', {
        ...dadosUnidade, tipo: form.get('tipo'), host: form.get('host'), porta: Number(form.get('porta')),
        usuario: form.get('usuario'), senha: form.get('senha'),
      }))
      setEditarHikvision(false)
      return 'Configuração Hikvision salva.'
    })
  }

  function testar(funcao: 'asaas-unidade' | 'acesso-inteligente') {
    void executar(async () => {
      const resposta = await chamarAcesso<{ ok: boolean; erro?: string }>(
        funcao, funcao === 'asaas-unidade' ? 'testar' : 'testar_hikvision', dadosUnidade,
      )
      if (!resposta.ok) throw new Error(resposta.erro || 'Não foi possível testar a conexão.')
      return 'Conexão confirmada.'
    })
  }

  function salvarTolerancia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const form = new FormData(evento.currentTarget)
    void executar(async () => {
      setConfig(await chamarAcesso<Configuracao>('acesso-inteligente', 'salvar_tolerancia', {
        ...dadosUnidade, tolerancia_dias: Number(form.get('dias')),
      }))
      aoAlterarStatus()
      return 'Tolerância salva.'
    })
  }

  function gerarWebhook() {
    if (config?.webhook_token_prefix && !window.confirm('Gerar uma nova URL e invalidar a anterior?')) return
    setWebhookUrl('')
    void executar(async () => {
      const dados = await chamarAcesso<{ url: string; prefixo: string }>('acesso-inteligente', 'gerar_webhook', dadosUnidade)
      setConfig(atual => atual && { ...atual, webhook_token_prefix: dados.prefixo })
      setWebhookUrl(dados.url)
      return 'URL do webhook gerada.'
    })
  }

  if (erroInicial) return (
    <div className="space-y-3">
      <Aviso tom="erro">{erroInicial}</Aviso>
      <Button variant="secondary" onClick={() => { setErroInicial(''); setTentativa(atual => atual + 1) }}>Tentar novamente</Button>
    </div>
  )
  if (!config) return <Carregando texto="Carregando configurações da unidade…" />

  return (
    <div className="space-y-4">
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      {ocupado && <Carregando texto="Processando configuração…" />}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className={cartao} aria-labelledby="acesso-asaas">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="acesso-asaas" className="font-semibold">Conta Asaas da unidade</h3>
            <Selo tom={config.asaas_ambiente ? 'lima' : 'neutro'}>
              {config.asaas_ambiente ? `Configurada (${config.asaas_ambiente === 'producao' ? 'produção' : 'sandbox'})` : 'Sem chave própria'}
            </Selo>
          </div>
          <form onSubmit={salvarAsaas} className="space-y-3">
            <Campo label="Ambiente">
              <select name="ambiente" className={inputClass} defaultValue={config.asaas_ambiente ?? 'sandbox'}>
                <option value="sandbox">Sandbox (teste)</option><option value="producao">Produção</option>
              </select>
            </Campo>
            <Campo label="Chave da API Asaas">
              <input className={inputClass} name="chave" type="password" autoComplete="new-password" required minLength={16} maxLength={512} />
            </Campo>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={ocupado}>Salvar chave</Button>
              <Button type="button" variant="secondary" disabled={ocupado} onClick={() => testar('asaas-unidade')}>Testar conexão</Button>
            </div>
          </form>
        </section>
        <section className={cartao} aria-labelledby="acesso-hikvision">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="acesso-hikvision" className="font-semibold">API Hikvision</h3>
            <Selo tom={config.hikvision_tipo ? 'lima' : 'neutro'}>{config.hikvision_tipo ? 'Configurada' : 'Pendente'}</Selo>
          </div>
          <p className="break-words text-sm text-muted">
            {config.hikvision_tipo ? `${tipos[config.hikvision_tipo]} · ${config.hikvision_host} · Porta ${config.hikvision_porta}` : 'Prepare a conexão para quando o aparelho estiver disponível.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" aria-expanded={editarHikvision} disabled={ocupado}
              onClick={() => setEditarHikvision(atual => !atual)}>Vincular API Hikvision</Button>
            <Button type="button" variant="secondary" disabled={ocupado} onClick={() => testar('acesso-inteligente')}>Testar conexão</Button>
          </div>
          {editarHikvision && (
            <form onSubmit={salvarHikvision} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Campo label="Tipo">
                  <select name="tipo" className={inputClass} defaultValue={config.hikvision_tipo ?? 'terminal_facial'}>
                    <option value="terminal_facial">Terminal facial</option><option value="hikcentral">HikCentral</option>
                  </select>
                </Campo>
              </div>
              <Campo label="Host ou IP"><input className={inputClass} name="host" required maxLength={253} defaultValue={config.hikvision_host ?? ''} /></Campo>
              <Campo label="Porta"><input className={inputClass} name="porta" type="number" required min={1} max={65535} defaultValue={config.hikvision_porta ?? 443} /></Campo>
              <Campo label="Usuário"><input className={inputClass} name="usuario" required maxLength={120} autoComplete="off" /></Campo>
              <Campo label="Senha"><input className={inputClass} name="senha" required maxLength={512} type="password" autoComplete="new-password" /></Campo>
              <div><Button type="submit" disabled={ocupado}>Salvar integração</Button></div>
            </form>
          )}
        </section>
        <section className={cartao} aria-labelledby="acesso-tolerancia">
          <h3 id="acesso-tolerancia" className="font-semibold">Tolerância</h3>
          <form onSubmit={salvarTolerancia} className="space-y-3">
            <Campo label="Dias de tolerância após o vencimento">
              <input className={inputClass} name="dias" type="number" min={0} max={90} required defaultValue={config.tolerancia_dias} />
            </Campo>
            <Button type="submit" disabled={ocupado}>Salvar tolerância</Button>
          </form>
        </section>
        <section className={cartao} aria-labelledby="acesso-webhook">
          <h3 id="acesso-webhook" className="font-semibold">Webhook do Asaas</h3>
          <p className="text-sm text-muted">Cadastre a URL no Asaas para receber atualizações de cobrança.</p>
          {config.webhook_token_prefix && <Selo>Token {config.webhook_token_prefix}…</Selo>}
          <div>
            <Button type="button" variant="secondary" disabled={ocupado} onClick={gerarWebhook}>
              {config.webhook_token_prefix ? 'Gerar nova URL' : 'Gerar URL do webhook'}
            </Button>
          </div>
          {webhookUrl && (
            <div className="space-y-2">
              <Campo label="URL do webhook" hint="Copie agora. A URL será ocultada ao fechar as configurações.">
                <input className={inputClass} value={webhookUrl} readOnly />
              </Campo>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void executar(async () => {
                  await navigator.clipboard.writeText(webhookUrl).catch(() => { throw new Error('Selecione a URL e copie manualmente.') })
                  setWebhookUrl('')
                  return 'URL copiada.'
                })}>Copiar URL do webhook</Button>
                <Button type="button" variant="secondary" onClick={() => setWebhookUrl('')}>Ocultar URL</Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
