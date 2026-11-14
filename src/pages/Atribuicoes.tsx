import { Link } from 'react-router-dom'
import { Selo, Vazio } from '../components/ui'
import { useAuth } from '../lib/auth'
import { usePortal } from '../lib/portal'
import { leituraDaVersao } from '../lib/quiz'

export function AtribuicoesPage() {
  const { user } = useAuth()
  const portal = usePortal()
  if (!user) return null
  const itens = portal.documentos.filter((documento) => documento.status === 'publicado' && documento.leituraObrigatoria)
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold">Atribuições</h1>
        <p className="text-sm text-ink/55">Leituras obrigatórias da sua unidade. O aceite fica registrado com data e versão.</p>
      </header>
      {itens.length ? (
        <ul className="overflow-hidden rounded-2xl border border-line bg-white">
          {itens.map((documento) => {
            const aceito = portal.aceites.some((aceite) => aceite.uid === user.uid && aceite.documentoId === documento.id && aceite.versao === documento.versao)
            const lido = leituraDaVersao(portal.leituras, user.uid, documento.id, documento.versao)
            return (
              <li key={documento.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
                <div>
                  <p className="font-medium">{documento.titulo}</p>
                  <p className="text-xs text-ink/45">Versão {documento.versao}</p>
                </div>
                <div className="flex items-center gap-3">
                  {aceito ? <Selo tom="lima">Aceito</Selo> : lido ? <Selo>Lido</Selo> : <Selo tom="marca">Pendente</Selo>}
                  <Link to={`/documento/${documento.id}`} className="text-sm font-semibold text-brand">
                    Abrir
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <Vazio titulo="Nenhuma leitura atribuída" texto="Quando a franqueadora marcar um documento como obrigatório, ele aparece aqui." />
      )}
    </div>
  )
}