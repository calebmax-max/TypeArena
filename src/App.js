import './App.css';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
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

function AppLayout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.key]);

  useEffect(() => {
    // Mock user loading - in production, fetch from API
    const user = localStorage.getItem('typearena_user');
    if (user) {
      setCurrentUser(JSON.parse(user));
    }
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem('typearena_user');
    setCurrentUser(null);
    window.location.href = '/';
  };

  return (
    <div className="App">
      <header className="navbar navbar-expand-lg navbar-dark bg-dark sticky-top">
        <div className="container-fluid">
          <Link to="/" className="navbar-brand fw-bold">
            ⚡ TypeArena
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
