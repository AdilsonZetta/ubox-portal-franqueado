import { describe, expect, it } from 'vitest'
import fonte from '../data/modulos.ts?raw'
import { SLUGS_FRANQUEADO } from '../data/modulos'
import { modulosDaMigracao, slugsFranqueadoDaFonte } from './migrarModulos'

describe('migração de módulos legados', () => {
  it('lê o catálogo atual do franqueado', () => {
    expect(slugsFranqueadoDaFonte(fonte)).toEqual(SLUGS_FRANQUEADO)
  })

  it('grava a lista só no franqueado ativo sem o campo', () => {
    expect(modulosDaMigracao({ papel: 'franqueado', ativo: true }, SLUGS_FRANQUEADO)).toEqual(SLUGS_FRANQUEADO)
    expect(modulosDaMigracao({ papel: 'franqueado', ativo: true, modulosLiberados: [] }, SLUGS_FRANQUEADO)).toBeNull()
    expect(modulosDaMigracao({ papel: 'franqueado', ativo: true, modulosLiberados: ['manuais'] }, SLUGS_FRANQUEADO)).toBeNull()
    expect(modulosDaMigracao({ papel: 'franqueado', ativo: false }, SLUGS_FRANQUEADO)).toBeNull()
    expect(modulosDaMigracao({ papel: 'equipe_franqueado', ativo: true }, SLUGS_FRANQUEADO)).toBeNull()
    expect(modulosDaMigracao({ papel: 'admin', ativo: true }, SLUGS_FRANQUEADO)).toBeNull()
  })
})
