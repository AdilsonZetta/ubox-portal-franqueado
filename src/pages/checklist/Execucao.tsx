import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { AlertTriangle, UserRoundCheck } from 'lucide-react'
import { Aviso, Button, Carregando, Selo, cx, inputClass } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData } from '../../lib/format'
import {
  ROTULO_FREQ,
  ROTULO_RESULTADO,
  ROTULO_TIPO_CK,
  podeGerirChecklist,
  porSecao,
  totaisConferem,
  type ExecucaoChecklist,
  type Resultado,
} from '../../lib/checklist'
import { lerExecucao, salvarObsProprietario } from '../../lib/checklistApi'
import { useVisao } from '../../lib/visao'
import { LinkEvidencia, ScoreSelo } from './partes'

const COR: Record<Resultado | '', string> = {
  ok: 'bg-lime/25 text-lime-dark',
  nao_ok: 'bg-red-100 text-red-800',
  na: 'bg-ink/5 text-ink/60',
  '': 'bg-ink/5 text-ink/40',
}

export function ExecucaoChecklistPage() {
  const { id = '' } = useParams()
  const local = useLocation()
  const enviado = (local.state as { enviado?: boolean } | null)?.enviado === true
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado } = useVisao()
  const gestor = podeGerirChecklist(user, ehAdmin) && !comoFranqueado
  const [execucao, setExecucao] = useState<ExecucaoChecklist | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [erroCarga, setErroCarga] = useState('')
  const [ok, setOk] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [tique, setTique] = useState(0)

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    setErroCarga('')
    lerExecucao(id)
      .then((e) => {
        if (!ativo) return
        setExecucao(e)
        setObs(e?.obsProprietario ?? '')
      })
      .catch((falha) => ativo && setErroCarga(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [id, tique])

  if (!user) return null
  const proprietario = !comoFranqueado && user.papel === 'franqueado' && execucao !== null && user.unidadeId === execucao.unidadeId

  async function salvarObs() {
    if (!user || !execucao) return
    if (obs.trim().length < 2) {
      setErro('Escreva a observação do proprietário (2 caracteres ou mais).')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await salvarObsProprietario(user, execucao.id, obs)
      setOk('Observação do proprietário registrada.')
      setTique((t) => t + 1)
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  const grupos = execucao ? porSecao(execucao.respostas) : []

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <p className="text-sm text-ink/50">
        <Link to={gestor ? '/checklist/gestao?aba=execucoes' : '/checklist'}>Checklist Operacional</Link> / {gestor ? 'Execuções' : <Link to="/checklist/historico">Histórico</Link>}
      </p>
      {enviado ? <Aviso tom="ok">Checklist enviado. O registro fica com a hora do servidor e não pode ser alterado.</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {carregando ? <Carregando texto="Carregando o checklist…" /> : null}
      {erroCarga ? <Aviso tom="erro"><p role="alert">{erroCarga}</p><Button type="button" variant="secondary" className="mt-2" onClick={() => setTique((t) => t + 1)}>Tentar novamente</Button></Aviso> : null}
      {!carregando && !erroCarga && !execucao ? <Aviso>Checklist não encontrado. Volte ao histórico para escolher outro registro.</Aviso> : null}
      {!carregando && !erroCarga && execucao ? (
        <>
          <header className="flex flex-col gap-4 rounded-3xl border border-line bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5">
                <Selo tom="marca">{ROTULO_TIPO_CK[execucao.tipo]}</Selo>
                <Selo>{ROTULO_FREQ[execucao.frequencia]}</Selo>
                <Selo>Versão {execucao.modeloVersao}</Selo>
              </div>
              <h1 className="mt-2 text-2xl font-extrabold">{execucao.modeloTitulo}</h1>
              <p className="text-sm text-ink/60">{execucao.unidadeNome || execucao.unidadeId} · {execucao.nome} · {formatarData(execucao.criadoEmMs)}</p>
            </div>
            <div className="text-center">
              <ScoreSelo score={execucao.score} grande />
              <p className="mt-1 text-xs text-ink/55">
                {execucao.qtdOk} OK · {execucao.qtdNaoOk} não OK · {execucao.qtdNa} N/A
              </p>
              <p className="text-[11px] text-ink/40">{execucao.pontosObtidos} de {execucao.pontosPossiveis} pontos</p>
            </div>
          </header>

          {!totaisConferem(execucao) ? (
            <Aviso tom="erro">
              <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Os totais gravados não conferem com as respostas item a item. Considere as respostas abaixo.</span>
            </Aviso>
          ) : null}

          {execucao.obsGeral ? (
            <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold">Observação geral</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-ink/75">{execucao.obsGeral}</p>
            </section>
          ) : null}

          <section className="space-y-3 rounded-2xl border border-brand/30 bg-brand/5 p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold"><UserRoundCheck className="h-4 w-4" aria-hidden="true" /> Observação do proprietário</h2>
            {execucao.obsProprietario ? (
              <div>
                <p className="whitespace-pre-line text-sm text-ink/80">{execucao.obsProprietario}</p>
                <p className="mt-1 text-[11px] text-ink/50">{execucao.obsProprietarioNome} · {formatarData(execucao.obsProprietarioEmMs)}</p>
              </div>
            ) : !proprietario ? (
              <p className="text-sm text-ink/55">O franqueado ainda não comentou este checklist.</p>
            ) : null}
            {proprietario ? (
              <div className="space-y-2">
                <textarea className={inputClass} rows={3} maxLength={2000} value={obs} onChange={(e) => setObs(e.target.value)} aria-label="Observação do proprietário" placeholder="Seu parecer como proprietário: o que foi conferido, combinado ou corrigido." />
                <Button type="button" onClick={() => void salvarObs()} disabled={salvando}>{salvando ? 'Salvando…' : execucao.obsProprietario ? 'Atualizar observação' : 'Registrar observação'}</Button>
              </div>
            ) : null}
          </section>

          {grupos.map((g) => (
            <section key={g.secao || 'geral'} className="space-y-2">
              {g.secao ? <h2 className="pt-1 text-sm font-bold uppercase tracking-wide text-ink/55">{g.secao}</h2> : null}
              <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                {g.itens.map(({ item: r, indice }) => (
                  <li key={r.itemId} className={cx('flex flex-wrap items-start justify-between gap-3 px-4 py-3', r.resultado === 'nao_ok' && 'bg-red-50/60')}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{indice + 1}. {r.texto}</p>
                      {r.obs ? <p className="mt-0.5 text-sm text-ink/65">{r.obs}</p> : null}
                      <LinkEvidencia url={r.evidenciaUrl} />
                    </div>
                    <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-bold', COR[r.resultado])}>{r.resultado ? ROTULO_RESULTADO[r.resultado] : '—'}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </>
      ) : null}
    </div>
  )
}
