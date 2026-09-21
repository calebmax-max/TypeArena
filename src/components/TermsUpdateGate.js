/**
 * TermsUpdateGate.js
 *
 * Shows the Terms reader with an "I agree" button to signed-in players who have
 * not accepted the CURRENT version of the Terms (accounts created before the
 * signup checkbox existed, or after TERMS_VERSION is bumped).
 *
 * Mount it ONCE, in App.js (inside AppLayout), and pass it the same
 * `currentUser` that App keeps in state:
 *
 *   <TermsUpdateGate currentUser={currentUser} suspended={tourActive} />
 *
 * The server decides who needs it: /api/user/me and login return
 * `termsCurrent: false` for those users. Nothing is shown when termsCurrent is
 * true or unknown (null/undefined), for admins, or while an admin is using
 * "Sign in as" (the server also refuses consent in that case).
 *
 * After "I agree", acceptTerms() saves the new user and fires
 * 'typearena-user-changed', App re-reads it, and this component hides itself.
 * "Remind me later" hides it until the next page load.
 *
 * Props:
 *   currentUser {object|null} - the signed-in user from App state
 *   suspended   {boolean}     - true to hold the prompt back (e.g. while the onboarding tour is open)
 */

import React, { useState } from 'react';
import { acceptTerms, getAdminToken } from '../utils/typingApi';
import { TermsModal } from './TermsConsent';
import { TERMS_VERSION } from './termsContent';

export default function TermsUpdateGate({ currentUser, suspended = false }) {
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const impersonating = Boolean(getAdminToken()) && !currentUser?.isAdmin;
  const needsAcceptance =
    Boolean(currentUser?.id) &&
    currentUser.termsCurrent === false &&
    !currentUser.isAdmin &&
    !impersonating;

  if (!needsAcceptance || dismissed || suspended) return null;

  const handleAgree = async () => {
    setBusy(true);
    setError('');
    try {
      await acceptTerms(TERMS_VERSION);
    } catch (err) {
      setError(err.message || 'Could not save your acceptance. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <TermsModal
      initialDoc="terms"
      notice="We've published our Terms of Service and policies. Please review and accept them to keep using TypeArena."
      closeLabel="Remind me later"
      busy={busy}
      error={error}
      onClose={() => setDismissed(true)}
      onAgree={handleAgree}
    />
  );
}