import { BotaoCsv } from '../../components/BotaoCsv'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, Selo, Vazio, inputClass } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData } from '../../lib/format'
import { listarUnidades } from '../../lib/gestao'
import { useVisao } from '../../lib/visao'
import {
  LIMITES,
  PASTAS_SUGERIDAS,
  ROTULO_TIPO,
  ROTULO_VISIBILIDADE,
  agruparPorPasta,
  filtrarLinks,
  formDoLink,
  formVazio,
  papelNuvem,
  recentes,
  tipoDoLink,
  todasAsTags,
  validarLink,
  type LinkForm,
  type LinkNuvem,
} from '../../lib/nuvem'
import { carregarLinksRede, carregarLinksUnidade, criarLink, removerLink, salvarLink } from '../../lib/nuvemApi'
import type { Usuario } from '../../types'

type Modo = 'rede' | 'unidade'

export function RodapeModulo13() {
  return <p className="text-center text-[11px] text-ink/35">Módulo 13 construído pelo Grok Bot no Cursor (Antigravity sem cota).</p>
}

export function NuvemUnidadePage() {
  return <Nuvem modo="unidade" />
}

export function NuvemRedePage() {
  return <Nuvem modo="rede" />
}

function Nuvem({ modo }: { modo: Modo }) {
  const { user } = useAuth()
  const { comoFranqueado } = useVisao()
  // Como na área do cliente: a simulação do admin não lê a área privada de nenhuma unidade.
  const pessoa = modo === 'unidade' && comoFranqueado ? null : user
  const pode = papelNuvem(pessoa) === modo
  const [links, setLinks] = useState<LinkNuvem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [busca, setBusca] = useState('')
  const [pasta, setPasta] = useState('')
  const [tag, setTag] = useState('')
  const [editando, setEditando] = useState<LinkNuvem | 'novo' | null>(null)
  const [tique, setTique] = useState(0)
  const recarregar = useCallback(() => setTique((t) => t + 1), [])

  useEffect(() => {
    if (!pessoa || !pode) { setCarregando(false); return }
    let vivo = true
    setCarregando(true)
    setErro('')
    const p = modo === 'rede' ? carregarLinksRede() : carregarLinksUnidade(pessoa.unidadeId ?? '')
    void p.then((r) => vivo && setLinks(r)).catch((f) => vivo && setErro(mensagemErro(f))).finally(() => vivo && setCarregando(false))
    return () => { vivo = false }
  }, [pessoa, pode, modo, tique])

  const filtrados = useMemo(() => filtrarLinks(links, busca, tag).filter((l) => !pasta || l.pasta === pasta), [links, busca, tag, pasta])
  const tags = useMemo(() => todasAsTags(links), [links])
  const pastas = useMemo(() => [...new Set([...links.map((l) => l.pasta), ...PASTAS_SUGERIDAS])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [links])
  const daUnidade = (l: LinkNuvem) => modo === 'unidade' && l.dono === (pessoa?.unidadeId ?? '')
  const podeEditar = (l: LinkNuvem) => (modo === 'rede' ? l.dono === '' : daUnidade(l))

  if (!carregando && (!pessoa || !pode)) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Vazio
          titulo={modo === 'rede' ? 'Nuvem da franqueadora' : 'Nuvem da unidade'}
          texto={modo === 'rede'
            ? 'Disponível para o admin e para a equipe da franqueadora com o módulo "Armazenamento em Nuvem" da franqueadora.'
            : 'Disponível para o franqueado e a equipe da unidade com o módulo liberado. A área privada da unidade não é lida pela franqueadora, nem na simulação.'}
        />
        <RodapeModulo13 />
      </div>
    )
  }

  async function remover(l: LinkNuvem) {
    if (!window.confirm(`Remover "${l.titulo}" do portal? O arquivo no Google Drive não é apagado.`)) return
    try { await removerLink(l.id); setOk('Link removido do portal. O arquivo no Drive continua lá.'); recarregar() } catch (f) { setErro(mensagemErro(f)) }
  }

  const daRede = modo === 'unidade' ? filtrados.filter((l) => l.dono === '') : []
  const privados = modo === 'unidade' ? filtrados.filter(daUnidade) : filtrados

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Armazenamento em Nuvem · {modo === 'rede' ? 'Franqueadora' : pessoa?.unidade || 'Unidade'}</p>
          <h1 className="text-2xl font-black text-ink">{modo === 'rede' ? 'Arquivos da rede' : 'Arquivos da unidade'}</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-ink/65">
            Organize os arquivos do Google Drive por pasta e etiqueta. O portal guarda só o link e as informações; quem consegue abrir o arquivo continua definido no compartilhamento do próprio Drive.
          </p>
        </div>
        <Button type="button" onClick={() => { setEditando('novo'); setOk('') }}><Plus className="h-4 w-4" aria-hidden="true" /> Novo link</Button>
      </header>

      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {editando && pessoa ? (
        <FormLink
          pessoa={pessoa}
          modo={modo}
          link={editando === 'novo' ? null : editando}
          pastas={pastas}
          onFechar={() => setEditando(null)}
          onSalvo={(msg) => { setEditando(null); setOk(msg); recarregar() }}
        />
      ) : null}

      <section className="flex flex-wrap items-end gap-3">
        <Campo label="Buscar"><input className={`${inputClass} w-64`} placeholder="Título, descrição, pasta ou etiqueta" value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
        <Campo label="Etiqueta">
          <select className={`${inputClass} w-48`} value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Todas</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Campo>
        <Campo label="Pasta">
          <select className={inputClass} value={pasta} onChange={(e) => setPasta(e.target.value)}>
            <option value="">Todas</option>
            {[...new Set(links.map((l) => l.pasta))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Campo>
        {pode && !carregando && !comoFranqueado ? <BotaoCsv arquivo={`nuvem-${modo}`} cabecalhos={['Título', 'Pasta', 'Etiquetas', 'Visibilidade', 'URL']}
          linhas={[...agruparPorPasta(daRede), ...agruparPorPasta(privados)].flatMap((grupo) => grupo.links).map((l) => [l.titulo, l.pasta, l.tags.join(', '), ROTULO_VISIBILIDADE[l.visibilidade], l.url])} /> : null}
        <p className="pb-2 text-sm text-ink/50">{filtrados.length} de {links.length} link(s)</p>
      </section>

      {carregando ? <Carregando texto="Carregando os links…" /> : links.length === 0 ? (
        <Vazio titulo="Nenhum link ainda" texto={modo === 'rede' ? 'Publique o primeiro link do Drive para a rede, para algumas unidades ou só para a franqueadora.' : 'Guarde aqui os links do Drive da unidade. Os links que a franqueadora compartilhar também aparecem nesta tela.'} />
      ) : !filtrados.length ? (
        <Vazio titulo="Nenhum resultado para este filtro" texto="Ajuste a busca, a etiqueta ou a pasta." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <div className="space-y-6">
            {modo === 'unidade' ? (
              <>
                <Area titulo="Da franqueadora" dica="Compartilhados com a rede toda ou com a sua unidade." links={daRede} podeEditar={podeEditar} onEditar={setEditando} onRemover={remover} />
                <Area titulo="Área privada da unidade" dica="Só a sua unidade vê. A franqueadora não tem acesso." links={privados} podeEditar={podeEditar} onEditar={setEditando} onRemover={remover} />
              </>
            ) : (
              <Area titulo="Publicados pela franqueadora" dica="A área privada das unidades não aparece aqui." links={privados} podeEditar={podeEditar} onEditar={setEditando} onRemover={remover} />
            )}
          </div>
          <aside className="space-y-2 rounded-3xl border border-line bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold">Adicionados recentemente</h2>
            <ol className="space-y-2">
              {recentes(filtrados).map((l) => (
                <li key={l.id} className="text-sm">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-dark hover:underline">{l.titulo}</a>
                  <p className="text-[11px] text-ink/45">{l.pasta} · {formatarData(l.criadoEmMs)}</p>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}
      <RodapeModulo13 />
    </div>
  )
}

function Area({ titulo, dica, links, podeEditar, onEditar, onRemover }: {
  titulo: string; dica: string; links: LinkNuvem[]; podeEditar: (l: LinkNuvem) => boolean; onEditar: (l: LinkNuvem) => void; onRemover: (l: LinkNuvem) => void
}) {
  const grupos = agruparPorPasta(links)
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold">{titulo}</h2>
        <p className="text-xs text-ink/50">{dica}</p>
      </div>
      {grupos.length === 0 ? <p className="text-sm text-ink/50">Nada por aqui com esse filtro.</p> : grupos.map((g) => (
        <div key={g.pasta} className="rounded-3xl border border-line bg-white p-4 shadow-sm">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink/80"><FolderOpen className="h-4 w-4 text-brand" aria-hidden="true" /> {g.pasta} <span className="font-normal text-ink/40">({g.links.length})</span></h3>
          <ul className="divide-y divide-line">
            {g.links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-dark hover:underline">
                      {l.titulo} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                    <Selo>{ROTULO_TIPO[tipoDoLink(l.url)]}</Selo>
                    <Selo tom={l.visibilidade === 'rede' ? 'marca' : l.visibilidade === 'privada' ? 'lima' : 'neutro'}>
                      {ROTULO_VISIBILIDADE[l.visibilidade]}{l.visibilidade === 'unidades' ? ` (${l.unidades.length})` : ''}
                    </Selo>
                  </div>
                  {l.descricao ? <p className="whitespace-pre-wrap text-sm text-ink/70">{l.descricao}</p> : null}
                  {l.tags.length ? <p className="flex flex-wrap gap-1">{l.tags.map((t) => <span key={t} className="rounded-full bg-paper px-2 py-0.5 text-[11px] text-ink/60">#{t}</span>)}</p> : null}
                  <p className="text-[11px] text-ink/45">
                    Adicionado por {l.criadoPorNome || '—'} em {formatarData(l.criadoEmMs)}
                    {l.atualizadoEmMs > l.criadoEmMs + 1000 ? ` · editado por ${l.atualizadoPorNome} em ${formatarData(l.atualizadoEmMs)}` : ''}
                    {l.geradoPorIA ? ` · descrição escrita com IA (${l.iaModelo})` : ''}
                  </p>
                </div>
                {podeEditar(l) ? (
                  <div className="flex gap-1">
                    <button type="button" aria-label={`Editar ${l.titulo}`} className="rounded-lg border border-line p-1.5 hover:bg-paper" onClick={() => onEditar(l)}><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                    <button type="button" aria-label={`Remover ${l.titulo}`} className="rounded-lg border border-line p-1.5 text-red-700 hover:bg-red-50" onClick={() => onRemover(l)}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function FormLink({ pessoa, modo, link, pastas, onFechar, onSalvo }: {
  pessoa: Usuario; modo: Modo; link: LinkNuvem | null; pastas: string[]; onFechar: () => void; onSalvo: (msg: string) => void
}) {
  const [f, setF] = useState<LinkForm>(() => (link ? formDoLink(link) : formVazio(modo)))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [unidades, setUnidades] = useState<Array<{ id: string; nome: string }> | null>(null)
  const [idsManuais, setIdsManuais] = useState('')

  useEffect(() => {
    if (modo !== 'rede') return
    let vivo = true
    // Quem não pode ler o cadastro de unidades (só tem o módulo de nuvem) informa os códigos à mão.
    void listarUnidades().then((us) => vivo && setUnidades(us.filter((u) => u.ativo).map((u) => ({ id: u.id, nome: u.nome })))).catch(() => vivo && setUnidades([]))
    return () => { vivo = false }
  }, [modo])

  const unidadesEscolhidas = unidades && unidades.length ? f.unidades : idsManuais.split(/[\s,;]+/).filter(Boolean)

  async function salvar() {
    const form = { ...f, unidades: unidadesEscolhidas }
    const erros = validarLink(form, modo)
    if (erros.length) { setErro(erros.join(' ')); return }
    setErro('')
    setSalvando(true)
    try {
      if (link) await salvarLink(pessoa, link.id, form)
      else await criarLink(pessoa, modo, form)
      onSalvo(link ? 'Link atualizado.' : 'Link guardado. Confira no Drive se as pessoas certas têm acesso ao arquivo.')
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="space-y-3 rounded-3xl border border-brand/30 bg-white p-5 shadow-sm" aria-label={link ? 'Editar link' : 'Novo link'}>
      <h2 className="text-lg font-bold">{link ? 'Editar link' : 'Novo link do Google Drive'}</h2>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Campo label="Título"><input className={inputClass} maxLength={LIMITES.titulo} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></Campo>
        <Campo label="Link do Google Drive ou Docs" hint="https://drive.google.com/… ou https://docs.google.com/…">
          <input className={inputClass} inputMode="url" maxLength={LIMITES.url} placeholder="https://drive.google.com/…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
        </Campo>
        <Campo label="Pasta">
          <input className={inputClass} list="nuvem-pastas" maxLength={LIMITES.pasta} placeholder="Ex.: Contratos" value={f.pasta} onChange={(e) => setF({ ...f, pasta: e.target.value })} />
          <datalist id="nuvem-pastas">{pastas.map((p) => <option key={p} value={p} />)}</datalist>
        </Campo>
        <Campo label="Etiquetas" hint="Separe por vírgula (até 10)."><input className={inputClass} placeholder="contrato, modelo" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Campo>
      </div>
      <Campo label="Descrição"><textarea className={inputClass} rows={3} maxLength={LIMITES.descricao} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.geradoPorIA} onChange={(e) => setF({ ...f, geradoPorIA: e.target.checked })} /> Descrição escrita com ajuda de IA</label>
        {f.geradoPorIA ? <input className={`${inputClass} max-w-56`} aria-label="Qual IA / modelo" placeholder="Qual IA / modelo" maxLength={LIMITES.iaModelo} value={f.iaModelo} onChange={(e) => setF({ ...f, iaModelo: e.target.value })} /> : null}
      </div>
      {modo === 'rede' ? (
        <div className="space-y-2">
          <Campo label="Quem vê no portal">
            <select className={`${inputClass} max-w-xs`} value={f.visibilidade} onChange={(e) => setF({ ...f, visibilidade: e.target.value as LinkForm['visibilidade'] })}>
              <option value="rede">{ROTULO_VISIBILIDADE.rede}</option>
              <option value="unidades">{ROTULO_VISIBILIDADE.unidades}</option>
              <option value="franqueadora">{ROTULO_VISIBILIDADE.franqueadora}</option>
            </select>
          </Campo>
          {f.visibilidade === 'unidades' ? (
            unidades === null ? <Carregando texto="Carregando as unidades…" /> : unidades.length ? (
              <fieldset className="grid max-h-48 gap-1 overflow-auto rounded-xl border border-line p-3 sm:grid-cols-2">
                <legend className="px-1 text-xs font-semibold text-ink/60">Unidades</legend>
                {unidades.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={f.unidades.includes(u.id)} onChange={(e) => setF({ ...f, unidades: e.target.checked ? [...f.unidades, u.id] : f.unidades.filter((x) => x !== u.id) })} /> {u.nome}
                  </label>
                ))}
              </fieldset>
            ) : (
              <Campo label="Códigos das unidades" hint="Seu perfil não lê o cadastro de unidades; informe os códigos separados por vírgula.">
                <input className={inputClass} value={idsManuais || f.unidades.join(', ')} onChange={(e) => setIdsManuais(e.target.value)} />
              </Campo>
            )
          ) : null}
        </div>
      ) : <p className="text-sm text-ink/60">Fica na <b>área privada da unidade</b>: só a sua unidade vê.</p>}
      <p className="text-[11px] text-ink/45">O portal não muda o compartilhamento no Drive. Para alguém abrir o arquivo, ele precisa estar compartilhado no Google Drive.</p>
      <div className="flex gap-2">
        <Button type="button" disabled={salvando} onClick={() => void salvar()}>{salvando ? 'Salvando…' : link ? 'Salvar' : 'Guardar link'}</Button>
        <Button type="button" variant="secondary" onClick={onFechar}>Cancelar</Button>
      </div>
    </section>
  )
}
