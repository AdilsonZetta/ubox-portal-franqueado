import { useCallback, useRef, useState } from 'react'
import { Aviso, Button, Campo, Selo, inputClass } from '../../components/ui'
import { nomesResponsaveis, STATUS_DEMANDA, type Demanda, type StatusDemanda } from '../../lib/demandas'
import { adicionarLinkDemanda, comentarDemanda, excluirDemanda, listarEventosDemanda, mudarStatusDemanda } from '../../lib/demandasSupabase'
import { mensagemErro } from '../../lib/errors'
import { formatarData } from '../../lib/format'
import { acaoDemandaClass, EstadoConsulta, MetadadosDemanda, PainelDemanda, useConsultaDemandas } from './partes'

const eventos = { criacao: 'Criação', comentario: 'Comentário', status: 'Status', responsaveis: 'Responsáveis', edicao: 'Edição' }

export function DetalheDemanda({ demanda, hoje, somenteLeitura, podeEditar, admin, falhaAtualizar, recarregar, fechar, editar, atualizar }: {
  demanda: Demanda; hoje: string; somenteLeitura: boolean; podeEditar: boolean; admin: boolean
  falhaAtualizar?: boolean; recarregar: () => void; fechar: () => void; editar: () => void; atualizar: () => void
}) {
  const id = demanda.id
  const consultar = useCallback(() => listarEventosDemanda(id), [id])
  const historico = useConsultaDemandas(consultar)
  const [comentario, setComentario] = useState('')
  const [nomeLink, setNomeLink] = useState('')
  const [urlLink, setUrlLink] = useState('')
  const [abriuLink, setAbriuLink] = useState(false)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const emCurso = useRef(false)

  async function gravar(acao: () => Promise<void>) {
    if (somenteLeitura || emCurso.current) return
    emCurso.current = true
    setOcupado(true)
    setErro('')
    try {
      await acao()
      atualizar()
      historico.recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      emCurso.current = false
      setOcupado(false)
    }
  }

  return (
    <PainelDemanda titulo={demanda.titulo} fechar={fechar} ocupado={ocupado}>
      <div className="space-y-6">
        {falhaAtualizar ? <EstadoConsulta erro recarregar={recarregar} texto="" falha="Não foi possível atualizar os dados da demanda." /> : null}
        <section aria-label="Dados da demanda" className="space-y-3">
          <MetadadosDemanda demanda={demanda} hoje={hoje} />
          <p className="whitespace-pre-wrap wrap-anywhere text-sm">{demanda.descricao || 'Sem descrição.'}</p>
          <dl className="grid gap-3 rounded-xl border border-line bg-paper p-3 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold">Pessoas responsáveis</dt><dd className="wrap-anywhere text-muted">
              {nomesResponsaveis(demanda) || 'Sem responsáveis individuais'}
            </dd></div>
            <div><dt className="font-semibold">Criada por</dt><dd className="wrap-anywhere text-muted">{demanda.criadoPorNome || 'Pessoa indisponível'} · {formatarData(new Date(demanda.criadoEm))}</dd></div>
            <div><dt className="font-semibold">Última atualização</dt><dd className="text-muted">{formatarData(new Date(demanda.atualizadoEm))}</dd></div>
            <div><dt className="font-semibold">Prazo</dt><dd className="text-muted">{demanda.prazo ? new Date(`${demanda.prazo}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem prazo'}</dd></div>
            {demanda.concluidaEm ? <div><dt className="font-semibold">Concluída em</dt><dd>{formatarData(new Date(demanda.concluidaEm))}</dd></div> : null}
          </dl>
          {demanda.anexos.length ? (
            <ul aria-label="Links e anexos" className="flex flex-wrap gap-3 text-sm">
              {demanda.anexos.map(({ nome, url }, indice) => <li key={indice} className="min-w-0">
                <a className="wrap-anywhere font-semibold text-brand-dark underline" href={url} target="_blank" rel="noreferrer">{nome} (nova aba)</a>
              </li>)}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {podeEditar ? <Button variant="secondary" disabled={ocupado} onClick={editar}>Editar demanda</Button> : null}
            {admin ? <Button variant="danger" disabled={ocupado} onClick={() => {
              if (window.confirm('Excluir esta demanda e todo o histórico?')) {
                void gravar(async () => { await excluirDemanda(id); fechar() })
              }
            }}>Excluir demanda</Button> : null}
          </div>
        </section>

        {somenteLeitura ? <Aviso>Você está simulando a unidade. As ações da demanda estão desativadas.</Aviso> : null}
        <fieldset className="space-y-2 border-t border-line pt-3" disabled={ocupado || somenteLeitura}>
          <legend className="pr-2 font-bold">Status</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_DEMANDA).map(([valor, nome]) => (
              <Button key={valor} variant={demanda.status === valor ? 'primary' : 'secondary'}
                className={demanda.status === valor ? acaoDemandaClass : undefined} aria-pressed={demanda.status === valor} onClick={() => {
                  if (demanda.status !== valor) void gravar(() => mudarStatusDemanda(id, valor as StatusDemanda))
                }}>{nome}</Button>
            ))}
          </div>
        </fieldset>
        {ocupado ? <p className="text-sm text-muted" role="status">Salvando alteração…</p> : null}
        {erro ? <Aviso tom="erro"><span role="alert">{erro}</span></Aviso> : null}

        <form className="space-y-2" onSubmit={(e) => {
          e.preventDefault()
          if (comentario.trim()) void gravar(async () => {
            await comentarDemanda(id, comentario)
            setComentario('')
          })
        }}>
          <Campo label="Adicionar comentário"><textarea name="comentario" className={inputClass} value={comentario}
            onChange={(e) => setComentario(e.target.value)} rows={3} required maxLength={2000} disabled={ocupado || somenteLeitura} /></Campo>
          <Button type="submit" variant="secondary" disabled={ocupado || somenteLeitura || !comentario.trim()}>Enviar comentário</Button>
        </form>

        {!somenteLeitura && demanda.anexos.length < 8 ? (
          abriuLink ? <form autoComplete="off" className="space-y-2 rounded-xl border border-line p-3" onSubmit={(e) => {
            e.preventDefault()
            void gravar(async () => {
              await adicionarLinkDemanda(id, nomeLink, urlLink)
              setNomeLink('')
              setUrlLink('')
              setAbriuLink(false)
            })
          }}>
            <fieldset disabled={ocupado} className="space-y-2">
              <Campo label="Nome do link"><input name="nome-link" className={inputClass} required maxLength={80}
                value={nomeLink} onChange={(e) => setNomeLink(e.target.value)} /></Campo>
              <Campo label="Endereço HTTPS"><input name="url-link" type="url" className={inputClass} required maxLength={500}
                value={urlLink} onChange={(e) => setUrlLink(e.target.value)} /></Campo>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="secondary">Salvar link</Button>
                <Button type="button" variant="ghost" onClick={() => setAbriuLink(false)}>Cancelar</Button>
              </div>
            </fieldset>
          </form> : <Button variant="secondary" disabled={ocupado} onClick={() => setAbriuLink(true)}>Adicionar link</Button>
        ) : null}

        <section className="space-y-3 border-t border-line pt-4" aria-label="Histórico da demanda">
          <h3 className="font-bold">Histórico</h3>
          {historico.erro || !historico.dados ? <EstadoConsulta {...historico} texto="Carregando histórico…" falha="Não foi possível carregar o histórico." />
            : historico.dados.length ? (
              <ol className="space-y-0 border-l-2 border-line">
                {historico.dados.map((evento) => (
                  <li key={evento.id} className="relative py-2 pl-4 before:absolute before:top-4 before:-left-[5px] before:size-2 before:rounded-full before:bg-brand">
                    <div className="flex flex-wrap items-center gap-2"><Selo>{eventos[evento.tipo]}</Selo>
                      <time dateTime={evento.criadoEm} className="text-xs text-muted">{formatarData(new Date(evento.criadoEm))}</time>
                    </div>
                    <p className="mt-1 wrap-anywhere text-sm font-medium">{evento.autorNome || 'Pessoa indisponível'}</p>
                    <p className="whitespace-pre-wrap wrap-anywhere text-sm text-ink-soft">{evento.texto}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-muted">Nenhum evento registrado.</p>}
        </section>
      </div>
    </PainelDemanda>
  )
}
