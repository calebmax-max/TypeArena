import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  addFundsToWallet,
  fetchWalletConfig,
  fetchWalletTopupStatus,
  verifyWalletTopupSession,
} from '../utils/typingApi';

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000; // stop auto-polling after 3 minutes

const METHOD_LABELS = {
  mpesa: 'M-Pesa',
  stripe_checkout: 'Card (Stripe)',
};

export default function WalletTopUpModal({
  isOpen,
  onClose,
  suggestedAmount,
  currentUser,
  getAuthToken,
  onSuccess,
}) {
  const [config, setConfig] = useState({ topUpMethods: [] });
  const [method, setMethod] = useState('');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState(currentUser?.phone_number || currentUser?.phoneNumber || '');
  const [stage, setStage] = useState('form'); // 'form' | 'pending' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef(null);
  const pollDeadlineRef = useRef(0);
  const pendingRef = useRef(null); // { kind: 'mpesa'|'stripe', checkoutRequestId?, sessionId? }

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Reset all local state whenever the modal is (re)opened.
  useEffect(() => {
    if (!isOpen) return;
    setStage('form');
    setMessage('');
    setSubmitting(false);
    setAmount(suggestedAmount ? String(Math.ceil(suggestedAmount)) : '');
    setPhone(currentUser?.phone_number || currentUser?.phoneNumber || '');
    pendingRef.current = null;
    stopPolling();

    let cancelled = false;
    fetchWalletConfig().then((cfg) => {
      if (cancelled) return;
      const safeCfg = cfg && Array.isArray(cfg.topUpMethods) ? cfg : { topUpMethods: [] };
      setConfig(safeCfg);
      setMethod((prev) => (prev && safeCfg.topUpMethods.includes(prev) ? prev : safeCfg.topUpMethods[0] || ''));
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, suggestedAmount]);

  // Always clear any running poll on unmount.
  useEffect(() => () => stopPolling(), [stopPolling]);

  const finishSuccess = useCallback((updatedUser) => {
    stopPolling();
    setStage('success');
    setMessage('Funds added to your wallet.');
    if (onSuccess) onSuccess(updatedUser || null);
  }, [onSuccess, stopPolling]);

  const finishFailure = useCallback((msg) => {
    stopPolling();
    setStage('error');
    setMessage(msg || 'Payment could not be completed.');
  }, [stopPolling]);

  const pollMpesaStatus = useCallback((checkoutRequestId) => {
    pendingRef.current = { kind: 'mpesa', checkoutRequestId };
    pollDeadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      if (Date.now() > pollDeadlineRef.current) {
        stopPolling();
        setMessage('Still waiting on M-Pesa. If you completed payment on your phone, it will reflect shortly — you can close this and check your balance.');
        return;
      }
      try {
        const result = await fetchWalletTopupStatus(checkoutRequestId);
        const status = String(result?.status || '').toLowerCase();
        if (status === 'completed') {
          finishSuccess(result.user);
        } else if (status === 'failed') {
          finishFailure(result.resultDescription || 'M-Pesa payment failed or was cancelled.');
        }
      } catch (err) {
        // Transient network hiccup — keep polling until the timeout.
      }
    }, POLL_INTERVAL_MS);
  }, [finishFailure, finishSuccess, stopPolling]);

  const pollStripeSession = useCallback((sessionId) => {
    pendingRef.current = { kind: 'stripe', sessionId };
    pollDeadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      if (Date.now() > pollDeadlineRef.current) {
        stopPolling();
        setMessage('Still waiting on payment confirmation. If you completed checkout, click "I\'ve paid" to verify.');
        return;
      }
      try {
        const result = await verifyWalletTopupSession(sessionId);
        const status = String(result?.status || '').toLowerCase();
        if (status === 'completed') {
          finishSuccess(result.user);
        } else if (status === 'failed') {
          finishFailure(result.message || 'This checkout session expired before payment was completed.');
        }
      } catch (err) {
        // Keep polling until the timeout — the session may simply not be paid yet.
      }
    }, POLL_INTERVAL_MS);
  }, [finishFailure, finishSuccess, stopPolling]);

  const handleManualVerify = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    setSubmitting(true);
    try {
      if (pending.kind === 'stripe') {
        const result = await verifyWalletTopupSession(pending.sessionId);
        const status = String(result?.status || '').toLowerCase();
        if (status === 'completed') finishSuccess(result.user);
        else setMessage(result?.message || 'Payment is not completed yet.');
      } else if (pending.kind === 'mpesa') {
        const result = await fetchWalletTopupStatus(pending.checkoutRequestId);
        const status = String(result?.status || '').toLowerCase();
        if (status === 'completed') finishSuccess(result.user);
        else if (status === 'failed') finishFailure(result.resultDescription);
        else setMessage('Still pending — complete the prompt on your phone, then try again.');
      }
    } catch (err) {
      setMessage(err.message || 'Could not verify payment yet.');
    } finally {
      setSubmitting(false);
    }
  }, [finishFailure, finishSuccess]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (getAuthToken && !getAuthToken()) {
      setStage('error');
      setMessage('You need to be signed in to top up your wallet.');
      return;
    }
    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setMessage('Enter a valid amount greater than zero.');
      return;
    }
    if (!method) {
      setMessage('No top-up method is available right now.');
      return;
    }
    if (method === 'mpesa' && !phone.trim()) {
      setMessage('Enter the M-Pesa phone number to receive the payment prompt on.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    try {
      const accountIdentifier = method === 'mpesa' ? phone.trim() : (currentUser?.email || '');
      const result = await addFundsToWallet(amountValue, accountIdentifier, method);

      if (result?.status === 'completed') {
        // Simulated / instant top-up path
        finishSuccess(result.user);
        return;
      }

      if (method === 'mpesa') {
        const checkoutRequestId = result?.mpesa?.CheckoutRequestID;
        if (!checkoutRequestId) {
          finishFailure(result?.message || 'M-Pesa did not return a checkout reference.');
          return;
        }
        setStage('pending');
        setMessage(result?.message || 'Check your phone and enter your M-Pesa PIN to complete the top-up.');
        pollMpesaStatus(checkoutRequestId);
        return;
      }

      // stripe_checkout
      if (result?.checkoutUrl) {
        window.open(result.checkoutUrl, '_blank', 'noopener,noreferrer');
        setStage('pending');
        setMessage('Complete payment in the new tab, then come back here.');
        if (result.sessionId) pollStripeSession(result.sessionId);
        return;
      }

      finishFailure(result?.message || 'Could not start checkout.');
    } catch (err) {
      setStage('error');
      setMessage(err.message || 'Could not process the top-up.');
    } finally {
      setSubmitting(false);
    }
  }, [amount, currentUser, getAuthToken, method, phone, finishFailure, finishSuccess, pollMpesaStatus, pollStripeSession]);

  const handleClose = useCallback(() => {
    stopPolling();
    if (onClose) onClose();
  }, [onClose, stopPolling]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Top up wallet"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(5,7,12,0.72)', padding: '1rem',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        style={{
          width: '100%', maxWidth: 420,
          background: 'var(--arena-panel, #12151c)',
          border: '1px solid var(--arena-panel-border, #262b36)',
          borderRadius: 14,
          padding: '1.5rem',
          color: 'var(--arena-text, #eef1f6)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Top Up Wallet</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--arena-muted, #9aa3b2)', fontSize: '1.3rem', cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {stage === 'form' && (
          <form onSubmit={handleSubmit}>
            {config.topUpMethods.length === 0 ? (
              <p style={{ color: 'var(--arena-muted, #9aa3b2)', fontSize: '0.9rem' }}>
                No top-up method is enabled on this server right now. Please try again later.
              </p>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--arena-muted, #9aa3b2)', marginBottom: 4 }}>
                  Amount (KES)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 500"
                  style={inputStyle}
                  autoFocus
                />

                {config.topUpMethods.length > 1 && (
                  <>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--arena-muted, #9aa3b2)', margin: '0.75rem 0 4px' }}>
                      Payment method
                    </label>
                    <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
                      {config.topUpMethods.map((m) => (
                        <option key={m} value={m}>{METHOD_LABELS[m] || m}</option>
                      ))}
                    </select>
                  </>
                )}

                {method === 'mpesa' && (
                  <>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--arena-muted, #9aa3b2)', margin: '0.75rem 0 4px' }}>
                      M-Pesa phone number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="07XXXXXXXX"
                      style={inputStyle}
                    />
                  </>
                )}

                {message && (
                  <p style={{ color: 'var(--arena-gold, #e7b23c)', fontSize: '0.85rem', marginTop: '0.75rem' }}>{message}</p>
                )}

                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', marginTop: '1rem' }}>
                  {submitting ? 'Processing...' : `Top up${method ? ` with ${METHOD_LABELS[method] || method}` : ''}`}
                </button>
              </>
            )}
          </form>
        )}

        {stage === 'pending' && (
          <div>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>{message}</p>
            <button type="button" className="btn btn-outline-primary" onClick={handleManualVerify} disabled={submitting} style={{ width: '100%', marginTop: '0.5rem' }}>
              {submitting ? 'Checking...' : "I've paid — check now"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleClose} style={{ width: '100%', marginTop: '0.5rem' }}>
              Close (I'll check my balance later)
            </button>
          </div>
        )}

        {stage === 'success' && (
          <div>
            <p style={{ fontSize: '0.95rem', color: 'var(--arena-accent, #6fd3a8)' }}>{message}</p>
            <button type="button" className="btn btn-primary" onClick={handleClose} style={{ width: '100%', marginTop: '0.75rem' }}>
              Done
            </button>
          </div>
        )}

        {stage === 'error' && (
          <div>
            <p style={{ fontSize: '0.9rem', color: '#e2685f' }}>{message}</p>
            <button type="button" className="btn btn-outline-primary" onClick={() => setStage('form')} style={{ width: '100%', marginTop: '0.75rem' }}>
              Try again
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleClose} style={{ width: '100%', marginTop: '0.5rem' }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.6rem 0.75rem',
  borderRadius: 8,
  border: '1px solid var(--arena-panel-border, #262b36)',
  background: 'var(--arena-key-bg, #0d0f15)',
  color: 'var(--arena-text, #eef1f6)',
  fontSize: '0.9rem',
};