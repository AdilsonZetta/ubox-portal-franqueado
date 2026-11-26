import { useEffect, useState } from 'react'

export async function fontePainel<T>(carregar: () => Promise<T>): Promise<T | null> {
  try {
    return await carregar()
  } catch {
    return null
  }
}

export function useDadosPainel<T extends object>(carregar: () => Promise<T>) {
  const [tentativa, setTentativa] = useState(0)
  const [carga, setCarga] = useState<{ carregar: typeof carregar; tentativa: number; dados: T }>()
  useEffect(() => {
    let ativo = true
    void carregar().then((dados) => {
      if (ativo) setCarga({ carregar, tentativa, dados })
    })
    return () => { ativo = false }
  }, [carregar, tentativa])

  return {
    dados: carga?.carregar === carregar && carga.tentativa === tentativa ? carga.dados : null,
    recarregar: () => setTentativa((t) => t + 1),
  }
}
