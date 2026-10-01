import { render, screen, waitFor } from '@testing-library/react';

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
  Route: ({ element }) => element,
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
jest.mock('./components/Tournaments', () => () => <div>Tournaments Page</div>);
jest.mock('./components/Leaderboard', () => () => <div>Leaderboard Page</div>);
jest.mock('./components/TypeProfile', () => () => <div>Profile Page</div>);
jest.mock('./components/AdminPanel', () => () => <div>Admin Page</div>);
jest.mock('./components/Marketplace', () => () => <div>Marketplace Page</div>);
jest.mock('./components/Results', () => () => <div>Results Page</div>);
jest.mock('./components/Notfound', () => () => <div>Not Found</div>);

import App from './App';
import { shouldKeepTourVisible, shouldShowOnboardingTour } from './OnboardingTour';

test('renders the current TypeArena navigation and home content', async () => {
  render(<App />);

  await waitFor(() => expect(screen.getByText(/start typing/i)).toBeInTheDocument());
  expect(screen.getAllByText(/typearena/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/private friend battles are live now/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/sign in/i).length).toBeGreaterThan(0);
});

test('shows onboarding for signed-out visitors on the home page', () => {
  expect(shouldShowOnboardingTour({ pathname: '/', currentUser: null })).toBe(true);
  expect(shouldShowOnboardingTour({ pathname: '/', currentUser: { id: 1 } })).toBe(false);
  expect(shouldShowOnboardingTour({ pathname: '/', currentUser: undefined })).toBe(false);
  expect(shouldShowOnboardingTour({ pathname: '/play', currentUser: null })).toBe(false);
});

test('keeps the tour visible only on the intended target page', () => {
  expect(shouldKeepTourVisible({ active: true, step: { route: '/play' }, pathname: '/play' })).toBe(true);
  expect(shouldKeepTourVisible({ active: true, step: { route: '/play' }, pathname: '/leaderboard' })).toBe(false);
  expect(shouldKeepTourVisible({ active: true, step: null, pathname: '/play' })).toBe(true);
});
