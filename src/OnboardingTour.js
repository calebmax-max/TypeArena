import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './OnboardingTour.css';

// ── Storage keys ──────────────────────────────────────────────────────────
const SEEN_KEY = 'typearena:tour-seen';
// Recent-race history is written by Play.js the first time someone finishes
// a training run or race (see the "Clear" button in Play.js, which removes
// this same key). Its presence is used as a proxy for "has already tried
// training/racing," so a returning player who cleared their account but
// kept the device doesn't get re-onboarded mid-session.
const RECENT_RACES_KEY = 'typearena_recent_races';

const MOBILE_BREAKPOINT = 820; // matches the .arena-menu-toggle breakpoint in App.css
const START_DELAY_MS = 1500;

function hasSeenTour() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch (e) {
    return false; // if storage is unavailable, fail open (don't show hint) rather than
                   // risk crashing or re-showing the tour every load
  }
}

function markTourSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch (e) {
    /* storage unavailable; tour just may show again next visit */
  }
}

function hasTrainingProgress() {
  try {
    const raw = window.localStorage.getItem(RECENT_RACES_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length > 0 : Boolean(parsed);
  } catch (e) {
    return false;
  }
}

/**
 * Exported so a future "Replay tour" control (in Profile/Settings, say) can
 * clear the seen-flag and reload. Not wired into any UI by default, per the
 * brief: the tour is for brand-new visitors only.
 */
export function resetOnboardingTour() {
  try {
    window.localStorage.removeItem(SEEN_KEY);
  } catch (e) {
    /* nothing to do */
  }
}

// ── Step definitions ─────────────────────────────────────────────────────
// `target` is the value of a `data-tour="..."` attribute somewhere in the
// nav. Steps without a `target` render as a centered card instead of a
// pointer + tooltip.
const STEPS = [
  {
    id: 'welcome',
    body: 'Welcome to TypeArena. Take a one-minute tour?',
    centered: true,
  },
  {
    id: 'play',
    target: 'nav-play',
    body: 'Free practice, free friend battles, or battle friends for real money \u2014 your call.',
  },
  {
    id: 'training',
    target: 'nav-training',
    body: 'Practice for free with lessons. Nothing is staked, and it even works offline.',
  },
  {
    id: 'tournaments',
    target: 'nav-tournaments',
    body: 'Paid matches, real money in KES. Pay the entry fee and the winner takes the prize.',
  },
  {
    id: 'leaderboard',
    target: 'nav-leaderboard',
    body: 'Earn season points, and see where you rank. The season resets at the end of each month.',
  },
  {
    id: 'profile',
    target: 'nav-profile',
    body: 'Your account: top up your wallet, change your username or photo, and adjust audio settings.',
  },
  {
    id: 'finish',
    body: 'Ready to jump in?',
    centered: true,
    finish: true,
  },
];

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT;
}

/**
 * Onboarding tour for brand-new visitors. Points at the nav and explains
 * each section; never joins, pays, or changes anything itself.
 *
 * Mount once near the top of AppLayout. Pass the same `menuOpen`/
 * `setMenuOpen` state App.js already uses for the hamburger menu so the
 * tour can open it for menu-related steps on phones, and pass
 * `onActiveChange` so App.js can keep the install button out of the way
 * while the tour is up.
 */
export default function OnboardingTour({ currentUser, menuOpen, setMenuOpen, onActiveChange }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [stepIndex, setStepIndex] = useState(-1); // -1 = not showing
  const [rect, setRect] = useState(null); // target element's bounding box, if any
  const [mobile, setMobile] = useState(isMobileViewport);
  const startTimer = useRef(null);
  const wasMenuOpenedByTour = useRef(false);

  const active = stepIndex >= 0;
  const step = active ? STEPS[stepIndex] : null;

  // Tell the parent when the tour is on screen, so it can hide the install
  // button etc. Fires on mount too, in case a previous render left it stuck.
  useEffect(() => {
    if (onActiveChange) onActiveChange(active);
  }, [active, onActiveChange]);

  // Track viewport width so a mid-tour resize (e.g. rotating a tablet)
  // switches presentation correctly.
  useEffect(() => {
    const onResize = () => setMobile(isMobileViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Arm the tour: only ever starts from the home page, after a short delay,
  // and only for a signed-out visitor with no race/training history who
  // hasn't seen it on this device before.
  useEffect(() => {
    window.clearTimeout(startTimer.current);

    const eligible =
      location.pathname === '/' &&
      !currentUser &&
      !hasSeenTour() &&
      !hasTrainingProgress();

    if (!eligible) return undefined;

    startTimer.current = window.setTimeout(() => {
      // Defensive re-check: never start on /play, even if the player
      // navigated there in the ~1.5s since the timer was armed.
      if (window.location.pathname === '/play') return;
      markTourSeen();
      setStepIndex(0);
    }, START_DELAY_MS);

    return () => window.clearTimeout(startTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, currentUser]);

  const endTour = useCallback(() => {
    setStepIndex(-1);
    setRect(null);
    if (wasMenuOpenedByTour.current) {
      setMenuOpen(false);
      wasMenuOpenedByTour.current = false;
    }
  }, [setMenuOpen]);

  // Escape closes the tour from anywhere.
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') endTour();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, endTour]);

  // If the player navigates away mid-tour (e.g. taps a real nav link),
  // don't leave a stale tour card floating over the new page.
  useEffect(() => {
    if (active) endTour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Measure (and re-measure) the current step's target element.
  useEffect(() => {
    if (!active || !step?.target) {
      setRect(null);
      return undefined;
    }

    let cancelled = false;
    let openedMenuThisStep = false;

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el) {
        // Target isn't in the DOM (e.g. menu still animating open) - skip
        // forward rather than get stuck on a step nobody can see.
        setRect(null);
        return;
      }
      setRect(el.getBoundingClientRect());
    };

    if (mobile) {
      // On phones the links live inside the hamburger menu.
      if (!menuOpen) {
        setMenuOpen(true);
        wasMenuOpenedByTour.current = true;
        openedMenuThisStep = true;
      }
      // Give the menu's open transition a moment before measuring.
      const t = window.setTimeout(measure, 220);
      window.addEventListener('resize', measure);
      window.addEventListener('scroll', measure, true);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
        window.removeEventListener('resize', measure);
        window.removeEventListener('scroll', measure, true);
      };
    }

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      void openedMenuThisStep;
    };
  }, [active, step, mobile, menuOpen, setMenuOpen]);

  if (!active) return null;

  const total = STEPS.length;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === total - 1;

  const goNext = () => {
    if (isLast) {
      endTour();
      navigate('/login?signup=1');
      return;
    }
    setStepIndex((i) => i + 1);
  };
  const goBack = () => {
    if (!isFirst) setStepIndex((i) => i - 1);
  };

  const showSpotlight = Boolean(step.target) && (rect || mobile);

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="TypeArena tour">
      {showSpotlight && !mobile && rect && (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      {(mobile || step.centered) && <div className="tour-scrim" onClick={endTour} />}

      {step.centered ? (
        <div className="tour-card tour-card--centered">
          <TourBody
            step={step}
            stepIndex={stepIndex}
            total={total}
            isFirst={isFirst}
            isLast={isLast}
            onNext={goNext}
            onBack={goBack}
            onSkip={endTour}
          />
        </div>
      ) : mobile ? (
        <div className="tour-card tour-card--sheet">
          <TourBody
            step={step}
            stepIndex={stepIndex}
            total={total}
            isFirst={isFirst}
            isLast={isLast}
            onNext={goNext}
            onBack={goBack}
            onSkip={endTour}
            large
          />
        </div>
      ) : rect ? (
        <div
          className="tour-card tour-card--tooltip"
          style={tooltipPosition(rect)}
        >
          <TourBody
            step={step}
            stepIndex={stepIndex}
            total={total}
            isFirst={isFirst}
            isLast={isLast}
            onNext={goNext}
            onBack={goBack}
            onSkip={endTour}
          />
        </div>
      ) : null}
    </div>
  );
}

function tooltipPosition(rect) {
  const top = rect.bottom + 14;
  const left = Math.min(
    Math.max(rect.left, 16),
    window.innerWidth - 336 // keep the ~320px card on screen
  );
  return { top, left };
}

function TourBody({ step, stepIndex, total, isFirst, isLast, onNext, onBack, onSkip, large }) {
  return (
    <>
      <p className={`tour-body${large ? ' tour-body--large' : ''}`}>{step.body}</p>
      <div className="tour-footer">
        <span className="tour-counter">{stepIndex + 1} of {total}</span>
        <div className="tour-actions">
          {!step.finish && (
            <button type="button" className="tour-btn tour-btn--ghost" onClick={onSkip}>
              Skip
            </button>
          )}
          {!isFirst && !step.finish && (
            <button type="button" className="tour-btn tour-btn--ghost" onClick={onBack}>
              Back
            </button>
          )}
          <button type="button" className="tour-btn tour-btn--primary" onClick={onNext}>
            {step.finish ? 'Create Account' : isFirst ? 'Start' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}