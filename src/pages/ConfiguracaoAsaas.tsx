import { useEffect, useState, type FormEvent } from 'react'
import { Aviso, Button, Campo, Carregando, inputClass, Selo } from '../components/ui'
import { requireSupabase } from '../lib/supabase'

type Ambiente = 'sandbox' | 'producao'

export function ConfiguracaoAsaas() {
  const [config, setConfig] = useState<{ ambiente: Ambiente | null } | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function carregar() {
      try {
        const { data, error } = await requireSupabase().functions.invoke<{ ambiente: Ambiente | null }>('consultar-boletos', {
          body: { acao: 'ler-configuracao' },
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (error || !data) throw new Error()
        setConfig(data)
      } catch {
        if (!controller.signal.aborted) setMensagem({ tom: 'erro', texto: 'Não foi possível carregar a configuração do Asaas.' })
      }
    }
    void carregar()
    return () => controller.abort()
  }, [tentativa])

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const formulario = evento.currentTarget
    const dados = new FormData(formulario)
    setMensagem(null)
    setSalvando(true)
    try {
      const { data, error } = await requireSupabase().functions.invoke<{ ambiente: Ambiente }>('consultar-boletos', {
        body: { acao: 'salvar-configuracao', ambiente: dados.get('ambiente'), chave: String(dados.get('chave') ?? '').trim() },
      })
      if (error || !data) {
        const status = (error as { context?: Response } | null)?.context?.status
        setMensagem({ tom: 'erro', texto: status === 400
          ? 'Confira se a chave corresponde ao ambiente escolhido.'
          : 'Não foi possível salvar a configuração. Tente novamente.' })
      } else {
        formulario.reset()
        setConfig(data)
        setMensagem({ tom: 'ok', texto: 'Configuração salva. Consulte um boleto para verificar a conexão.' })
      }
    } catch {
      setMensagem({ tom: 'erro', texto: 'Não foi possível salvar a configuração. Tente novamente.' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <details className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <summary className="cursor-pointer rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand">
        Configuração do Asaas
      </summary>
      <div className="mt-4 space-y-4">
        {config ? (
          <>
            <Selo tom={config.ambiente ? 'lima' : 'neutro'}>
              {config.ambiente === 'producao' ? 'Produção configurada' : config.ambiente === 'sandbox' ? 'Ambiente de testes configurado' : 'Aguardando chave'}
            </Selo>
            <form onSubmit={salvar} key={config.ambiente ?? 'sem-chave'}>
              <fieldset disabled={salvando} className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <Campo label="Ambiente">
                  <select name="ambiente" className={inputClass} defaultValue={config.ambiente ?? 'sandbox'}>
                    <option value="sandbox">Testes (Sandbox)</option>
                    <option value="producao">Produção</option>
                  </select>
                </Campo>
                <Campo label="Chave de API do Asaas">
                  <input name="chave" type="password" className={inputClass} maxLength={512} autoComplete="new-password" spellCheck={false} required />
                </Campo>
                <Button type="submit" className="justify-self-start sm:col-span-2">
                  {salvando ? 'Salvando…' : 'Salvar configuração'}
                </Button>
              </fieldset>
            </form>
          </>
        ) : mensagem ? (
          <Button variant="secondary" type="button" onClick={() => { setMensagem(null); setTentativa((atual) => atual + 1) }}>
            Tentar novamente
          </Button>
        ) : <Carregando texto="Carregando configuração…" />}
        <div aria-live="polite">{mensagem ? <Aviso tom={mensagem.tom}>{mensagem.texto}</Aviso> : null}</div>
      </div>
    </details>
  )
}
