import { Textura } from '../../components/Textura'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { listarUsuarios } from '../../lib/api'
import { usePortal } from '../../lib/portal'
import type { Usuario } from '../../types'

export function PainelPage() {
  const portal = usePortal()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  useEffect(() => {
    void listarUsuarios().then(setUsuarios).catch(() => undefined)
  }, [])
  const pendentes = usuarios.filter((usuario) => !usuario.ativo && !usuario.recusado)
  const cards = [
    { rotulo: 'Acessos pendentes', valor: pendentes.length, para: '/admin/usuarios' },
    { rotulo: 'Documentos', valor: portal.documentos.length, para: '/admin/documento/novo' },
    { rotulo: 'Trilhas', valor: portal.trilhas.length, para: '/admin/trilhas' },
    { rotulo: 'Categorias', valor: portal.categorias.length, para: '/admin/categorias' },
  ]
  return (
    <div className="space-y-6">
      <header className="apresentacao">
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-7 sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-lime-soft">Franqueadora</p>
            <h1 className="mt-2 text-3xl font-bold">Painel</h1>
          </div>
          <Link to="/admin/conformidade" className="inline-flex min-h-11 items-center rounded-[10px] bg-lime px-4 py-2 text-sm font-semibold text-ink hover:bg-lime-soft">
            Quem leu e aceitou
          </Link>
        </div>
        <Textura className="h-8 w-full sm:h-12" />
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.rotulo} to={card.para} className="rounded-2xl border border-line bg-surface p-4 hover:border-brand">
            <p className="text-3xl font-bold tabular-nums text-brand">{card.valor}</p>
            <p className="text-sm text-muted">{card.rotulo}</p>
          </Link>
        ))}
      </div>
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Atalhos</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link className="rounded-full bg-brand px-3 py-1 font-semibold text-white" to="/admin/documento/novo">Novo documento</Link>
          <Link className="rounded-full bg-paper px-3 py-1 font-semibold" to="/admin/trilhas/nova">Nova trilha</Link>
          <Link className="rounded-full bg-paper px-3 py-1 font-semibold" to="/admin/usuarios">Usuários</Link>
          <Link className="rounded-full bg-paper px-3 py-1 font-semibold" to="/admin/categorias">Categorias</Link>
          <Link className="rounded-full bg-paper px-3 py-1 font-semibold" to="/admin/importar">Importar pacote de conteúdo</Link>
        </div>
      </section>
    </div>
  )
}
