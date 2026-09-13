import './App.css';
import { BrowserRouter, Routes, Route, Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import Home from './components/Home';
import ChatWidget from './components/ChatWidget';

// Inside your layout/App component, pass in currentUser:


import Notfound from './components/Notfound';
import './css/Loader.css';
// inside your <Routes>:

import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/TypeArena.css';
import { fetchSiteMarquee, updateUserProfile } from './utils/typingApi';
import { buildApiUrl } from './utils/api';
import { arenaMusic } from './utils/arenaMusic';
import { preloadPlayContent } from './utils/navigationPrefetch';
import Play from './components/Play';
import TrainingPage from './components/TrainingPage';
import Tournaments from './components/Tournaments';
import Leaderboard from './components/Leaderboard';
import Profile from './components/TypeProfile';
import AdminPanel from './components/AdminPanel';
import Marketplace from './components/Marketplace';
import Results from './components/Results';
import Spectate from './components/Spectate';




const USER_STORAGE_KEY = 'typearena_user';
const USER_CHANGE_EVENT = 'typearena-user-changed';
const SITE_MARQUEE_CHANGE_EVENT = 'typearena-site-marquee-changed';
const DEFAULT_SITE_MARQUEE_ITEMS = [
  'Product Update',
  'Private friend battles are live now.',
  'Wallet top-up, tournaments, and marketplace are active.',
];

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleWindowError = this.handleWindowError.bind(this);
    this.handleUnhandledRejection = this.handleUnhandledRejection.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidMount() {
    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentDidCatch(error, errorInfo) {
    console.error('TypeArena runtime error:', error, errorInfo);
  }

  handleWindowError(event) {
    if (event?.error) {
      console.error('TypeArena uncaught window error:', event.error);
      this.setState({ error: event.error });
    }
  }

  handleUnhandledRejection(event) {
    const rejectionError =
      event?.reason instanceof Error
        ? event.reason
        : new Error(String(event?.reason || 'Unhandled async error'));

    console.error('TypeArena unhandled promise rejection:', rejectionError);
    this.setState({ error: rejectionError });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="profile-container" style={{ minHeight: '100vh', paddingTop: '4rem' }}>
          <section className="auth-section">
            <h1>TypeArena hit a runtime error</h1>
            <p className="auth-notice">
              {this.state.error?.message || 'The page crashed while loading.'}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}

const readStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [siteMarqueeItems, setSiteMarqueeItems] = useState(DEFAULT_SITE_MARQUEE_ITEMS);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    void arenaMusic.loadRemoteSettings();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setMenuOpen(false);
  }, [location.key]);

  useEffect(() => {
    // Sync from localStorage immediately (so UI isn't blank on load)
    const syncUser = () => setCurrentUser(readStoredUser());
    syncUser();

    // Then validate the session with the server and get a fresh token.
    // This handles the case where the user is already logged in from a
    // previous session and never hits the login page.
    const refreshSession = async () => {
      const stored = readStoredUser();
      if (!stored?.id) return; // not logged in, nothing to refresh

      try {
        const headers = {
          'Content-Type': 'application/json',
        };
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(buildApiUrl('/api/user/me'), { headers });
        if (!res.ok) return; // server down or truly invalid — leave stored user as-is

        const fresh = await res.json();

        // Persist the fresh token so all subsequent API calls authenticate correctly
        if (fresh.token) {
          localStorage.setItem('token', fresh.token);
        }

        // Update stored user with latest server data (balance, wpm, etc.)
        const updated = { ...stored, ...fresh };
        const legacyProfileImage = localStorage.getItem('typearena_badge_image') || '';
        if (!updated.profileImage && legacyProfileImage.startsWith('data:image/')) {
          try {
            const migratedUser = await updateUserProfile(updated.id, { profileImage: legacyProfileImage });
            Object.assign(updated, migratedUser);
          } catch (_) {
            // The profile page will retry migration and show any upload error.
          }
        }
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
        setCurrentUser(updated);
      } catch (_) {
        // Network error — keep the locally stored user, app still works offline-ish
      }
    };

    refreshSession();

    window.addEventListener('storage', syncUser);
    window.addEventListener(USER_CHANGE_EVENT, syncUser);

    return () => {
      window.removeEventListener('storage', syncUser);
      window.removeEventListener(USER_CHANGE_EVENT, syncUser);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadSiteMarquee = async () => {
      const data = await fetchSiteMarquee();
      const items = Array.isArray(data?.items)
        ? data.items.map((item) => String(item || '').trim()).filter(Boolean)
        : [];

      if (active && items.length > 0) {
        setSiteMarqueeItems(items);
      }
    };

    loadSiteMarquee();
    window.addEventListener(SITE_MARQUEE_CHANGE_EVENT, loadSiteMarquee);

    return () => {
      active = false;
      window.removeEventListener(SITE_MARQUEE_CHANGE_EVENT, loadSiteMarquee);
    };
  }, []);

  const preloadPlayPage = () => {
    void preloadPlayContent();
  };

  const handleSignOut = () => {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem('token');
    window.dispatchEvent(new Event(USER_CHANGE_EVENT));
    setCurrentUser(null);
    navigate('/');
  };

  const navLinkClassName = ({ isActive }) =>
    `nav-link${isActive ? ' nav-link--active' : ''}`;

  return (
    <div className="App">
      <header className="arena-navbar">
        <div className="arena-navbar__inner">
          <Link to="/" className="arena-brand" aria-label="TypeArena home">
            <span className="arena-brand__mark">TA</span>
            <span className="arena-brand__copy"><strong>TypeArena</strong><small>Compete. Type. Win.</small></span>
          </Link>
          <button type="button" className={`arena-menu-toggle${menuOpen ? ' is-open' : ''}`} aria-expanded={menuOpen} aria-controls="arena-primary-nav" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMenuOpen((open) => !open)}>
            <span /><span /><span />
          </button>
          <nav id="arena-primary-nav" className={`arena-nav${menuOpen ? ' is-open' : ''}`} aria-label="Primary navigation">
            <NavLink to="/play" className={navLinkClassName} onMouseEnter={preloadPlayPage} onFocus={preloadPlayPage} onTouchStart={preloadPlayPage}>Play</NavLink>
            <NavLink to="/training" className={navLinkClassName}>Training</NavLink>
            <NavLink to="/tournaments" className={navLinkClassName}>Tournaments</NavLink>
            <NavLink to="/leaderboard" className={navLinkClassName}>Leaderboard</NavLink>
            <NavLink to="/marketplace" className={navLinkClassName}>Marketplace</NavLink>
            <NavLink to="/profile" className={`${navLinkClassName({ isActive: location.pathname === '/profile' })} arena-nav__profile`}>{currentUser ? 'Profile' : 'Sign In'}</NavLink>
            {currentUser && <button type="button" onClick={handleSignOut} className="arena-nav__signout">Sign Out</button>}
          </nav>
        </div>
      </header>

      <div className="site-marquee" aria-label="Announcements">
        <div className="site-marquee__track">
          {[...siteMarqueeItems, ...siteMarqueeItems].map((item, index) => (
            <span key={`${item}-${index}`}>{item}</span>
          ))}
        </div>
      </div>

      
      <main>
        <ChatWidget currentUser={currentUser} />
        <Routes>
          <Route path="/" element={<Home currentUser={currentUser} />} />
          <Route path="/play" element={<Play />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/practice" element={<Play practicePage />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/spectate/:roomId" element={<Spectate />} />
          <Route path="/results/:raceId" element={<Results />} />
          <Route path="*" element={<Notfound />} />
        </Routes>
      </main>

      <footer className="arena-footer">
        <div className="arena-footer__inner">
          <div><strong>TypeArena</strong><p>Skill-based typing races for people who like a little pressure.</p></div>
          <div className="arena-footer__links"><Link to="/play">Play a race</Link><Link to="/tournaments">Tournaments</Link><Link to="/leaderboard">Leaderboard</Link><Link to="/profile">Your profile</Link></div>
        </div>
        <p className="arena-footer__bottom">&copy; 2026 TypeArena. Compete. Type. Win.</p>
      </footer>
    </div>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </AppErrorBoundary>
  );
}

export default App;