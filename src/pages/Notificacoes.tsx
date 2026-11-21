import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Button, Campo, Carregando, Vazio, inputClass } from '../components/ui'
import { formatarData } from '../lib/format'
import { usePortal } from '../lib/portal'

export function NotificacoesPage() {
  const { avisos, avisosLidos, marcarLido, carregando, erro, atualizar } = usePortal()
  const [filtro, setFiltro] = useState('todas')
  const [salvando, setSalvando] = useState(false)
  const marcacaoEmCurso = useRef(false)
  const [falhas, setFalhas] = useState<string[]>([])
  const lidos = new Set(avisosLidos)
  const falhasPendentes = falhas.filter((id) => !lidos.has(id) && avisos.some((aviso) => aviso.id === id))
  const naoLidos = avisos.filter((aviso) => !lidos.has(aviso.id))
  const lista = filtro === 'todas' ? avisos : filtro === 'nao-lidas' ? naoLidos : avisos.filter((aviso) => lidos.has(aviso.id))

  async function marcar(ids: string[]) {
    if (marcacaoEmCurso.current || !ids.length) return
    marcacaoEmCurso.current = true
    setSalvando(true)
    const idsComFalha: string[] = []
    for (const id of ids) {
      try {
        await marcarLido(id)
      } catch {
        idsComFalha.push(id)
      }
    }
    setFalhas((anteriores) => [...anteriores.filter((id) => !ids.includes(id)), ...idsComFalha])
    marcacaoEmCurso.current = false
    setSalvando(false)
  }
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-extrabold">Notificações</h1>
      <div className="flex flex-wrap items-end gap-3">
        <Campo label="Filtrar notificações">
          <select className={inputClass} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="todas">Todas</option>
            <option value="nao-lidas">Não lidas</option>
            <option value="lidas">Lidas</option>
          </select>
        </Campo>
        <Button variant="secondary" disabled={carregando || salvando || !naoLidos.length} onClick={() => void marcar(naoLidos.map((a) => a.id))}>
          {salvando ? 'Marcando…' : 'Marcar todas como lidas'}
        </Button>
      </div>
      {carregando ? <Carregando /> : null}
      {erro ? <Aviso tom="erro"><span role="alert">{erro}</span> <Button variant="ghost" onClick={() => void atualizar()}>Tentar novamente</Button></Aviso> : null}
      {falhasPendentes.length ? <Aviso tom="erro">
        <span role="alert">Não foi possível marcar {falhasPendentes.length} aviso(s) como lido(s).</span>{' '}
        <Button variant="ghost" disabled={salvando || carregando} onClick={() => void marcar(falhasPendentes)}>Tentar novamente</Button>
      </Aviso> : null}
      {!carregando && !erro && !avisos.length ? <Vazio titulo="Nenhuma novidade" texto="Avisos de documentos novos ou atualizados aparecem aqui." /> : null}
      {!carregando && !erro && avisos.length > 0 && !lista.length ? (
        <Vazio titulo={filtro === 'nao-lidas' ? 'Nenhum aviso não lido' : 'Nenhum aviso lido'} texto="Selecione Todas para ver os avisos." />
      ) : null}
      <ul className="space-y-3">
        {lista.map((aviso) => {
          const lido = avisosLidos.includes(aviso.id)
          return (
            <li key={aviso.id} className={`rounded-2xl border bg-white p-4 ${lido ? 'border-line' : 'border-brand/40'}`}>
              <p className="font-semibold">{aviso.titulo}</p>
              <p className="mt-1 text-sm text-ink/70">{aviso.mensagem}</p>
              <p className="mt-2 text-xs text-ink/45">{formatarData(aviso.criadoEm)}</p>
              <div className="mt-3 flex gap-3 text-sm">
                {aviso.documentoId ? (
                  <Link to={`/documento/${aviso.documentoId}`} className="font-semibold text-brand" onClick={() => { if (!lido && !salvando) void marcar([aviso.id]) }}>
                    Abrir documento
                  </Link>
                ) : null}
                {!lido ? (
                  <button className="font-semibold" disabled={salvando} onClick={() => void marcar([aviso.id])}>
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
