import { render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }) => children,
  Routes: ({ children }) => <div>{children}</div>,
  Route: ({ element }) => element,
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ({
    pathname: '/',
    key: 'test',
  }),
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock('./components/Play', () => () => <div>Play Page</div>);
jest.mock('./components/Tournaments', () => () => <div>Tournaments Page</div>);
jest.mock('./components/Leaderboard', () => () => <div>Leaderboard Page</div>);
jest.mock('./components/TypeProfile', () => () => <div>Profile Page</div>);
jest.mock('./components/AdminPanel', () => () => <div>Admin Page</div>);
jest.mock('./components/Marketplace', () => () => <div>Marketplace Page</div>);
jest.mock('./components/Results', () => () => <div>Results Page</div>);
jest.mock('./components/Notfound', () => () => <div>Not Found</div>);

import App from './App';

test('renders the current TypeArena navigation and home content', () => {
  render(<App />);

  expect(screen.getAllByText(/typearena/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/start typing/i)).toBeInTheDocument();
  expect(screen.getAllByText(/private friend battles are live now/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/sign in/i)).toBeInTheDocument();
});
