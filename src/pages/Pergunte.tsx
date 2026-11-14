import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Aviso, Button, inputClass } from '../components/ui'
import { fontesDaPergunta, perguntarAoPortal, type FonteResposta } from '../lib/ai'
import { aiHabilitado } from '../firebaseConfig'
import { mensagemErro } from '../lib/errors'
import { usePortal } from '../lib/portal'

interface Mensagem {
  papel: 'usuario' | 'portal'
  texto: string
  fontes?: FonteResposta[]
}

export function PerguntePage() {
  const { documentos, carregando } = usePortal()
  const publicados = documentos.filter((documento) => documento.status === 'publicado')
  const [params] = useSearchParams()
  const [pergunta, setPergunta] = useState(params.get('q') ?? '')
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [disparo, setDisparo] = useState(params.get('q') ?? '')
  const ligado = aiHabilitado()

  async function responder(texto: string) {
    setMensagens((atual) => [...atual, { papel: 'usuario', texto }])
    setOcupado(true)
    setErro('')
    try {
      const resposta = await perguntarAoPortal(texto, publicados)
      setMensagens((atual) => [...atual, { papel: 'portal', texto: resposta.texto, fontes: resposta.fontes }])
    } catch (falha) {
      const fontes = fontesDaPergunta(texto, publicados)
      setErro(mensagemErro(falha))
      setMensagens((atual) => [
        ...atual,
        {
          papel: 'portal',
          texto: 'A IA não respondeu agora. Os trechos abaixo são a busca do próprio portal.',
          fontes,
        },
      ])
    } finally {
      setOcupado(false)
    }
  }

  useEffect(() => {
    const inicial = disparo.trim()
    if (carregando || !inicial) return
    setDisparo('')
    setPergunta('')
    void responder(inicial)
    // Dispara a pergunta da home quando a biblioteca termina de carregar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando])

  async function enviar() {
    const texto = pergunta.trim()
    if (!texto) return
    setPergunta('')
    await responder(texto)
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col">
      <h1 className="text-3xl font-extrabold">Pergunte ao Portal</h1>
      <p className="mt-2 text-sm text-ink/65">
        Respostas a partir dos documentos que você pode ler, com a fonte ao lado.
        {ligado ? ' A IA do Firebase está ligada.' : ' A IA está desligada; a busca por palavras continua disponível.'}
      </p>
      <div className="mt-6 flex-1 space-y-4">
        {!mensagens.length ? (
          <div className="rounded-3xl border border-dashed border-line bg-white p-6 text-sm text-ink/60">
            Exemplos: “Qual o horário de abertura da unidade matriz?” · “O que registrar no fechamento?”
          </div>
        ) : null}
        {mensagens.map((mensagem, indice) => (
          <article key={indice} className={mensagem.papel === 'usuario' ? 'ml-8 rounded-2xl bg-ink px-4 py-3 text-white' : 'mr-8 rounded-2xl border border-line bg-white px-4 py-3'}>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{mensagem.texto}</p>
            {mensagem.fontes?.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {mensagem.fontes.map((fonte) => (
                  <li key={fonte.id}>
                    <Link to={`/documento/${fonte.id}`} className="inline-block rounded-full bg-paper px-3 py-1 text-xs font-semibold text-ink">
                      {fonte.titulo}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      </div>
      <form
        className="sticky bottom-20 mt-4 flex gap-2 lg:bottom-0"
        onSubmit={(evento) => {
          evento.preventDefault()
          void enviar()
        }}
      >
        <input className={inputClass} value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Pergunte sobre um POP ou uma política" />
        <Button type="submit" disabled={ocupado}>
          {ocupado ? '…' : 'Perguntar'}
        </Button>
      </form>
    </div>
  )
}
