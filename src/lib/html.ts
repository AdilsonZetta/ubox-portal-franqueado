import DOMPurify from 'dompurify'

const ORIGENS_VIDEO = ['https://www.youtube.com/embed/', 'https://www.youtube-nocookie.com/embed/', 'https://player.vimeo.com/video/']

let gancho = false

function preparar() {
  if (gancho || typeof window === 'undefined') return
  gancho = true
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName !== 'IFRAME') return
    const elemento = node as Element
    const src = elemento.getAttribute('src') ?? ''
    if (!ORIGENS_VIDEO.some((origem) => src.startsWith(origem))) elemento.remove()
  })
}

export function sanitizarHtml(html: string): string {
  preparar()
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'target', 'rel'],
  })
}

export function youtubeEmbed(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/)
  return match ? `https://www.youtube.com/embed/${match[1]}` : null
}

export function drivePreview(url: string): string | null {
  const arquivo = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
  if (arquivo) return `https://drive.google.com/file/d/${arquivo[1]}/preview`
  if (url.includes('drive.google.com') && url.includes('/preview')) return url
  return null
}
