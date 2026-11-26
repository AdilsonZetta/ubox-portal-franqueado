import { SeletorUnidadeSimulada } from '../../components/SeletorUnidadeSimulada'

export function EscolhaUnidade() {
  return (
    <section className="mt-6 max-w-xl space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6" aria-labelledby="escolha-unidade-titulo">
      <h2 id="escolha-unidade-titulo" className="text-lg font-bold">Escolha a unidade para ver o portal como ela vê</h2>
      <SeletorUnidadeSimulada />
    </section>
  )
}
