import './App.css';
import { BrowserRouter, Routes, Route, Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import Home from './components/Home';
import Play from './components/Play';
import Tournaments from './components/Tournaments';
import Leaderboard from './components/Leaderboard';
import Profile from './components/TypeProfile';
import AdminPanel from './components/AdminPanel';
import Marketplace from './components/Marketplace';
import Results from './components/Results';
import ChatWidget from './components/ChatWidget';

// Inside your layout/App component, pass in currentUser:


import Notfound from './components/Notfound';
import Spectate from './components/Spectate';
// inside your <Routes>:

import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/TypeArena.css';
import { fetchSiteMarquee } from './utils/typingApi';




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

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.key]);

  useEffect(() => {
    const syncUser = () => {
      setCurrentUser(readStoredUser());
    };

    syncUser();
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

  const handleSignOut = () => {
    localStorage.removeItem(USER_STORAGE_KEY);
    window.dispatchEvent(new Event(USER_CHANGE_EVENT));
    setCurrentUser(null);
    navigate('/');
  };

  const navLinkClassName = ({ isActive }) =>
    `nav-link${isActive ? ' nav-link--active' : ''}`;

  return (
    <div className="App">
      <header className="navbar navbar-expand-lg navbar-dark bg-dark sticky-top">
        <div className="container-fluid">
          <div className="navbar-topbar">
            <Link to="/" className="navbar-brand fw-bold">
              TypeArena
            </Link>
            <div className="navbar-auth-mobile">
              {currentUser ? (
                <NavLink to="/profile" className="nav-link nav-link--auth-mobile">
                  Profile
                </NavLink>
              ) : (
                <NavLink to="/profile" className="nav-link nav-link--auth-mobile">
                  Sign In
                </NavLink>
              )}
            </div>
          </div>
          <nav className="navbar-nav navbar-nav--persistent ms-auto">
            <NavLink to="/play" className={navLinkClassName}>Play</NavLink>
            <NavLink to="/tournaments" className={navLinkClassName}>Tournaments</NavLink>
            <NavLink to="/leaderboard" className={navLinkClassName}>Leaderboard</NavLink>
            <NavLink to="/marketplace" className={navLinkClassName}>Marketplace</NavLink>
            {currentUser ? (
              <>
                <NavLink to="/profile" className={`${navLinkClassName({ isActive: location.pathname === '/profile' })} navbar-desktop-only`}>Profile</NavLink>
                <button onClick={handleSignOut} className="nav-link btn btn-link navbar-desktop-only">
                  Sign Out
                </button>
              </>
            ) : (
              <NavLink to="/profile" className={`${navLinkClassName({ isActive: location.pathname === '/profile' })} navbar-desktop-only`}>Sign In</NavLink>
            )}
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
          <Route path="/" element={<Home />} />
          <Route path="/play" element={<Play />} />
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

      <footer className="bg-dark text-white text-center py-4 mt-5">
        <p>&copy; 2026 TypeArena. All rights reserved.</p>
        <p>Compete. Type. Win.</p>
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
