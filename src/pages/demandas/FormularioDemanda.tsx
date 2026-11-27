import { useRef, useState } from 'react'
import { Aviso, Button, Campo, inputClass } from '../../components/ui'
import { AREAS, type Area } from '../../data/areas'
import { PRIORIDADES_DEMANDA, type DadosDemanda, type Demanda, type PrioridadeDemanda } from '../../lib/demandas'
import { salvarDemanda, type PessoaRede } from '../../lib/demandasSupabase'
import { mensagemErro } from '../../lib/errors'
import { acaoDemandaClass, EstadoConsulta, PainelDemanda, type ConsultaDemandas } from './partes'

const nova: DadosDemanda = { titulo: '', descricao: '', area: null, prioridade: 'media', prazo: null, anexos: [], responsaveis: [] }

export function FormularioDemanda({ demanda, pessoas, fechar, aoSalvar }: {
  demanda?: Demanda; pessoas: ConsultaDemandas<PessoaRede[]>; fechar: () => void; aoSalvar: (id: string) => void
}) {
  const [dados, setDados] = useState<DadosDemanda>(demanda ?? nova)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const emCurso = useRef(false)
  const indisponiveis = pessoas.dados
    ? dados.responsaveis.filter((id) => !pessoas.dados?.some((pessoa) => pessoa.id === id))
    : []

  function alterar<K extends keyof DadosDemanda>(campo: K, valor: DadosDemanda[K]) {
    setDados((anterior) => ({ ...anterior, [campo]: valor }))
  }

  function alterarAnexo(indice: number, campo: 'nome' | 'url', valor: string) {
    alterar('anexos', dados.anexos.map((anexo, i) => i === indice ? { ...anexo, [campo]: valor } : anexo))
  }

  return (
    <PainelDemanda titulo={demanda ? 'Editar demanda' : 'Nova demanda'} fechar={fechar} ocupado={ocupado}>
      <form autoComplete="off" onSubmit={async (e) => {
        e.preventDefault()
        if (emCurso.current) return
        if (dados.titulo.trim().length < 2) {
          setErro('Informe um título com pelo menos 2 caracteres.')
          return
        }
        if (!dados.area && !dados.responsaveis.length) {
          setErro('Escolha uma área ou pelo menos uma pessoa responsável.')
          return
        }
        const anexos = dados.anexos.map(({ nome, url }) => ({ nome: nome.trim(), url: url.trim() }))
        if (anexos.some(({ nome, url }) => !nome || !/^https:\/\/[^\s]+$/.test(url))) {
          setErro('Preencha o nome e um endereço HTTPS para cada link.')
          return
        }
        emCurso.current = true
        setOcupado(true)
        setErro('')
        try {
          const id = await salvarDemanda({ ...dados, anexos }, demanda?.id)
          aoSalvar(demanda?.id ?? String(id))
        } catch (falha) {
          setErro(mensagemErro(falha))
        } finally {
          emCurso.current = false
          setOcupado(false)
        }
      }}>
        <fieldset disabled={ocupado} className="space-y-4">
          <Campo label="Título"><input name="titulo" className={inputClass} value={dados.titulo} required minLength={2} maxLength={140}
            onChange={(e) => alterar('titulo', e.target.value)} /></Campo>
          <Campo label="Descrição"><textarea name="descricao" className={inputClass} value={dados.descricao} rows={4} maxLength={6000}
            onChange={(e) => alterar('descricao', e.target.value)} /></Campo>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Área">
              <select name="area" className={inputClass} value={dados.area ?? ''} onChange={(e) => alterar('area', (e.target.value || null) as Area | null)}>
                <option value="">Sem área</option>
                {Object.entries(AREAS).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
              </select>
            </Campo>
            <Campo label="Prioridade">
              <select name="prioridade" className={inputClass} value={dados.prioridade} onChange={(e) => alterar('prioridade', e.target.value as PrioridadeDemanda)}>
                {Object.entries(PRIORIDADES_DEMANDA).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
              </select>
            </Campo>
            <Campo label="Prazo"><input name="prazo" className={inputClass} type="date" value={dados.prazo ?? ''}
              onChange={(e) => alterar('prazo', e.target.value || null)} /></Campo>
          </div>

          <fieldset className="space-y-2 rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-bold">Pessoas responsáveis</legend>
            <p className="text-sm text-muted">Escolha pelo menos uma pessoa ou vincule a demanda a uma área.</p>
            {pessoas.erro || !pessoas.dados ? (
              <EstadoConsulta {...pessoas} texto="Carregando pessoas…" falha="Não foi possível carregar as pessoas da franqueadora." />
            ) : pessoas.dados.length === 0 ? <p className="text-sm text-muted">Nenhuma pessoa ativa. Escolha uma área para continuar.</p> : (
              <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
                {pessoas.dados.map((pessoa) => (
                  <label key={pessoa.id} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-paper">
                    <input type="checkbox" name="responsaveis" value={pessoa.id} checked={dados.responsaveis.includes(pessoa.id)}
                      onChange={(e) => alterar('responsaveis', e.target.checked
                        ? [...dados.responsaveis, pessoa.id] : dados.responsaveis.filter((id) => id !== pessoa.id))} />
                    <span className="min-w-0 wrap-anywhere">{pessoa.nome}<span className="block text-xs text-muted">{pessoa.area ? AREAS[pessoa.area] : 'Sem área'}</span></span>
                  </label>
                ))}
              </div>
            )}
            {indisponiveis.length ? (
              <Aviso>Há pessoas responsáveis que já não estão ativas.
                <Button type="button" variant="ghost" onClick={() => alterar('responsaveis', dados.responsaveis.filter((id) => !indisponiveis.includes(id)))}>
                  Remover pessoas indisponíveis
                </Button>
              </Aviso>
            ) : null}
          </fieldset>

          <fieldset className="space-y-3 rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-bold">Links e anexos</legend>
            <p className="text-sm text-muted">Adicione até 8 links HTTPS.</p>
            {dados.anexos.map((anexo, indice) => (
              <div key={indice} className="grid items-end gap-2 rounded-lg bg-paper p-2 sm:grid-cols-[1fr_1fr_auto]">
                <Campo label={`Nome do link ${indice + 1}`}><input name={`nome-link-${indice}`} className={inputClass} required maxLength={80}
                  value={anexo.nome} onChange={(e) => alterarAnexo(indice, 'nome', e.target.value)} /></Campo>
                <Campo label={`URL do link ${indice + 1}`}><input name={`url-link-${indice}`} className={inputClass} type="url" required
                  maxLength={500} value={anexo.url} onChange={(e) => alterarAnexo(indice, 'url', e.target.value)} /></Campo>
                <Button type="button" variant="ghost" aria-label={`Remover link ${indice + 1}`}
                  onClick={() => alterar('anexos', dados.anexos.filter((_, i) => i !== indice))}>Remover</Button>
              </div>
            ))}
            <Button type="button" variant="secondary" disabled={dados.anexos.length >= 8}
              onClick={() => alterar('anexos', [...dados.anexos, { nome: '', url: '' }])}>Adicionar link</Button>
          </fieldset>
          {erro ? <Aviso tom="erro"><span role="alert">{erro}</span></Aviso> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={fechar}>Cancelar</Button>
            <Button type="submit" className={acaoDemandaClass} disabled={Boolean(indisponiveis.length)}>
              {ocupado ? 'Salvando…' : demanda ? 'Salvar alterações' : 'Criar demanda'}
            </Button>
          </div>
        </fieldset>
      </form>
    </PainelDemanda>
  )
}
