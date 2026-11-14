import { Link } from 'react-router-dom'
import { Vazio } from '../components/ui'
import { useAuth } from '../lib/auth'
import { formatarDia } from '../lib/format'
import { usePortal } from '../lib/portal'

export function MeusCertificadosPage() {
  const { user } = useAuth()
  const { certificados } = usePortal()
  const meus = certificados.filter((item) => item.uid === user?.uid)
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <p className="text-sm font-medium text-ink/50">Universidade UBOX</p>
        <h1 className="text-2xl font-extrabold">Meus certificados</h1>
        <p className="text-sm text-ink/60">Os certificados das trilhas que você já concluiu.</p>
      </header>
      {meus.length ? (
        <ul className="overflow-hidden rounded-2xl border border-line bg-white">
          {meus.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
              <span>
                <span className="block font-medium">{item.trilhaTitulo}</span>
                <span className="text-xs text-ink/45">{formatarDia(item.emitidoEm)} · {item.codigo}</span>
              </span>
              <Link to={`/certificado/${item.trilhaId}`} className="text-sm font-semibold text-brand">
                Abrir
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Vazio titulo="Nenhum certificado ainda" texto="Conclua uma trilha da Universidade para emitir o seu." />
      )}
    </div>
  )
}
