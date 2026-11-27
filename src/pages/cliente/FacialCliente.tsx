import { useEffect, useRef, useState } from 'react'
import { Aviso, Button, Campo, Carregando, Selo, inputClass } from '../../components/ui'
import type { Cliente } from '../../lib/cliente'
import { arquivoFacialValido, assinarFoto, lerFacial, salvarFacial, STATUS_FACIAL, type Facial } from '../../lib/facialCliente'

export function FacialCliente({ cliente, origem }: { cliente: Pick<Cliente, 'id' | 'unidadeId'>; origem: 'cliente' | 'unidade' }) {
  const [facial, setFacial] = useState<Facial | null | undefined>(undefined)
  const [url, setUrl] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState('')
  const [consentiu, setConsentiu] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [revisao, setRevisao] = useState(0)
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    setFacial(undefined)
    setUrl('')
    setErro('')
    void lerFacial(cliente.id).then(async (foto) => {
      if (!vivo) return
      setFacial(foto)
      if (!foto) return
      const assinada = await assinarFoto(foto.foto_path)
      if (vivo) setUrl(assinada)
    }).catch(() => { if (vivo) setErro('Não foi possível abrir a foto. Tente carregar novamente.') })
    return () => { vivo = false }
  }, [cliente.id, revisao])

  useEffect(() => {
    if (!arquivo) { setPrevia(''); return }
    const objeto = URL.createObjectURL(arquivo)
    setPrevia(objeto)
    return () => URL.revokeObjectURL(objeto)
  }, [arquivo])

  function selecionar(foto: File | null) {
    setErro('')
    setConsentiu(false)
    if (foto && !arquivoFacialValido(foto)) {
      setArquivo(null)
      setErro('Selecione uma foto JPG ou PNG de até 5 MB.')
      if (entrada.current) entrada.current.value = ''
      return
    }
    setArquivo(foto)
  }

  async function salvar() {
    if (!arquivo || !consentiu || salvando) return
    setSalvando(true)
    setErro('')
    try {
      await salvarFacial(cliente, arquivo, facial?.foto_path, origem)
      setArquivo(null)
      setConsentiu(false)
      if (entrada.current) entrada.current.value = ''
      setRevisao((n) => n + 1)
    } catch {
      setErro('Não foi possível salvar a foto. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
    <h2 className="text-lg font-bold">{origem === 'cliente' ? 'Minha facial' : 'Facial do cliente'}</h2>
    {erro && <Aviso tom="erro">{erro}</Aviso>}
    {facial === undefined ? (erro ? <Button type="button" variant="secondary" onClick={() => setRevisao((n) => n + 1)}>Carregar novamente</Button> :
      <Carregando texto="Carregando a facial…" />) : <>
      {facial ? <div className="space-y-2">
        <Selo>{STATUS_FACIAL[facial.status]}</Selo>
        {url ? <img className="max-h-48 rounded-xl object-contain" src={url} alt="Foto facial cadastrada" onError={() => {
          setUrl('')
          setErro('Não foi possível abrir a foto.')
        }} /> : erro && <Button type="button" variant="secondary" onClick={() => setRevisao((n) => n + 1)}>Carregar novamente</Button>}
      </div> : <p className="text-sm text-ink-soft">Envie uma foto para cadastrar a facial.</p>}
      <Campo label={facial ? 'Substituir foto' : 'Escolher foto'} hint="JPG ou PNG, até 5 MB.">
        <input ref={entrada} className={inputClass} type="file" accept="image/jpeg,image/png"
          capture={origem === 'cliente' ? 'user' : undefined} disabled={salvando} onChange={(e) => selecionar(e.target.files?.[0] ?? null)} />
      </Campo>
      {arquivo && <>
        {previa && <img className="max-h-48 rounded-xl object-contain" src={previa} alt="Prévia da nova foto facial" />}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={consentiu} disabled={salvando} onChange={(e) => setConsentiu(e.target.checked)} />
          {origem === 'cliente'
            ? 'Autorizo a UBOX a usar esta foto e os dados biométricos dela para identificar meu acesso à unidade durante o contrato. Posso retirar meu consentimento com a unidade.'
            : 'Confirmo que o cliente autorizou a UBOX a usar esta foto e os dados biométricos dela para identificar seu acesso à unidade durante o contrato e foi informado de que pode retirar o consentimento.'}
        </label>
        <Button type="button" disabled={!consentiu || salvando} onClick={() => void salvar()}>{salvando ? 'Salvando…' : 'Salvar foto'}</Button>
      </>}
    </>}
  </section>
}
