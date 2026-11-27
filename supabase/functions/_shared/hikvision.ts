type Resultado = { ok: true } | { ok: false; erro: string }

export interface HikvisionAdapter {
  testarConexao: () => Promise<Resultado>
  cadastrarFacial: (clienteId: string) => Promise<Resultado>
  bloquear: (clienteId: string) => Promise<Resultado>
  liberar: (clienteId: string) => Promise<Resultado>
}

const indisponivel = async (): Promise<Resultado> => ({
  ok: false, erro: 'Integração do terminal ainda não conectada.',
})

export const hikvision: HikvisionAdapter = {
  testarConexao: async () => ({ ok: false, erro: 'Aparelho ainda não conectado' }),
  cadastrarFacial: indisponivel,
  bloquear: indisponivel,
  liberar: indisponivel,
}
