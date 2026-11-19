import { useEffect, useRef, type RefObject } from 'react'

const FOCAVEIS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Elementos focáveis dentro do container, na ordem do documento. */
export function elementosFocaveis(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
    (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true',
  )
}

/**
 * Decide para onde o foco vai quando a pessoa aperta Tab dentro do diálogo.
 * Retorna o elemento que deve receber o foco, ou null quando o navegador pode seguir sozinho.
 */
export function proximoFoco(
  focaveis: HTMLElement[],
  ativo: Element | null,
  voltando: boolean,
): HTMLElement | null {
  if (!focaveis.length) return null
  const primeiro = focaveis[0]
  const ultimo = focaveis[focaveis.length - 1]
  const dentro = ativo ? focaveis.includes(ativo as HTMLElement) : false
  if (!dentro) return voltando ? ultimo : primeiro
  if (voltando && ativo === primeiro) return ultimo
  if (!voltando && ativo === ultimo) return primeiro
  return null
}

/**
 * Prende o foco do teclado dentro do diálogo enquanto ele está aberto e devolve o foco
 * para quem abriu quando ele fecha. O Esc continua sendo tratado por cada modal.
 */
export function useFocusTrap<T extends HTMLElement>(ativo: boolean): RefObject<T | null> {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    if (!ativo) return
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const container = ref.current
    if (container && !container.contains(document.activeElement)) {
      const [primeiro] = elementosFocaveis(container)
      window.setTimeout(() => {
        if (!container.contains(document.activeElement)) (primeiro ?? container).focus()
      }, 0)
    }
    function aoTecla(evento: KeyboardEvent) {
      if (evento.key !== 'Tab' || !ref.current) return
      const alvo = proximoFoco(elementosFocaveis(ref.current), document.activeElement, evento.shiftKey)
      if (alvo) {
        evento.preventDefault()
        alvo.focus()
      }
    }
    document.addEventListener('keydown', aoTecla)
    return () => {
      document.removeEventListener('keydown', aoTecla)
      if (anterior && document.contains(anterior)) anterior.focus()
    }
  }, [ativo])
  return ref
}
