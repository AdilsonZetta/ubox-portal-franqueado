import { Link } from 'react-router-dom'
import { Vazio } from '../components/ui'
import { formatarData } from '../lib/format'
import { usePortal } from '../lib/portal'

export function NotificacoesPage() {
  const { avisos, avisosLidos, marcarLido } = usePortal()
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-extrabold">Notificações</h1>
      {!avisos.length ? <Vazio titulo="Nenhuma novidade" texto="Avisos de documentos novos ou atualizados aparecem aqui." /> : null}
      <ul className="space-y-3">
        {avisos.map((aviso) => {
          const lido = avisosLidos.includes(aviso.id)
          return (
            <li key={aviso.id} className={`rounded-2xl border bg-white p-4 ${lido ? 'border-line' : 'border-brand/40'}`}>
              <p className="font-semibold">{aviso.titulo}</p>
              <p className="mt-1 text-sm text-ink/70">{aviso.mensagem}</p>
              <p className="mt-2 text-xs text-ink/45">{formatarData(aviso.criadoEm)}</p>
              <div className="mt-3 flex gap-3 text-sm">
                {aviso.documentoId ? (
                  <Link to={`/documento/${aviso.documentoId}`} className="font-semibold text-brand" onClick={() => void marcarLido(aviso.id)}>
                    Abrir documento
                  </Link>
                ) : null}
                {!lido ? (
                  <button className="font-semibold" onClick={() => void marcarLido(aviso.id)}>
                    Marcar como lida
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
