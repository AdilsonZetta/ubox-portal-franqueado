import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Youtube from '@tiptap/extension-youtube'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect } from 'react'
import { cx } from './ui'

export function RichEditor({ value, onChange }: { value: string; onChange: (html: string, texto: string) => void }) {
  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Image.configure({ allowBase64: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Youtube.configure({ nocookie: true, width: 640, height: 360 }),
      Placeholder.configure({ placeholder: 'Escreva o procedimento, a política ou o manual…' }),
    ],
    content: value || '<p></p>',
    onUpdate: ({ editor: instancia }) => onChange(instancia.getHTML(), instancia.getText()),
  })

  useEffect(() => {
    if (!editor) return
    if (value !== editor.getHTML()) editor.commands.setContent(value || '<p></p>', { emitUpdate: false })
  }, [editor, value])

  if (!editor) return null

  const acao = (rotulo: string, ativo: boolean, comando: () => void) => (
    <button
      type="button"
      onClick={comando}
      className={cx('rounded-lg px-2 py-1 text-xs font-semibold', ativo ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-paper')}
    >
      {rotulo}
    </button>
  )

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex gap-1 overflow-x-auto border-b border-line bg-paper p-2">
        {acao('H2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
        {acao('H3', editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
        {acao('Negrito', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run())}
        {acao('Itálico', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run())}
        {acao('Lista', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run())}
        {acao('Passos', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run())}
        {acao('Checklist', editor.isActive('taskList'), () => editor.chain().focus().toggleTaskList().run())}
        {acao('Tabela', false, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
        {acao('Imagem', false, () => {
          const url = window.prompt('URL da imagem (https://)')
          if (url) editor.chain().focus().setImage({ src: url }).run()
        })}
        {acao('Vídeo', false, () => {
          const url = window.prompt('URL do YouTube')
          if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run()
        })}
        {acao('Link', editor.isActive('link'), () => {
          const url = window.prompt('URL do link')
          if (url === null) return
          if (!url) editor.chain().focus().unsetLink().run()
          else editor.chain().focus().setLink({ href: url }).run()
        })}
      </div>
      <EditorContent editor={editor} className="editor-conteudo px-4 py-3" />
    </div>
  )
}
