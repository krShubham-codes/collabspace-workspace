'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';

function Toolbar({ editor }) {
  const btn = (label, active, action) => (
    <button type="button" className={active ? 'tool active' : 'tool'} onClick={action}>{label}</button>
  );
  const run = () => editor.chain().focus();
  return (
    <div className="toolbar">
      {btn('B', editor.isActive('bold'), () => run().toggleBold().run())}
      {btn('I', editor.isActive('italic'), () => run().toggleItalic().run())}
      {btn('H1', editor.isActive('heading', { level: 1 }), () => run().toggleHeading({ level: 1 }).run())}
      {btn('H2', editor.isActive('heading', { level: 2 }), () => run().toggleHeading({ level: 2 }).run())}
      {btn('• List', editor.isActive('bulletList'), () => run().toggleBulletList().run())}
      {btn('1. List', editor.isActive('orderedList'), () => run().toggleOrderedList().run())}
      {btn('Quote', editor.isActive('blockquote'), () => run().toggleBlockquote().run())}
    </div>
  );
}

export default function TipTapEditor({ ydoc, provider, user, editable }) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable,
      extensions: [
        // history is turned off, because Yjs has its own undo/redo handling
        StarterKit.configure({ history: false }),
        // connects the editor content to the shared Yjs document
        Collaboration.configure({ document: ydoc }),
        // shows other people's cursors using the provider's awareness data
        CollaborationCursor.configure({ provider, user: { id: user.id, name: user.name, color: user.color } }),
      ],
    },
    [ydoc, provider, editable]
  );

  if (!editor) return null;

  return (
    <div className="editor-box">
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="editor" />
    </div>
  );
}
