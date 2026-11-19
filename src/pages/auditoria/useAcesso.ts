import { useAuth } from '../../lib/auth'
import { podeGerirAuditoria } from '../../lib/auditoria'
import { useVisao } from '../../lib/visao'

/** Auditor da franqueadora (admin ou equipe com o módulo), fora da simulação de unidade. */
export function useGestaoAuditoriaAcesso() {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado } = useVisao()
  return { gestor: podeGerirAuditoria(user, ehAdmin) && !comoFranqueado, ehAdmin }
}
