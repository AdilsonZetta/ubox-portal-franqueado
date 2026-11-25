import { useState, type FormEvent } from 'react'
import type { BoletoAsaas, SituacaoBoleto } from '../../supabase/functions/consultar-boletos/asaas'
import { Aviso, Button, Campo, Carregando, inputClass, Selo, Vazio } from '../components/ui'
import { formatarDiaISO, formatarReais } from '../lib/cliente'
import { requireSupabase } from '../lib/supabase'

const ROTULOS: Record<SituacaoBoleto, string> = {
  pago: 'Pago',
  em_aberto: 'Em aberto',
  vencido: 'Vencido',
  estornado: 'Estornado',
  em_analise: 'Verificar no Asaas',
}

function mesAtual() {
  const agora = new Date()
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
}

export function ConsultaBoletos() {
  const [carregando, setCarregando] = useState(false)
  const [boletos, setBoletos] = useState<BoletoAsaas[] | null>(null)
  const [erro, setErro] = useState('')

  async function consultar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formulario = new FormData(event.currentTarget)
    const cpfCnpj = String(formulario.get('cpfCnpj') ?? '')
    const mes = String(formulario.get('mes') ?? '')

    setErro('')
    setBoletos(null)
    setCarregando(true)
    try {
      const { data, error } = await requireSupabase().functions.invoke<{ boletos: BoletoAsaas[] }>('consultar-boletos', {
        body: { cpfCnpj, mes },
      })
      if (error) {
        const status = (error as { context?: Response }).context?.status
        if (status === 400) setErro('Confira o CPF ou CNPJ e o mês de vencimento.')
        else if (status === 401 || status === 403) setErro('Entre como administrador ativo para consultar boletos.')
        else if (status === 404 || status === 503) setErro('A consulta no Asaas ainda precisa ser configurada.')
        else setErro('Não foi possível consultar o Asaas. Tente consultar novamente.')
      } else if (Array.isArray(data?.boletos)) {
        setBoletos(data.boletos)
      } else {
        setErro('O Asaas retornou uma resposta incompleta. Tente consultar novamente.')
      }
    } catch {
      setErro('Não foi possível consultar o Asaas. Tente consultar novamente.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <section aria-labelledby="consulta-boletos-titulo" className="space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div>
        <h2 id="consulta-boletos-titulo" className="text-lg font-bold">Consultar boletos no Asaas</h2>
        <p className="mt-1 text-sm text-muted">Veja a situação de cada boleto pelo documento do pagador e pelo mês de vencimento.</p>
      </div>
      <form onSubmit={consultar} onChange={() => { setBoletos(null); setErro('') }}>
        <fieldset disabled={carregando} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] sm:items-end">
          <Campo label="CPF ou CNPJ">
            <input name="cpfCnpj" className={inputClass} maxLength={32} autoComplete="off" spellCheck={false} required />
          </Campo>
          <Campo label="Mês de vencimento">
            <input name="mes" type="month" className={inputClass} defaultValue={mesAtual()} required />
          </Campo>
          <Button type="submit">{carregando ? 'Consultando…' : 'Consultar boletos'}</Button>
        </fieldset>
      </form>
      <div aria-live="polite" aria-busy={carregando}>
        {carregando ? <Carregando texto="Consultando boletos…" /> : null}
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        {boletos?.length === 0 ? (
          <Vazio titulo="Nenhum boleto encontrado" texto="Confira o documento ou consulte outro mês de vencimento." />
        ) : null}
        {boletos?.length ? (
          <ul aria-label="Boletos encontrados" className="divide-y divide-line rounded-xl border border-line">
            {boletos.map((boleto) => (
              <li key={boleto.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 [content-visibility:auto]">
                <div className="min-w-0">
                  <p className="text-sm font-semibold wrap-anywhere">{boleto.descricao || 'Boleto'}</p>
                  <p className="mt-1 text-sm text-muted tabular-nums">
                    <time dateTime={boleto.vencimento}>{formatarDiaISO(boleto.vencimento)}</time> · {formatarReais(boleto.valorCentavos)}
                  </p>
                  <p className="mt-1 text-xs text-muted wrap-anywhere">{boleto.id}</p>
                </div>
                <Selo tom={boleto.situacao === 'pago' ? 'lima' : boleto.situacao === 'vencido' ? 'alerta' : 'neutro'}>
                  {ROTULOS[boleto.situacao]}
                </Selo>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
