import mammoth from 'mammoth'
import { marked } from 'marked'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AudienciaFields, type AudienciaForm } from '../../components/AudienciaFields'
import { RichEditor } from '../../components/Editor'
import { Aviso, Button, Campo, Carregando, inputClass } from '../../components/ui'
import { MODELOS } from '../../data/modelos'
import { gerarRascunho } from '../../lib/ai'
import { excluirDocumento, enviarArquivo, listarUsuarios, salvarDocumento, type RascunhoDocumento } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { storageHabilitado } from '../../firebaseConfig'
import { mensagemErro } from '../../lib/errors'
import { htmlParaTexto } from '../../lib/text'
import { useVisao } from '../../lib/visao'
import { usePortal } from '../../lib/portal'
import type { Anexo, TipoDocumento, Usuario } from '../../types'

const vazio = (categoriaId: string): RascunhoDocumento => ({
  titulo: '',
  categoriaId,
  tipo: 'pop',
  formato: 'richtext',
  status: 'rascunho',
  leituraObrigatoria: false,
  conteudoHtml: '<p></p>',
  htmlConteudo: '',
  htmlUrl: '',
  anexos: [],
  publico: true,
  unidades: [],
  papeis: [],
  uidsExtra: [],
})

export default function DocumentoEditor() {
  const { id } = useParams()
  const novo = !id || id === 'novo'
  const navigate = useNavigate()
  const { user } = useAuth()
  const { ehAdmin } = useVisao()
  const portal = usePortal()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [form, setForm] = useState<RascunhoDocumento | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [params] = useSearchParams()
  const [anexoNome, setAnexoNome] = useState('')
  const [anexoUrl, setAnexoUrl] = useState('')
  const [pedidoIa, setPedidoIa] = useState('')

  useEffect(() => {
    if (!ehAdmin) return
    void listarUsuarios().then(setUsuarios).catch(() => undefined)
  }, [ehAdmin])

  useEffect(() => {
    if (!portal.categorias.length && portal.carregando) return
    if (novo) {
      setForm((atual) => {
        if (atual) return atual
        const base = vazio(portal.categorias[0]?.id ?? 'operacao')
        const modelo = MODELOS.find((item) => item.id === params.get('modelo'))
        return modelo ? { ...base, tipo: modelo.tipo, titulo: modelo.nome, conteudoHtml: modelo.html } : base
      })
      return
    }
    const documento = portal.documentos.find((item) => item.id === id)
    if (!documento) return
    setForm({
      titulo: documento.titulo,
      categoriaId: documento.categoriaId,
      tipo: documento.tipo,
      formato: documento.formato,
      status: documento.status,
      leituraObrigatoria: documento.leituraObrigatoria,
      conteudoHtml: documento.conteudoHtml || '<p></p>',
      htmlConteudo: documento.htmlConteudo,
      htmlUrl: documento.htmlUrl,
      anexos: documento.anexos,
      publico: documento.publico,
      unidades: documento.unidades,
      papeis: documento.papeis,
      uidsExtra: documento.uidsExtra,
    })
  }, [id, novo, portal.categorias, portal.documentos, portal.carregando])

  if (!form && portal.carregando) return <Carregando texto="Carregando editor…" />
  if (!form || !user) return (
    <Aviso tom="erro">
      {portal.erro || 'Documento indisponível.'}{' '}
      <Link to="/biblioteca" className="underline">Voltar à biblioteca</Link>
    </Aviso>
  )

  const audiencia: AudienciaForm = {
    publico: form.publico,
    unidades: form.unidades,
    papeis: form.papeis,
    uidsExtra: form.uidsExtra,
  }

  async function salvar(status: RascunhoDocumento['status']) {
    if (!form || !user) return
    if (!form.titulo.trim() || !form.categoriaId) {
      setErro('Informe o título e a categoria.')
      return
    }
    setOcupado(true)
    setErro('')
    try {
      const salvo = await salvarDocumento({ ...form, status }, user, ehAdmin ? usuarios : null, novo ? undefined : id)
      await portal.atualizar()
      navigate(`/documento/${salvo}`)
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  async function importar(arquivo: File) {
    const nome = arquivo.name.toLowerCase()
    if (nome.endsWith('.html') || nome.endsWith('.htm')) {
      const html = await arquivo.text()
      setForm((atual) => (atual ? { ...atual, formato: 'html', htmlConteudo: html, tipo: 'html' } : atual))
      return
    }
    if (nome.endsWith('.md') || nome.endsWith('.markdown')) {
      const html = await marked.parse(await arquivo.text())
      setForm((atual) => (atual ? { ...atual, formato: 'richtext', conteudoHtml: String(html) } : atual))
      return
    }
    if (nome.endsWith('.docx')) {
      const resultado = await mammoth.convertToHtml({ arrayBuffer: await arquivo.arrayBuffer() })
      setForm((atual) => (atual ? { ...atual, formato: 'richtext', conteudoHtml: resultado.value } : atual))
      return
    }
    setErro('Use um arquivo .docx, .md ou .html.')
  }

  function adicionarAnexo(anexo: Anexo) {
    setForm({ ...form!, anexos: [...form!.anexos, anexo] })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="cabecalho-pagina">
        <Link to="/admin" className="text-xs font-semibold uppercase tracking-wider text-brand">Painel</Link>
        <h1 className="text-3xl font-bold">{novo ? 'Novo documento' : 'Editar documento'}</h1>
      </header>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <Campo label="Título">
        <input className={inputClass} maxLength={120} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
      </Campo>
      <div className="grid gap-3 md:grid-cols-3">
        <Campo label="Categoria">
          <select className={inputClass} value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}>
            {portal.categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
            ))}
          </select>
        </Campo>
        <Campo label="Tipo">
          <select className={inputClass} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoDocumento })}>
            <option value="pop">POP</option>
            <option value="manual">Manual</option>
            <option value="processo">Processo</option>
            <option value="politica">Política</option>
            <option value="checklist">Checklist</option>
            <option value="html">Manual interativo</option>
          </select>
        </Campo>
        <Campo label="Formato">
          <select className={inputClass} value={form.formato} onChange={(e) => setForm({ ...form, formato: e.target.value === 'html' ? 'html' : 'richtext' })}>
            <option value="richtext">Página rica</option>
            <option value="html">HTML interativo</option>
          </select>
        </Campo>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.leituraObrigatoria} onChange={(e) => setForm({ ...form, leituraObrigatoria: e.target.checked })} />
        Leitura obrigatória com aceite “Li e concordo”
      </label>
      <div className="flex flex-wrap gap-2">
        {MODELOS.map((modelo) => (
          <button
            key={modelo.id}
            type="button"
            className="rounded-full bg-paper px-3 py-1 text-xs font-semibold"
            onClick={() => setForm({ ...form, tipo: modelo.tipo, formato: 'richtext', conteudoHtml: modelo.html })}
          >
            Modelo: {modelo.nome}
          </button>
        ))}
        <label className="cursor-pointer rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">
          Importar .docx, .md ou .html
          <input
            type="file"
            accept=".docx,.md,.markdown,.html,.htm"
            className="hidden"
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0]
              if (arquivo) void importar(arquivo).catch((falha: unknown) => setErro(mensagemErro(falha)))
            }}
          />
        </label>
      </div>
      <form
        className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 sm:flex-row"
        onSubmit={(evento) => {
          evento.preventDefault()
          if (!pedidoIa.trim()) return
          setOcupado(true)
          void gerarRascunho(pedidoIa.trim())
            .then((html) => setForm((atual) => (atual ? { ...atual, formato: 'richtext', conteudoHtml: html, tipo: 'pop' } : atual)))
            .catch((falha: unknown) => setErro(mensagemErro(falha)))
            .finally(() => setOcupado(false))
        }}
      >
        <input className={inputClass} value={pedidoIa} onChange={(e) => setPedidoIa(e.target.value)} placeholder="Gerar um POP com IA. Ex.: abertura de domingo na unidade" />
        <Button type="submit" variant="secondary" disabled={ocupado}>Gerar</Button>
      </form>
      {form.formato === 'richtext' ? (
        <RichEditor value={form.conteudoHtml} onChange={(html) => setForm({ ...form, conteudoHtml: html })} />
      ) : (
        <div className="space-y-3">
          <Campo label="HTML do manual" hint="O conteúdo abre num quadro isolado, com os scripts da página e sem acesso ao portal.">
            <textarea className={inputClass} rows={12} value={form.htmlConteudo} onChange={(e) => setForm({ ...form, htmlConteudo: e.target.value })} />
          </Campo>
          <Campo label="Ou URL do manual">
            <input className={inputClass} value={form.htmlUrl} onChange={(e) => setForm({ ...form, htmlUrl: e.target.value })} placeholder="https://" />
          </Campo>
          {form.htmlConteudo ? (
            <iframe title="Prévia" sandbox="allow-scripts" srcDoc={form.htmlConteudo} className="h-80 w-full rounded-2xl border border-line bg-surface" />
          ) : null}
        </div>
      )}
      {ehAdmin ? (
        <AudienciaFields valor={audiencia} usuarios={usuarios} onChange={(valor) => setForm({ ...form, ...valor })} />
      ) : novo ? (
        <p className="text-sm text-ink-soft">Após a publicação, o documento ficará visível para quem tem acesso a Manuais.</p>
      ) : null}
      <section className="space-y-2 rounded-2xl border border-line p-4">
        <h2 className="font-semibold">Anexos por link</h2>
        <p className="text-xs text-muted">Google Drive, YouTube ou qualquer URL. O envio de arquivo pelo Storage permanece desligado no plano Spark.</p>
        <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
          <input className={inputClass} placeholder="Nome" value={anexoNome} onChange={(e) => setAnexoNome(e.target.value)} />
          <input className={inputClass} placeholder="https://" value={anexoUrl} onChange={(e) => setAnexoUrl(e.target.value)} />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (!anexoNome.trim() || !anexoUrl.trim()) return
              const tipo = anexoUrl.includes('drive.google') ? 'drive' : anexoUrl.includes('youtu') ? 'video' : 'link'
              adicionarAnexo({ nome: anexoNome.trim(), url: anexoUrl.trim(), tipo })
              setAnexoNome('')
              setAnexoUrl('')
            }}
          >
            Adicionar
          </Button>
        </div>
        {storageHabilitado() ? (
          <label className="inline-flex cursor-pointer text-sm font-semibold text-brand">
            Enviar arquivo
            <input
              type="file"
              className="hidden"
              onChange={(evento) => {
                const arquivo = evento.target.files?.[0]
                if (!arquivo) return
                void enviarArquivo(arquivo)
                  .then((url) => adicionarAnexo({ nome: arquivo.name, url, tipo: 'link' }))
                  .catch((falha: unknown) => setErro(mensagemErro(falha)))
              }}
            />
          </label>
        ) : null}
        <ul className="text-sm">
          {form.anexos.map((anexo) => (
            <li key={anexo.url} className="flex justify-between gap-2 py-1">
              <span>{anexo.nome}</span>
              <button type="button" className="text-red-700" onClick={() => setForm({ ...form, anexos: form.anexos.filter((item) => item !== anexo) })}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-muted">{htmlParaTexto(form.conteudoHtml).length} caracteres de texto pesquisável.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={ocupado} onClick={() => void salvar('rascunho')}>Salvar rascunho</Button>
        <Button disabled={ocupado} onClick={() => void salvar('publicado')}>Publicar</Button>
        {ehAdmin && !novo ? (
          <Button
            variant="danger"
            onClick={() => {
              if (!id || !window.confirm('Excluir este documento?')) return
              void excluirDocumento(id).then(() => navigate('/biblioteca')).catch((falha: unknown) => setErro(mensagemErro(falha)))
            }}
          >
            Excluir
          </Button>
        ) : null}
      </div>
    </div>
  )
}
