import { useCallback, useEffect, useRef, useState } from 'react'
import { Aviso, Button, Carregando, Selo, Vazio, cx, inputClass } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarDia } from '../../lib/format'
import { ROTULO_TIPO_REG, type PassoAc, type RegistroAc } from '../../lib/acompanhamento'
import { concluirPassoUnidade, listarCompartilhados } from '../../lib/acompanhamentoApi'
import { useVisao } from '../../lib/visao'
import { StatusPassoSelo } from './partes'

/** Unidade: registros que a franqueadora compartilhou e os passos combinados. Só o franqueado marca como feito. */
export function MeuAcompanhamentoPage() {
  const { user } = useAuth()
  const { comoFranqueado } = useVisao()
  const [registros, setRegistros] = useState<RegistroAc[]>([])
  const [passos, setPassos] = useState<PassoAc[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const gravacaoEmCurso = useRef(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [comentarios, setComentarios] = useState<Record<string, string>>({})
  const [tique, setTique] = useState(0)
  const recarregar = useCallback(() => setTique((t) => t + 1), [])
  const daUnidade = !comoFranqueado && (user?.papel === 'franqueado' || user?.papel === 'equipe_franqueado') && !!user?.unidadeId
  const franqueado = daUnidade && user?.papel === 'franqueado'

  useEffect(() => {
    if (!daUnidade || !user?.unidadeId) {
      setCarregando(false)
      return
    }
    let ativo = true
    setCarregando(true)
    setErroCarga('')
    void listarCompartilhados(user.unidadeId)
      .then((r) => {
        if (!ativo) return
        setRegistros(r.registros)
        setPassos(r.passos)
      })
      .catch((falha) => ativo && setErroCarga(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [daUnidade, user?.unidadeId, tique])

  if (!user) return null

  async function concluir(p: PassoAc) {
    if (gravacaoEmCurso.current || carregando) return
    const comentario = comentarios[p.id] ?? ''
    if (comentario.trim().length < 2) {
      setErro('Conte em um comentário o que foi feito.')
      return
    }
    setErro('')
    gravacaoEmCurso.current = true
    setSalvando(true)
    setOk('')
    try {
      await concluirPassoUnidade(user!, p.id, comentario)
      setOk('Passo marcado como feito. A franqueadora vai validar.')
      recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      gravacaoEmCurso.current = false
      setSalvando(false)
    }
  }

  const pendentes = passos.filter((p) => p.status === 'aberto' || p.status === 'reaberto')

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Acompanhamento do Franqueado</p>
        <h1 className="text-2xl font-black text-ink">Acompanhamento da franqueadora</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-ink/65">
          Visitas, reuniões e calls que a franqueadora compartilhou com a sua unidade, e os próximos passos combinados.
          {user.papel === 'equipe_franqueado' ? ' Sua equipe acompanha em modo leitura; o franqueado marca os passos como feitos.' : ''}
        </p>
      </header>
      {!daUnidade ? <Aviso tom="info">Esta página é para as unidades. A franqueadora usa a visão da rede.</Aviso> : null}
      {daUnidade && !user.unidadeId ? <Aviso>Peça à franqueadora para vincular esta conta a uma unidade.</Aviso> : null}
      {erroCarga ? <Aviso tom="erro"><span role="alert">{erroCarga}</span> <Button variant="ghost" onClick={recarregar}>Tentar novamente</Button></Aviso> : null}
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {carregando ? <Carregando /> : null}
      {daUnidade && user.unidadeId && !carregando && !erroCarga ? (
        <>
          <section className="space-y-2">
            <h2 className="text-lg font-bold">Próximos passos ({pendentes.length} em aberto)</h2>
            {!passos.length ? <Vazio titulo="Nenhum passo combinado" texto="Os combinados das visitas e reuniões aparecem aqui." /> : null}
            <ul className="space-y-2">
              {passos.map((p) => (
                <li key={p.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{p.descricao}</p>
                      <p className="text-xs text-ink/55">Responsável {p.responsavel} · prazo {formatarDia(p.prazoMs)}</p>
                    </div>
                    <StatusPassoSelo status={p.status} prazoMs={p.prazoMs} />
                  </div>
                  {p.comentarioUnidade ? <p className="mt-1 text-sm"><span className="font-semibold">Unidade:</span> {p.comentarioUnidade}</p> : null}
                  {p.comentarioFranqueadora ? <p className="mt-1 text-sm"><span className="font-semibold">Franqueadora:</span> {p.comentarioFranqueadora}</p> : null}
                  {franqueado && (p.status === 'aberto' || p.status === 'reaberto') ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input className={cx(inputClass, 'max-w-md flex-1 py-1.5')} maxLength={1000} placeholder="O que foi feito (obrigatório)" aria-label={`Comentário sobre ${p.descricao}`} value={comentarios[p.id] ?? ''} onChange={(e) => setComentarios({ ...comentarios, [p.id]: e.target.value })} />
                      <Button type="button" onClick={() => void concluir(p)} disabled={salvando || carregando}>Marcar como feito</Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <h2 className="text-lg font-bold">Registros compartilhados</h2>
            {!registros.length ? <Vazio titulo="Nenhum registro compartilhado" texto="Quando a franqueadora compartilhar uma visita ou reunião, ela aparece aqui." /> : null}
            <ul className="space-y-2">
              {registros.map((r) => (
                <li key={r.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Selo tom="marca">{ROTULO_TIPO_REG[r.tipo]}</Selo>
                    <span className="text-sm font-semibold">{formatarDia(r.dataMs)}</span>
                    <span className="text-xs text-ink/50">por {r.autorNome}</span>
                    {r.geradoPorIA ? <Selo>IA: {r.iaModelo}</Selo> : null}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm">{r.notas}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  )
}
