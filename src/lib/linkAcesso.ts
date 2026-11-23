export function formatarValidadeLink(expiraEm: string): string {
  const data = new Date(expiraEm)
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dia = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `Válido até ${hora} de ${dia}`
}
