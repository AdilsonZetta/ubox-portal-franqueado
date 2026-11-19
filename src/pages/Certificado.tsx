import { Link, useParams } from 'react-router-dom'
import { Button } from '../components/ui'
import { useAuth } from '../lib/auth'
import { formatarDia } from '../lib/format'
import { usePortal } from '../lib/portal'

export function CertificadoPage() {
  const { trilhaId = '' } = useParams()
  const { user } = useAuth()
  const { certificados, trilhas } = usePortal()
  const certificado = certificados.find((item) => item.trilhaId === trilhaId && item.uid === user?.uid)
  const trilha = trilhas.find((item) => item.id === trilhaId)
  if (!certificado) {
    return (
      <p className="text-sm">
        O certificado ainda não foi emitido.{' '}
        <Link to={`/universidade/curso/${trilhaId}`} className="font-semibold text-brand">
          Voltar ao curso
        </Link>
      </p>
    )
  }
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4">
        <Button onClick={() => window.print()}>Imprimir certificado</Button>
      </div>
      <section className="certificado rounded-3xl border-4 border-double border-brand bg-white px-8 py-12 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-brand">Ubox Self Storage</p>
        <h1 className="mt-4 text-3xl font-extrabold">Certificado de conclusão</h1>
        <p className="mt-6 text-sm text-ink/60">Certificamos que</p>
        <p className="mt-2 text-2xl font-bold">{certificado.nome}</p>
        <p className="mt-6 text-sm text-ink/70">concluiu o curso</p>
        <p className="mt-2 text-xl font-semibold">{certificado.trilhaTitulo || trilha?.titulo}</p>
        <p className="mt-6 text-sm">em {formatarDia(certificado.emitidoEm)}</p>
        <p className="mt-8 text-xs tracking-wide text-ink/50">Código {certificado.codigo}</p>
        <p className="mt-2 text-xs text-ink/40">Portal do Franqueado · Franqueadora Ubox · Uberaba/MG</p>
      </section>
    </div>
  )
}
