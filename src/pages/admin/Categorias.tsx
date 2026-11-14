import { useEffect, useState } from 'react'
import { AudienciaFields, type AudienciaForm } from '../../components/AudienciaFields'
import { Aviso, Button, Campo, inputClass } from '../../components/ui'
import { excluirCategoria, listarUsuarios, salvarCategoria } from '../../lib/api'
import { mensagemErro } from '../../lib/errors'
import { usePortal } from '../../lib/portal'
import type { Usuario } from '../../types'

const audienciaInicial: AudienciaForm = { publico: true, unidades: [], papeis: [], uidsExtra: [] }

export function CategoriasPage() {
  const portal = usePortal()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [ordem, setOrdem] = useState(10)
  const [parentId, setParentId] = useState<string | null>(null)
  const [audiencia, setAudiencia] = useState<AudienciaForm>(audienciaInicial)
  const [editando, setEditando] = useState<string | undefined>()
  const [erro, setErro] = useState('')

  useEffect(() => {
    void listarUsuarios().then(setUsuarios).catch(() => undefined)
  }, [])

  function limpar() {
    setEditando(undefined)
    setNome('')
    setDescricao('')
    setOrdem(10)
    setParentId(null)
    setAudiencia(audienciaInicial)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-3xl font-extrabold">Categorias</h1>
        {erro ? <div className="mt-3"><Aviso tom="erro">{erro}</Aviso></div> : null}
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-white">
          {[...portal.categorias].sort((a, b) => a.ordem - b.ordem).map((categoria) => (
            <li key={categoria.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="font-medium">{categoria.nome}</span>
                <span className="block text-xs text-ink/45">{categoria.id}</span>
              </span>
              <span className="flex gap-2">
                <button
                  className="text-sm font-semibold text-brand"
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
                <button
                  className="text-sm text-red-700"
                  onClick={() => {
                    if (window.confirm('Excluir esta categoria?')) {
                      void excluirCategoria(categoria.id).then(() => portal.atualizar()).catch((falha: unknown) => setErro(mensagemErro(falha)))
                    }
                  }}
                >
                  Excluir
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <form
        className="space-y-3 rounded-2xl border border-line bg-white p-4"
        onSubmit={(evento) => {
          evento.preventDefault()
          void salvarCategoria({ nome, descricao, ordem, parentId, ...audiencia }, usuarios, editando)
            .then(async () => {
              limpar()
              await portal.atualizar()
            })
            .catch((falha: unknown) => setErro(mensagemErro(falha)))
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
        <AudienciaFields valor={audiencia} usuarios={usuarios} onChange={setAudiencia} />
        <Button type="submit">Salvar</Button>
      </form>
    </div>
  )
}
