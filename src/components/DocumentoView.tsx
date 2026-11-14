import { useEffect, useState } from 'react'
import type { Anexo, Documento } from '../types'
import { drivePreview, sanitizarHtml, youtubeEmbed } from '../lib/html'

const medidor = `<script>
function uboxAltura(){
  var altura = Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement.scrollHeight || 0);
  parent.postMessage({ tipo: 'ubox-altura', altura: altura }, '*');
}
window.addEventListener('load', uboxAltura);
window.addEventListener('resize', uboxAltura);
setTimeout(uboxAltura, 400);
setTimeout(uboxAltura, 1500);
</script>`

export function ManualInterativo({ titulo, html, url }: { titulo: string; html?: string; url?: string }) {
  const [altura, setAltura] = useState(900)
  useEffect(() => {
    const aoMensagem = (evento: MessageEvent) => {
      const dados = evento.data as { tipo?: string; altura?: number }
      if (dados?.tipo === 'ubox-altura' && typeof dados.altura === 'number' && dados.altura > 200) {
        setAltura(Math.min(dados.altura + 32, 20000))
      }
    }
    window.addEventListener('message', aoMensagem)
    return () => window.removeEventListener('message', aoMensagem)
  }, [])
  const srcDoc = html?.trim() ? `${medidor}${html}` : undefined
  return (
    <iframe
      title={titulo}
      sandbox={srcDoc ? 'allow-scripts' : 'allow-scripts allow-forms allow-popups'}
      srcDoc={srcDoc}
      src={srcDoc ? undefined : url}
      style={{ height: altura }}
      className="w-full rounded-2xl border border-line bg-white"
    />
  )
}

export function DocumentoView({ documento }: { documento: Pick<Documento, 'formato' | 'conteudoHtml' | 'htmlConteudo' | 'htmlUrl' | 'titulo'> }) {
  if (documento.formato === 'html') {
    const html = documento.htmlConteudo.trim() || documento.conteudoHtml.trim()
    if (html || documento.htmlUrl) return <ManualInterativo titulo={documento.titulo} html={html} url={documento.htmlUrl} />
  }
  return <article className="documento max-w-none" dangerouslySetInnerHTML={{ __html: sanitizarHtml(documento.conteudoHtml) }} />
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
