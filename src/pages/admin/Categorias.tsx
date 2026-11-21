import { useEffect, useRef, useState } from 'react'
import { AudienciaFields, type AudienciaForm } from '../../components/AudienciaFields'
import { Aviso, Button, Campo, Carregando, Vazio, inputClass } from '../../components/ui'
import { excluirCategoria, listarUsuarios, salvarCategoria } from '../../lib/api'
import { mensagemErro } from '../../lib/errors'
import { useVisao } from '../../lib/visao'
import { usePortal } from '../../lib/portal'
import type { Usuario } from '../../types'

const audienciaInicial: AudienciaForm = { publico: true, unidades: [], papeis: [], uidsExtra: [] }

export function CategoriasPage() {
  const { ehAdmin } = useVisao()
  const portal = usePortal()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [ordem, setOrdem] = useState(10)
  const [parentId, setParentId] = useState<string | null>(null)
  const [audiencia, setAudiencia] = useState<AudienciaForm>(audienciaInicial)
  const [editando, setEditando] = useState<string | undefined>()
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const gravacaoEmCurso = useRef(false)
  const [erroUsuarios, setErroUsuarios] = useState(false)
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(ehAdmin)
  const [tiqueUsuarios, setTiqueUsuarios] = useState(0)

  useEffect(() => {
    if (!ehAdmin) return
    let ativo = true
    setCarregandoUsuarios(true)
    setErroUsuarios(false)
    void listarUsuarios()
      .then((lista) => ativo && setUsuarios(lista))
      .catch(() => ativo && setErroUsuarios(true))
      .finally(() => ativo && setCarregandoUsuarios(false))
    return () => { ativo = false }
  }, [ehAdmin, tiqueUsuarios])

  function limpar() {
    setEditando(undefined)
    setNome('')
    setDescricao('')
    setOrdem(10)
    setParentId(null)
    setAudiencia(audienciaInicial)
  }

  async function gravar(acao: () => Promise<unknown>) {
    if (gravacaoEmCurso.current) return
    gravacaoEmCurso.current = true
    setErro('')
    setSalvando(true)
    try {
      await acao()
      await portal.atualizar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      gravacaoEmCurso.current = false
      setSalvando(false)
    }
  }

  const audienciaIndisponivel = ehAdmin && (carregandoUsuarios || erroUsuarios)

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <header className="cabecalho-pagina mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Biblioteca</p>
          <h1 className="text-3xl font-bold">Categorias</h1>
        </header>
        {erro ? <div className="mt-3"><Aviso tom="erro">{erro}</Aviso></div> : null}
        {portal.erro ? <Aviso tom="erro">{portal.erro} <Button variant="ghost" onClick={() => void portal.atualizar()}>Tentar novamente</Button></Aviso> : null}
        {portal.carregando ? <Carregando texto="Carregando categorias…" /> : null}
        {!portal.carregando && !portal.erro && !portal.categorias.length ? (
          <Vazio titulo="Nenhuma categoria cadastrada" texto="Use o formulário para criar a primeira categoria." />
        ) : null}
        {portal.categorias.length ? <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
          {[...portal.categorias].sort((a, b) => a.ordem - b.ordem).map((categoria) => (
            <li key={categoria.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="font-medium">{categoria.nome}</span>
                <span className="block text-xs text-muted">{categoria.id}</span>
              </span>
              <span className="flex gap-2">
                <button
                  className="text-sm font-semibold text-brand"
                  disabled={salvando}
                  onClick={() => {
                    setEditando(categoria.id)
                    setNome(categoria.nome)
                    setDescricao(categoria.descricao)
                    setOrdem(categoria.ordem)
                    setParentId(categoria.parentId)
                    setAudiencia({ publico: categoria.publico, unidades: categoria.unidades, papeis: categoria.papeis, uidsExtra: categoria.uidsExtra })
                  }}
                >
                  Editar
                </button>
                {ehAdmin ? <button
                  className="text-sm text-red-700"
                  disabled={salvando}
                  onClick={() => {
                    if (!gravacaoEmCurso.current && window.confirm('Excluir esta categoria?')) {
                      void gravar(async () => {
                        await excluirCategoria(categoria.id)
                        if (editando === categoria.id) limpar()
                      })
                    }
                  }}
                >
                  Excluir
                </button> : null}
              </span>
            </li>
          ))}
        </ul> : null}
      </div>
      <form
        className="space-y-3 rounded-2xl border border-line bg-surface p-4"
        onSubmit={(evento) => {
          evento.preventDefault()
          if (audienciaIndisponivel) return
          void gravar(async () => {
            await salvarCategoria({ nome, descricao, ordem, parentId, ...audiencia }, ehAdmin ? usuarios : null, editando)
            limpar()
          })
        }}
      >
        <h2 className="font-bold">{editando ? 'Editar categoria' : 'Nova categoria'}</h2>
        <Campo label="Nome">
          <input className={inputClass} required minLength={2} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo label="Descrição">
          <textarea className={inputClass} rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        <Campo label="Ordem">
          <input className={inputClass} type="number" value={ordem} onChange={(e) => setOrdem(Number(e.target.value))} />
        </Campo>
        <Campo label="Categoria pai">
          <select className={inputClass} value={parentId ?? ''} onChange={(e) => setParentId(e.target.value || null)}>
            <option value="">Nenhuma (raiz)</option>
            {portal.categorias.filter((categoria) => categoria.id !== editando).map((categoria) => (
              <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
            ))}
          </select>
        </Campo>
        {ehAdmin && carregandoUsuarios ? <Carregando texto="Carregando a lista de usuários…" /> : null}
        {ehAdmin && erroUsuarios ? <Aviso tom="erro"><span role="alert">Não foi possível carregar os usuários para definir a audiência.</span> <Button variant="ghost" onClick={() => setTiqueUsuarios((t) => t + 1)}>Tentar novamente</Button></Aviso> : null}
        {ehAdmin ? (
          <AudienciaFields valor={audiencia} usuarios={usuarios} onChange={setAudiencia} />
        ) : !editando ? (
          <p className="text-sm text-ink-soft">A nova categoria ficará visível para quem tem acesso a Manuais.</p>
        ) : null}
        <Button type="submit" disabled={salvando || audienciaIndisponivel}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
      </form>
    </div>
  )
}
