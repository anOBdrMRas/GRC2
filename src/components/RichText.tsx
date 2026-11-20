// Rich text editor for work instructions: headings, lists, tables, images (embedded), links.
import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extensions';
import { t } from '../i18n';
import { useUi } from '../ui';

/** Images are embedded in the text (browser storage): large photos are scaled down first. */
const MAX_SIDE = 1400;

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const src = String(reader.result);
      // vector graphics and small images stay as they are
      if (file.type === 'image/svg+xml' || file.size < 200_000) return resolve(src);
      const img = new window.Image();
      img.onerror = () => resolve(src);
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

const extensions = (placeholder: string, resizable = true) => [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
  Image.configure({
    allowBase64: true,
    resize: resizable ? { enabled: true, minWidth: 60, minHeight: 40, alwaysPreserveAspectRatio: true } : false,
  }),
  TableKit.configure({ table: { resizable } }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight,
  Placeholder.configure({ placeholder }),
];

async function insertImages(editor: Editor, files: File[], pos?: number) {
  const images = files.filter((f) => f.type.startsWith('image/'));
  for (const f of images) {
    try {
      const src = await readImage(f);
      const chain = editor.chain().focus();
      (pos !== undefined ? chain.insertContentAt(pos, { type: 'image', attrs: { src, alt: f.name } }) : chain.setImage({ src, alt: f.name })).run();
    } catch {
      useUi.getState().setNotice(t('Das Bild konnte nicht gelesen werden.'));
    }
  }
  return images.length > 0;
}

/** Editable rich text. `onChange` receives HTML. */
export function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const editor = useEditor({
    extensions: extensions(t('Arbeitsanweisung hier schreiben … Bilder per Einfügen, Ziehen oder über die Symbolleiste.')),
    content: value || '',
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
    editorProps: {
      attributes: { class: 'rt-content', 'aria-label': t('Inhalt der Arbeitsanweisung') },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])];
        if (!files.some((f) => f.type.startsWith('image/')) || !editorRef.current) return false;
        void insertImages(editorRef.current, files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (!files.some((f) => f.type.startsWith('image/')) || !editorRef.current) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImages(editorRef.current, files, pos);
        return true;
      },
    },
  });
  editorRef.current = editor;
  if (!editor) return null;
  return (
    <div className="rt-editor">
      <Toolbar editor={editor} onImage={() => fileInput.current?.click()} />
      <EditorContent editor={editor} />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void insertImages(editor, files);
        }}
      />
    </div>
  );
}

/** Read view: the same document model, not editable (unknown markup is dropped by the editor schema). */
export function RichTextView({ value }: { value: string }) {
  const editor = useEditor({ extensions: extensions('', false), content: value || '', editable: false, editorProps: { attributes: { class: 'rt-content' } } });
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value || '', { emitUpdate: false });
  }, [editor, value]);
  if (!value) return <span className="muted">–</span>;
  return (
    <div className="rt-view">
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 1 })
        ? 'h1'
        : e.isActive('heading', { level: 2 })
          ? 'h2'
          : e.isActive('heading', { level: 3 })
            ? 'h3'
            : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      left: e.isActive({ textAlign: 'left' }),
      center: e.isActive({ textAlign: 'center' }),
      right: e.isActive({ textAlign: 'right' }),
      inTable: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  const btn = (label: string, title: string, active: boolean, run: () => void, disabled = false) => (
    <button
      type="button"
      className={`rt-btn ${active ? 'active' : ''}`}
      title={t(title)}
      aria-label={t(title)}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {label}
    </button>
  );
  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt(t('Adresse des Links (leer = Link entfernen)'), prev ?? 'https://');
    if (url === null) return;
    if (!url.trim()) c().extendMarkRange('link').unsetLink().run();
    else c().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };
  return (
    <div className="rt-toolbar" role="toolbar" aria-label={t('Formatierung')}>
      <select
        value={s.block}
        aria-label={t('Absatzformat')}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'p') c().setParagraph().run();
          else c().toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
        }}
      >
        <option value="p">{t('Text')}</option>
        <option value="h1">{t('Überschrift 1')}</option>
        <option value="h2">{t('Überschrift 2')}</option>
        <option value="h3">{t('Überschrift 3')}</option>
      </select>
      <span className="rt-sep" />
      {btn('B', 'Fett', s.bold, () => c().toggleBold().run())}
      {btn('I', 'Kursiv', s.italic, () => c().toggleItalic().run())}
      {btn('U', 'Unterstrichen', s.underline, () => c().toggleUnderline().run())}
      {btn('S', 'Durchgestrichen', s.strike, () => c().toggleStrike().run())}
      {btn('▍', 'Hervorheben', s.highlight, () => c().toggleHighlight().run())}
      <span className="rt-sep" />
      {btn('•', 'Aufzählung', s.bullet, () => c().toggleBulletList().run())}
      {btn('1.', 'Nummerierte Liste', s.ordered, () => c().toggleOrderedList().run())}
      {btn('❝', 'Zitat / Hinweis', s.quote, () => c().toggleBlockquote().run())}
      <span className="rt-sep" />
      {btn('⇤', 'Linksbündig', s.left, () => c().setTextAlign('left').run())}
      {btn('↔', 'Zentriert', s.center, () => c().setTextAlign('center').run())}
      {btn('⇥', 'Rechtsbündig', s.right, () => c().setTextAlign('right').run())}
      <span className="rt-sep" />
      {btn('🔗', 'Link', s.link, setLink)}
      {btn('🖼', 'Bild einfügen', false, onImage)}
      {btn('▦', 'Tabelle einfügen', false, () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      {s.inTable && (
        <span className="rt-table-tools">
          {btn('+Z', 'Zeile darunter einfügen', false, () => c().addRowAfter().run())}
          {btn('+S', 'Spalte rechts einfügen', false, () => c().addColumnAfter().run())}
          {btn('−Z', 'Zeile löschen', false, () => c().deleteRow().run())}
          {btn('−S', 'Spalte löschen', false, () => c().deleteColumn().run())}
          {btn('⊟', 'Kopfzeile ein/aus', false, () => c().toggleHeaderRow().run())}
          {btn('✕▦', 'Tabelle löschen', false, () => c().deleteTable().run())}
        </span>
      )}
      <span className="rt-sep" />
      {btn('↶', 'Rückgängig', false, () => c().undo().run(), !s.canUndo)}
      {btn('↷', 'Wiederholen', false, () => c().redo().run(), !s.canRedo)}
    </div>
  );
}
