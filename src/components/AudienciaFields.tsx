import type { Papel, Usuario } from '../types'
import { Campo, inputClass } from './ui'

export interface AudienciaForm {
  publico: boolean
  unidades: string[]
  papeis: Papel[]
  uidsExtra: string[]
}

export function AudienciaFields({
  valor,
  usuarios,
  onChange,
}: {
  valor: AudienciaForm
  usuarios: Usuario[]
  onChange: (valor: AudienciaForm) => void
}) {
  const unidades = [...new Set(usuarios.map((usuario) => usuario.unidade).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const ativos = usuarios.filter((usuario) => usuario.ativo && !usuario.recusado)
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-paper p-4">
      <p className="text-sm font-semibold">Quem pode ver</p>
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" className={valor.publico ? 'rounded-full bg-ink px-3 py-1 text-white' : 'rounded-full bg-white px-3 py-1'} onClick={() => onChange({ ...valor, publico: true })}>
          Todos os franqueados ativos
        </button>
        <button type="button" className={!valor.publico ? 'rounded-full bg-ink px-3 py-1 text-white' : 'rounded-full bg-white px-3 py-1'} onClick={() => onChange({ ...valor, publico: false })}>
          Restrito
        </button>
      </div>
      {valor.publico ? (
        <p className="text-xs text-ink/60">Novos franqueados aprovados passam a ver este item na hora.</p>
      ) : (
        <div className="space-y-3">
          <Campo label="Papéis">
            <div className="flex gap-3 text-sm">
              {(['franqueado', 'admin'] as Papel[]).map((papel) => (
                <label key={papel} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={valor.papeis.includes(papel)}
                    onChange={(evento) =>
                      onChange({
                        ...valor,
                        papeis: evento.target.checked ? [...valor.papeis, papel] : valor.papeis.filter((item) => item !== papel),
                      })
                    }
                  />
                  {papel === 'admin' ? 'Franqueadora' : 'Franqueados'}
                </label>
              ))}
            </div>
          </Campo>
          <Campo label="Unidades" hint="Uma unidade por linha. Também vale escolher das unidades já cadastradas.">
            <div className="mb-2 flex flex-wrap gap-2">
              {unidades.map((unidade) => {
                const marcada = valor.unidades.includes(unidade)
                return (
                  <button
                    type="button"
                    key={unidade}
                    className={marcada ? 'rounded-full bg-brand px-3 py-1 text-xs text-white' : 'rounded-full bg-white px-3 py-1 text-xs'}
                    onClick={() =>
                      onChange({
                        ...valor,
                        unidades: marcada ? valor.unidades.filter((item) => item !== unidade) : [...valor.unidades, unidade],
                      })
                    }
                  >
                    {unidade}
                  </button>
                )
              })}
            </div>
            <textarea
              className={inputClass}
              rows={2}
              value={valor.unidades.join('\n')}
              onChange={(evento) => onChange({ ...valor, unidades: evento.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })}
            />
          </Campo>
          <Campo label="Pessoas específicas">
            <select
              multiple
              className={inputClass}
              value={valor.uidsExtra}
              onChange={(evento) => onChange({ ...valor, uidsExtra: [...evento.target.selectedOptions].map((opcao) => opcao.value) })}
            >
              {ativos.map((usuario) => (
                <option key={usuario.uid} value={usuario.uid}>
                  {usuario.nome} · {usuario.unidade || usuario.cidade}
                </option>
              ))}
            </select>
          </Campo>
          <p className="text-xs text-ink/60">Depois de aprovar um franqueado novo, use “Atualizar permissões” para incluí-lo nos itens restritos.</p>
        </div>
      )}
    </div>
  )
}
