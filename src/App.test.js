import { render, screen, waitFor, within } from '@testing-library/react';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

jest.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }) => children,
  Routes: ({ children }) => <div>{children}</div>,
  Route: ({ element, path }) => <div data-route-path={path}>{element}</div>,
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  NavLink: ({ children, to, className, ...props }) => (
    <a href={to} className={typeof className === 'function' ? className({ isActive: false }) : className} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ({
    pathname: '/',
    key: 'test',
  }),
  useNavigate: () => jest.fn(),
  useParams: () => ({ roomId: 'test-room' }),
}), { virtual: true });

jest.mock('./utils/typingApi', () => ({
  ...jest.requireActual('./utils/typingApi'),
  fetchSiteMarquee: jest.fn().mockResolvedValue({ items: [] }),
}));
jest.mock('./utils/navigationPrefetch', () => ({
  preloadPlayContent: jest.fn(),
  preloadRoute: jest.fn(),
  warmNavigation: jest.fn(),
}));
jest.mock('./components/Play', () => () => <div>Play Page</div>);
jest.mock('./components/TypeProfile', () => () => <div>Profile Page</div>);
jest.mock('./components/AdminPanel', () => () => <div>Admin Page</div>);
jest.mock('./components/SchoolDashboard', () => () => <div>School Dashboard</div>);
jest.mock('./components/Certification', () => ({
  __esModule: true,
  default: () => <div>Certification Page</div>,
  CertificateVerification: () => <div>Certificate Verification Page</div>,
}));
jest.mock('./components/Marketplace', () => () => <div>Marketplace Page</div>);
jest.mock('./components/Results', () => () => <div>Results Page</div>);
jest.mock('./components/Notfound', () => () => <div>Not Found</div>);

import App from './App';

test('renders the current TypeArena navigation and home content', async () => {
  render(<App />);

  await waitFor(() => expect(screen.getByRole('link', { name: 'Practice' })).toBeInTheDocument());
  expect(screen.getAllByText(/typearena/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/sign in/i).length).toBeGreaterThan(0);
  expect(within(screen.getByRole('navigation', { name: 'Primary navigation' }))
    .getByRole('link', { name: 'Practice' })).toHaveAttribute('href', '/play');
  expect(screen.queryByRole('link', { name: 'Skills Lab' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Tournaments' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Leaderboard' })).not.toBeInTheDocument();
  expect(document.querySelector('.site-marquee')).not.toBeInTheDocument();
});

test('registers the practice page at /play and removes competitive routes', () => {
  render(<App />);

  expect(document.querySelector('[data-route-path="/play"]')).toBeInTheDocument();
  expect(document.querySelector('[data-route-path="/tasks"]')).not.toBeInTheDocument();
  expect(document.querySelector('[data-route-path="/tournaments"]')).not.toBeInTheDocument();
  expect(document.querySelector('[data-route-path="/leaderboard"]')).not.toBeInTheDocument();
});

