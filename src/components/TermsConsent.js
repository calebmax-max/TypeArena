/**
 * TermsConsent.js
 *
 * The "I agree to the Terms" checkbox for the Create Account form, plus a
 * reader modal that opens when the user clicks a policy link. The modal keeps
 * everything they've typed in the signup form intact (nothing navigates away).
 *
 * Props:
 *   checked   {boolean}            — controlled value
 *   onChange  {(bool) => void}     — called with the new value
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TERMS_DOCS } from './termsContent';
import '../styles/TermsConsent.css';

function Block({ block }) {
  if (block.type === 'ul') {
    return <ul>{block.items.map((t, i) => <li key={i}>{t}</li>)}</ul>;
  }
  if (block.type === 'ol') {
    return <ol>{block.items.map((t, i) => <li key={i}>{t}</li>)}</ol>;
  }
  if (block.type === 'table') {
    return (
      <div className="ta-terms__table-wrap">
        <table>
          <thead>
            <tr>{block.head.map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <p>
      {block.lead && <strong>{block.lead} </strong>}
      {block.text}
    </p>
  );
}

export function TermsModal({
  initialDoc,
  onClose,
  onAgree,
  alreadyAgreed,
  notice = '',
  closeLabel = 'Close',
  busy = false,
  error = '',
}) {
  const [activeId, setActiveId] = useState(initialDoc);
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  const closeRef = useRef(null);
  const doc = TERMS_DOCS.find((d) => d.id === activeId) || TERMS_DOCS[0];

  // Lock page scroll while open, focus the dialog, and restore focus on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  // Start each document at the top.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [activeId]);

  // Escape closes; Tab is kept inside the dialog.
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, [onClose]);

  return createPortal(
    <div className="ta-terms__backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="ta-terms__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ta-terms-title"
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <header className="ta-terms__header">
          <h2 id="ta-terms-title">Terms &amp; Policies</h2>
          <button type="button" className="ta-terms__close" onClick={onClose} ref={closeRef} aria-label="Close">
            &#10005;
          </button>
        </header>

        <div className="ta-terms__tabs" role="tablist">
          {TERMS_DOCS.map((d) => (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={d.id === activeId}
              className={`ta-terms__tab ${d.id === activeId ? 'is-active' : ''}`}
              onClick={() => setActiveId(d.id)}
            >
              {d.tab}
            </button>
          ))}
        </div>

        <div className="ta-terms__body" ref={bodyRef} tabIndex={0}>
          {notice && <p className="ta-terms__notice">{notice}</p>}
          <h3 className="ta-terms__doc-title">{doc.title}</h3>
          <p className="ta-terms__meta">
            Effective {doc.effective}{doc.updated ? ` · Last updated ${doc.updated}` : ''}
          </p>
          {doc.intro.map((b, i) => <Block key={`intro-${i}`} block={b} />)}
          {doc.sections.map((s) => (
            <section key={s.heading}>
              <h4>{s.heading}</h4>
              {s.blocks.map((b, i) => <Block key={i} block={b} />)}
            </section>
          ))}
        </div>

        {error && <p className="ta-terms__error" role="alert">{error}</p>}
        <footer className="ta-terms__footer">
          <button type="button" className="tp-btn tp-btn--ghost" onClick={onClose} disabled={busy}>
            {closeLabel}
          </button>
          {!alreadyAgreed && (
            <button type="button" className="tp-btn tp-btn--primary" onClick={onAgree} disabled={busy}>
              {busy ? 'Saving...' : 'I agree'}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}

export default function TermsConsent({ checked, onChange }) {
  const [openDoc, setOpenDoc] = useState(null); // null = closed, otherwise a doc id

  const openLink = (docId) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpenDoc(docId);
  };

  return (
    <>
      <label className="ta-terms__consent">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          required
        />
        <span>
          I am 18 or older and I agree to the{' '}
          <button type="button" className="ta-terms__link" onClick={openLink('terms')}>
            Terms of Service
          </button>{' '}
          and{' '}
          <button type="button" className="ta-terms__link" onClick={openLink('privacy')}>
            Privacy Policy
          </button>
          , including the{' '}
          <button type="button" className="ta-terms__link" onClick={openLink('refunds')}>
            Refund &amp; Dispute
          </button>{' '}
          and{' '}
          <button type="button" className="ta-terms__link" onClick={openLink('complaints')}>
            Complaints
          </button>{' '}
          policies.
        </span>
      </label>

      {openDoc && (
        <TermsModal
          initialDoc={openDoc}
          alreadyAgreed={checked}
          onClose={() => setOpenDoc(null)}
          onAgree={() => { onChange(true); setOpenDoc(null); }}
        />
      )}
    </>
  );
}