import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './OnboardingTour.css';

// ── Storage keys ──────────────────────────────────────────────────────────
const MOBILE_BREAKPOINT = 820; // matches the .arena-menu-toggle breakpoint in App.css
const START_DELAY_MS = 1500;

export function shouldShowOnboardingTour({ pathname, currentUser }) {
  if (pathname !== '/') return false;
  return !currentUser || !currentUser.id;
}

// ── Step definitions ─────────────────────────────────────────────────────
// `target` is the value of a `data-tour="..."` attribute on the relevant
// element. `route` tells the tour which page to navigate to before that step
// is shown, so the highlight lands on the exact action area the user needs.
const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to TypeArena',
    body: 'Take a quick tour through the main ways to play. You can skip this at any time.',
    centered: true,
  },
  {
    id: 'practice',
    target: 'home-start-typing',
    route: '/',
    title: 'Start a free practice race',
    body: 'From the home page, click Start Typing to launch a quick free practice session and warm up before live competition.',
  },
  {
    id: 'public-race',
    target: 'play-live-1v1',
    route: '/play',
    title: 'Find a public 1v1 opponent',
    body: 'On the Play page, tap Join Live 1v1 to match against another racer in a live duel. It is a great way to test your speed in real time.',
  },
  {
    id: 'private-room',
    target: 'play-create-private-room',
    route: '/play',
    title: 'Create a private room and invite a username',
    body: 'You can create a free private room or set a stake first. Then invite a username, choose your settings, and start when everyone is ready.',
  },
  {
    id: 'tournament',
    target: 'tournament-join-button',
    route: '/tournaments',
    title: 'Join a tournament',
    body: 'Open Tournaments, pick a match, and click Join to enter the lobby. Entry fees are shown up front, and prizes are paid out after the match.',
  },
  {
    id: 'finish',
    title: 'You’re ready to play',
    body: 'Practice, challenge a live opponent, or jump into a tournament when you feel ready.',
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

  useEffect(() => {
    if (!active || !step?.route) return;
    if (location.pathname !== step.route) {
      navigate(step.route);
    }
  }, [active, location.pathname, navigate, step]);

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

  // Arm the tour from the home page after a short delay for signed-out
  // visitors. The tour is meant to reappear whenever someone is unsigned and
  // returns to the site.
  useEffect(() => {
    window.clearTimeout(startTimer.current);

    const eligible = shouldShowOnboardingTour({
      pathname: location.pathname,
      currentUser,
    });

    if (!eligible) return undefined;

    startTimer.current = window.setTimeout(() => {
      // Defensive re-check: never start on /play, even if the player
      // navigated there in the ~1.5s since the timer was armed.
      if (window.location.pathname === '/play') return;
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
      navigate(currentUser?.id ? '/play' : '/profile?signup=1');
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
            signedIn={Boolean(currentUser?.id)}
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
            signedIn={Boolean(currentUser?.id)}
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
            signedIn={Boolean(currentUser?.id)}
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

function TourBody({ step, stepIndex, total, isFirst, isLast, onNext, onBack, onSkip, signedIn, large }) {
  return (
    <>
      {step.title && <h2 className="tour-title">{step.title}</h2>}
      <div className="tour-progress" aria-hidden="true">
        <span style={{ width: `${((stepIndex + 1) / total) * 100}%` }} />
      </div>
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
            {step.finish ? (signedIn ? 'Start Racing' : 'Create Account') : isFirst ? 'Start' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
