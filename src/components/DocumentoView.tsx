import type { Anexo, Documento } from '../types'
import { drivePreview, sanitizarHtml, youtubeEmbed } from '../lib/html'

export function DocumentoView({ documento }: { documento: Pick<Documento, 'formato' | 'conteudoHtml' | 'htmlConteudo' | 'htmlUrl' | 'titulo'> }) {
  if (documento.formato === 'html') {
    if (documento.htmlConteudo.trim()) {
      return (
        <iframe
          title={documento.titulo}
          sandbox="allow-scripts"
          srcDoc={documento.htmlConteudo}
          className="h-[75vh] w-full rounded-2xl border border-line bg-white"
        />
      )
    }
    if (documento.htmlUrl) {
      return (
        <iframe
          title={documento.titulo}
          sandbox="allow-scripts allow-forms allow-popups"
          src={documento.htmlUrl}
          className="h-[75vh] w-full rounded-2xl border border-line bg-white"
        />
      )
    }
  }
  return <article className="documento" dangerouslySetInnerHTML={{ __html: sanitizarHtml(documento.conteudoHtml) }} />
}

export function Anexos({ anexos }: { anexos: Anexo[] }) {
  if (!anexos.length) return null
  return (
    <section className="mt-8 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">Anexos</h2>
      {anexos.map((anexo) => {
        const video = youtubeEmbed(anexo.url)
        const drive = drivePreview(anexo.url)
        return (
          <article key={`${anexo.nome}-${anexo.url}`} className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="font-medium">{anexo.nome}</p>
              <a href={anexo.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand">
                Abrir
              </a>
            </div>
            {video ? <iframe title={anexo.nome} src={video} className="aspect-video w-full" allowFullScreen /> : null}
            {!video && drive ? <iframe title={anexo.nome} src={drive} className="h-80 w-full" /> : null}
          </article>
        )
      })}
    </section>
  )
}
