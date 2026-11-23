import { useEffect, useRef, useState } from 'react'
import { enviarEmailRedefinicao } from '../lib/gestao'
import type { ContaCriadaSb } from '../lib/gestaoSupabase'
import { formatarValidadeLink } from '../lib/linkAcesso'
import { Aviso, Button, Campo, inputClass } from './ui'

export type AcessoPorLink = ContaCriadaSb & { email: string }

export function LinkCriado({ acesso, aoFechar, ocupado = false }: {
  acesso: AcessoPorLink
  aoFechar: () => void
  ocupado?: boolean
}) {
  const campo = useRef<HTMLInputElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const enviando = useRef(false)
  const [enviandoEmail, setEnviandoEmail] = useState(false)
  const [emailEnviado, setEmailEnviado] = useState(false)
  const [aviso, setAviso] = useState('')
  const { link, expiraEm, email } = acesso
  const linkDisponivel = link && !emailEnviado

  useEffect(() => {
    titulo.current?.focus()
  }, [])

  async function copiar() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setAviso('Link copiado')
    } catch {
      campo.current?.focus()
      campo.current?.select()
      setAviso('Link selecionado. Copie o texto manualmente.')
    }
  }

  async function enviarEmail() {
    if (enviando.current) return
    enviando.current = true
    setEnviandoEmail(true)
    setAviso('')
    try {
      await enviarEmailRedefinicao(email)
      setEmailEnviado(true)
      setAviso('E-mail de redefinição enviado. O link anterior foi cancelado.')
    } catch {
      setAviso('Não foi possível enviar o e-mail. Tente novamente.')
    } finally {
      enviando.current = false
      setEnviandoEmail(false)
    }
  }

  return (
    <Aviso tom={link ? 'ok' : 'info'}>
      <div className="space-y-3">
        <h2 ref={titulo} tabIndex={-1} className="font-semibold">
          {link ? 'Link de senha para' : 'Conta criada para'} <strong className="break-all">{email}</strong>
        </h2>
        {linkDisponivel && expiraEm && <>
          <div className="grid min-w-0 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Campo label="Link para criar a senha">
              <input ref={campo} className={inputClass} name="link-senha" readOnly value={link} spellCheck={false} />
            </Campo>
            <Button type="button" variant="secondary" disabled={ocupado || enviandoEmail} onClick={() => void copiar()}>Copiar link</Button>
          </div>
          <p className="font-medium"><time dateTime={expiraEm}>{formatarValidadeLink(expiraEm)}</time></p>
          <p>Envie só para essa pessoa. Quem abrir o link cria a senha. Gerar um novo link cancela o anterior.</p>
        </>}
        {acesso.link === null && <p role="alert">{acesso.erroLink} Use “Gerar novo link” na lista de usuários.</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={ocupado || enviandoEmail || emailEnviado} onClick={() => void enviarEmail()}>
            {enviandoEmail ? 'Enviando…' : 'Enviar e-mail de redefinição'}
          </Button>
          <Button type="button" variant="ghost" onClick={aoFechar}>Fechar</Button>
        </div>
        <p role="status" className={aviso ? undefined : 'sr-only'}>{aviso}</p>
      </div>
    </Aviso>
  )
}
