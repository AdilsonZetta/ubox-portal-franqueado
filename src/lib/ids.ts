export function idLeitura(uid: string, documentoId: string, versao: number): string {
  return `${uid}_${documentoId}_v${versao}`
}

export function idCertificado(uid: string, trilhaId: string): string {
  return `${uid}_${trilhaId}`
}

export function idAvisoLeitura(uid: string, avisoId: string): string {
  return `${uid}_${avisoId}`
}
