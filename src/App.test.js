import { render, screen } from '@testing-library/react';

jest.mock('axios', () => ({
  get: jest.fn(() => Promise.resolve({
    data: {
      user: null,
      expires_in: 28800,
    },
  })),
}), { virtual: true });

jest.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }) => children,
  Routes: ({ children }) => <div>{children}</div>,
  Route: ({ element }) => element,
  Navigate: () => <div>Redirect</div>,
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  NavLink: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ({
    pathname: '/',
    hash: '',
    key: 'test',
  }),
}), { virtual: true });

jest.mock('./components/Home', () => () => <div>Home Page</div>);
jest.mock('./components/Signup', () => () => <div>Signup Page</div>);
jest.mock('./components/Notfound', () => () => <div>Not Found</div>);
jest.mock('./components/Makepayment', () => () => <div>Payment Page</div>);
jest.mock('./components/Rooms', () => () => <div>Rooms Page</div>);
jest.mock('./components/RoomDetails', () => () => <div>Room Details</div>);
jest.mock('./components/Dining', () => () => <div>Dining Page</div>);
jest.mock('./components/Bookings', () => () => <div>Bookings Page</div>);
jest.mock('./components/Contactus', () => () => <div>Contact Us Page</div>);
jest.mock('./components/EventInquiry', () => () => <div>Event Inquiry</div>);

import App from './App';

test('renders the hotel brand', () => {
  render(<App />);
  expect(screen.getAllByText(/elitehotels/i).length).toBeGreaterThan(0);
});
