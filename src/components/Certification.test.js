import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { CertificateVerification } from './Certification';
import { verifyCertificate } from '../utils/typingApi';

jest.mock('react-router-dom', () => ({
  Link: ({ children, ...props }) => <a {...props}>{children}</a>,
  useParams: () => ({ certificateId: 'TA-123ABC' }),
}));

jest.mock('../utils/typingApi', () => ({
  getStoredUserSnapshot: jest.fn(() => null),
  startCertification: jest.fn(),
  submitCertification: jest.fn(),
  verifyCertificate: jest.fn(),
}));

test('public verification page displays only the verification facts', async () => {
  verifyCertificate.mockResolvedValue({
    certificateId: 'TA-123ABC',
    status: 'valid',
    playerName: 'Test Player',
    wpm: 52.4,
    accuracy: 97.8,
    testDate: '2026-10-04T12:00:00',
    testDurationSeconds: 180,
    minimumWpm: 40,
    minimumAccuracy: 95,
    minimumCharacters: 600,
    statement: 'Verified test conditions.',
  });

  render(<CertificateVerification />);

  await waitFor(() => expect(screen.getByText('Test Player')).toBeInTheDocument());
  expect(screen.getByText('TA-123ABC')).toBeInTheDocument();
  expect(screen.getByText('52.4 WPM')).toBeInTheDocument();
  expect(screen.getByText('97.8%')).toBeInTheDocument();
  expect(screen.getByText('Verified test conditions.')).toBeInTheDocument();
});
