'use client';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { api } from '@/lib/client';
import { toBase64, fromBase64 } from '@/lib/b64';

export default function SidePanel({ pageId, role, ydoc }) {
  const [tab, setTab] = useState('comments');
  const canEdit = role === 'OWNER' || role === 'EDIT';
  const canComment = canEdit || role === 'COMMENT';

  /* ---------- comments ---------- */
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');

  const loadComments = () => api(`/api/pages/${pageId}/comments`).then(setComments).catch(() => {});

  useEffect(() => {
    loadComments();
    const timer = setInterval(loadComments, 5000); // refresh every 5 seconds
    return () => clearInterval(timer);
  }, [pageId]);

  const addComment = async (e) => {
    e.preventDefault();
    try {
      await api(`/api/pages/${pageId}/comments`, { method: 'POST', body: { text } });
      setText('');
      loadComments();
    } catch (err) {
      setMessage(err.message);
    }
  };

  /* ---------- version history ---------- */
  const [versions, setVersions] = useState([]);
  const [label, setLabel] = useState('');

  const loadVersions = () => api(`/api/pages/${pageId}/versions`).then(setVersions).catch(() => {});
  useEffect(() => { loadVersions(); }, [pageId]);

  // A snapshot is the whole Yjs state at this moment
  const saveSnapshot = async (e) => {
    e.preventDefault();
    if (!ydoc) return;
    try {
      const state = toBase64(Y.encodeStateAsUpdate(ydoc));
      await api(`/api/pages/${pageId}/versions`, { method: 'POST', body: { label, state } });
      setLabel('');
      setMessage('Snapshot saved.');
      loadVersions();
    } catch (err) {
      setMessage(err.message);
    }
  };

  // Restore: load the old state into a temporary doc, then replace the live content with it.
  // Everyone connected sees the change, and it can itself be undone by restoring another snapshot.
  const restore = async (versionId) => {
    if (!ydoc || !window.confirm('Replace the current content with this version?')) return;
    try {
      const { state } = await api(`/api/pages/${pageId}/versions/${versionId}`);
      const old = new Y.Doc();
      Y.applyUpdate(old, fromBase64(state));
      const from = old.getXmlFragment('default');
      const to = ydoc.getXmlFragment('default');
      ydoc.transact(() => {
        to.delete(0, to.length);
        to.insert(0, from.toArray().map((node) => node.clone()));
      });
      setMessage('Version restored.');
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <aside className="side">
      <div className="tabs">
        <button className={tab === 'comments' ? 'tab active' : 'tab'} onClick={() => setTab('comments')}>Comments ({comments.length})</button>
        <button className={tab === 'history' ? 'tab active' : 'tab'} onClick={() => setTab('history')}>History ({versions.length})</button>
      </div>
      {message && <p className="notice small">{message}</p>}

      {tab === 'comments' && (
        <>
          {comments.length === 0 && <p className="muted small">No comments yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className="comment">
              <strong style={{ color: c.user.color }}>{c.user.name}</strong>
              <span className="muted small"> · {new Date(c.createdAt).toLocaleString()}</span>
              <p>{c.text}</p>
            </div>
          ))}
          {canComment ? (
            <form onSubmit={addComment}>
              <textarea placeholder="Write a comment" value={text} onChange={(e) => setText(e.target.value)} required />
              <button type="submit">Comment</button>
            </form>
          ) : (
            <p className="muted small">View-only users cannot comment.</p>
          )}
        </>
      )}

      {tab === 'history' && (
        <>
          {canEdit && (
            <form className="row" onSubmit={saveSnapshot}>
              <input placeholder="Snapshot name" value={label} onChange={(e) => setLabel(e.target.value)} />
              <button type="submit">Save</button>
            </form>
          )}
          {versions.length === 0 && <p className="muted small">No snapshots saved yet.</p>}
          {versions.map((v) => (
            <div key={v.id} className="comment">
              <strong>{v.label}</strong>
              <p className="muted small">{v.user.name} · {new Date(v.createdAt).toLocaleString()}</p>
              {canEdit && <button className="ghost" onClick={() => restore(v.id)}>Restore</button>}
            </div>
          ))}
        </>
      )}
    </aside>
  );
}
