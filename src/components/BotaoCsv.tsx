import { exportarCsv } from '../lib/csv'
import { Button } from './ui'

type DadosCsv = Parameters<typeof exportarCsv>

export function BotaoCsv({ arquivo, cabecalhos, linhas }: { arquivo: DadosCsv[0]; cabecalhos: DadosCsv[1]; linhas: DadosCsv[2] }) {
  return (
    <Button type="button" variant="secondary" disabled={!linhas.length} onClick={() => exportarCsv(arquivo, cabecalhos, linhas)}>
      Exportar CSV
    </Button>
  )
}
