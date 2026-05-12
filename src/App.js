import './App.css';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Home from './components/Home';
import Play from './components/Play';
import Tournaments from './components/Tournaments';
import Leaderboard from './components/Leaderboard';
import Profile from './components/TypeProfile';
import AdminPanel from './components/AdminPanel';
import Marketplace from './components/Marketplace';
import Results from './components/Results';
import Notfound from './components/Notfound';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [siteMarqueeItems, setSiteMarqueeItems] = useState(DEFAULT_SITE_MARQUEE_ITEMS);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

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

  return (
    <div className="App">
      <header className="navbar navbar-expand-lg navbar-dark bg-dark sticky-top">
        <div className="container-fluid">
          <Link to="/" className="navbar-brand fw-bold">
            TypeArena
          </Link>
          <button
            className={`navbar-toggler ${menuOpen ? '' : 'collapsed'}`}
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className={`collapse navbar-collapse ${menuOpen ? 'show' : ''}`}>
            <nav className="navbar-nav ms-auto gap-2">
              <Link to="/play" className="nav-link">Play</Link>
              <Link to="/tournaments" className="nav-link">Tournaments</Link>
              <Link to="/leaderboard" className="nav-link">Leaderboard</Link>
              <Link to="/marketplace" className="nav-link">Marketplace</Link>
              {currentUser ? (
                <>
                  <Link to="/profile" className="nav-link">Profile</Link>
                  <button onClick={handleSignOut} className="nav-link btn btn-link">
                    Sign Out
                  </button>
                </>
              ) : (
                <Link to="/profile" className="nav-link">Sign In</Link>
              )}
            </nav>
          </div>
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
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play" element={<Play />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/profile" element={<Profile />} />
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
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
