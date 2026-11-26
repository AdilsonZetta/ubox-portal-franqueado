import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Button, Carregando, Selo, Vazio } from '../components/ui'
import { formatarDia } from '../lib/format'
import { useCompromissos } from '../lib/useCompromissos'
import type { Usuario } from '../types'

const LIMITE = 6
const ROTULOS = {
  atrasado: 'Atrasado',
  em_dia: 'Em dia',
  aguardando_validacao: 'Aguardando validação da rede',
}

export function CompromissosUnidade({ pessoa }: { pessoa: Usuario | null | undefined }) {
  const { habilitado, carregando, itens, falhas, recarregar } = useCompromissos(pessoa)
  const [verTodos, setVerTodos] = useState(false)
  if (!habilitado) return null

  const visiveis = verTodos ? itens : itens.slice(0, LIMITE)

  return (
    <section className="mt-6 space-y-3" aria-labelledby="compromissos-titulo">
      <h2 id="compromissos-titulo" className="text-lg font-bold">Compromissos da unidade</h2>
      {pessoa?.papel === 'equipe_franqueado' && itens.length > 0 ? (
        <p className="text-sm text-ink-soft">Somente o franqueado pode concluir os compromissos.</p>
      ) : null}
      <div className="space-y-3" aria-live="polite">
        {carregando ? <Carregando texto="Consultando compromissos…" /> : null}
        {falhas.length ? (
          <Aviso tom="erro">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>Consulta indisponível para {falhas.join(' e ').toLocaleLowerCase('pt-BR')}.</p>
              <Button type="button" variant="secondary" onClick={recarregar} disabled={carregando}>Tentar novamente</Button>
            </div>
          </Aviso>
        ) : null}
        {!carregando && !falhas.length && !itens.length ? (
          <Vazio titulo="Nenhum compromisso em aberto" texto="Novas ações de auditoria e combinados compartilhados com a unidade aparecerão aqui." />
        ) : null}
      </div>
      {visiveis.length ? (
        <ul id="lista-compromissos" className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {visiveis.map((item) => (
            <li key={item.chave} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4">
              <div className="min-w-0 flex-1 basis-64 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-ink-soft">{item.tipo === 'auditoria' ? 'Ação de auditoria' : 'Combinado'}</span>
                  <Selo tom={item.situacao === 'atrasado' ? 'alerta' : 'neutro'}>{ROTULOS[item.situacao]}</Selo>
                </div>
                <p className="font-semibold wrap-anywhere">{item.descricao}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                  <span>Prazo {formatarDia(item.prazoMs, 'short')}</span>
                  <span className="min-w-0 wrap-anywhere">Responsável {item.responsavel}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link to={item.para} className="inline-flex min-h-11 items-center rounded-[10px] px-3 text-sm font-semibold hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-brand">Abrir registro</Link>
                {item.podeConcluir ? (
                  <Link to={item.para} className="inline-flex min-h-11 items-center rounded-[10px] border border-line-control px-4 text-sm font-semibold hover:border-brand focus-visible:outline-2 focus-visible:outline-brand">Concluir</Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {itens.length > LIMITE ? (
        <Button type="button" variant="secondary" aria-expanded={verTodos} aria-controls="lista-compromissos" onClick={() => setVerTodos((valor) => !valor)}>
          {verTodos ? 'Ver menos' : 'Ver todos'}
        </Button>
      ) : null}
    </section>
  )
}
