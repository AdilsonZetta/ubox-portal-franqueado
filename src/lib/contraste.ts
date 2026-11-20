function luminancia(hex: string): number {
  const canais = [1, 3, 5].map((inicio) => {
    const srgb = Number.parseInt(hex.slice(inicio, inicio + 2), 16) / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2]
}

/** Calcula a razão de contraste WCAG entre duas cores opacas no formato #RRGGBB. */
export function razaoContraste(primeira: string, segunda: string): number {
  const a = luminancia(primeira)
  const b = luminancia(segunda)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
