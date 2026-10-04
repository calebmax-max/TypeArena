import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as schoolApi from '../utils/typingApi';
import SchoolDashboard from './SchoolDashboard';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => mockNavigate,
}));

jest.mock('../utils/typingApi', () => ({
  acceptSchoolInvitation: jest.fn(),
  createSchoolAssignment: jest.fn(),
  createSchoolClass: jest.fn(),
  createSchoolOrganisation: jest.fn(),
  createSchoolRace: jest.fn(),
  exportSchoolClass: jest.fn(),
  fetchSchoolAssignments: jest.fn(),
  fetchSchoolClass: jest.fn(),
  fetchSchoolInvitationsForMe: jest.fn(),
  fetchSchoolOrganizationMembers: jest.fn(),
  fetchSchoolOverview: jest.fn(),
  importSchoolLearners: jest.fn(),
  inviteSchoolTeacher: jest.fn(),
  joinSchoolClass: jest.fn(),
  manageSchoolMember: jest.fn(),
  regenerateSchoolJoinCode: jest.fn(),
  removeSchoolOrganizationMember: jest.fn(),
  updateSchoolMemberRole: jest.fn(),
  updateSchoolOrganisationSettings: jest.fn(),
}));

test('organisation admins can create their first class without selecting an existing class', async () => {
  let overview = {
    organizations: [{ id: 7, name: 'North School', role: 'org_admin', settings: {} }],
    classes: [],
  };
  schoolApi.fetchSchoolOverview.mockImplementation(async () => overview);
  schoolApi.fetchSchoolAssignments.mockResolvedValue({ assignments: [] });
  schoolApi.fetchSchoolInvitationsForMe.mockResolvedValue({ invitations: [] });
  schoolApi.fetchSchoolOrganizationMembers.mockResolvedValue({ members: [] });
  schoolApi.createSchoolClass.mockImplementation(async (organizationId, name) => {
    overview = {
      ...overview,
      classes: [{ id: 11, organizationId, name, learnerCount: 0, joinCode: 'A1B2C3' }],
    };
    return { class: { id: 11, organizationId, name } };
  });

  render(<SchoolDashboard currentUser={{ id: 3 }} />);

  expect(await screen.findByRole('heading', { name: 'North School' })).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText('Class name'), { target: { value: 'Room A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create class' }));

  await waitFor(() => expect(schoolApi.createSchoolClass).toHaveBeenCalledWith(7, 'Room A'));
  expect(await screen.findByText('Room A', { selector: 'button' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Class created.');
});

test('start class race creates a private room and opens its lobby', async () => {
  schoolApi.fetchSchoolOverview.mockResolvedValue({
    organizations: [{ id: 7, name: 'North School', role: 'org_admin', settings: {} }],
    classes: [{ id: 11, organizationId: 7, name: 'Room A', learnerCount: 1, joinCode: 'A1B2C3' }],
  });
  schoolApi.fetchSchoolAssignments.mockResolvedValue({ assignments: [] });
  schoolApi.fetchSchoolInvitationsForMe.mockResolvedValue({ invitations: [] });
  schoolApi.fetchSchoolClass.mockResolvedValue({
    class: { id: 11, organizationId: 7, name: 'Room A' },
    role: 'org_admin',
    learners: [{ id: 15, username: 'student', wpm: 30, accuracy: 95, status: 'active' }],
    assignments: [],
    analytics: { learnerCount: 1, pendingCount: 0, averageWpm: 30, completionCount: 0 },
  });
  schoolApi.createSchoolRace.mockResolvedValue({ room: { id: 'class-room-11' } });

  render(<SchoolDashboard currentUser={{ id: 3 }} />);

  fireEvent.click(await screen.findByRole('button', { name: /Room A/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Start class race' }));

  await waitFor(() => expect(schoolApi.createSchoolRace).toHaveBeenCalledWith(11));
  expect(mockNavigate).toHaveBeenCalledWith('/play?room=class-room-11&schoolClassId=11');
});

test('learner assignment launches a solo practice session with its assignment ids', async () => {
  schoolApi.fetchSchoolOverview.mockResolvedValue({
    organizations: [{ id: 7, name: 'North School', role: 'learner', settings: {} }],
    classes: [{ id: 11, organizationId: 7, name: 'Room A', learnerCount: 1, joinCode: 'A1B2C3' }],
  });
  schoolApi.fetchSchoolAssignments.mockResolvedValue({
    assignments: [{ id: 23, classId: 11, className: 'Room A', title: 'Typing lesson', status: 'pending' }],
  });
  schoolApi.fetchSchoolInvitationsForMe.mockResolvedValue({ invitations: [] });
  schoolApi.fetchSchoolClass.mockResolvedValue({
    class: { id: 11, organizationId: 7, name: 'Room A' },
    role: 'learner',
    learners: [{ id: 15, username: 'student', wpm: 30, accuracy: 95, status: 'active' }],
    assignments: [{ id: 23, title: 'Typing lesson', targetWpm: 30, targetAccuracy: 95, mySubmission: null }],
    analytics: { learnerCount: 1, pendingCount: 0, averageWpm: 30, completionCount: 0 },
  });

  render(<SchoolDashboard currentUser={{ id: 15 }} />);

  fireEvent.click(await screen.findByRole('button', { name: /Room A/ }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Room A' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Assignments' }));

  const assignmentLinks = await screen.findAllByRole('link', { name: 'Start assignment' });
  expect(assignmentLinks.length).toBeGreaterThan(0);
  assignmentLinks.forEach((link) => {
    expect(link.getAttribute('href')).toBe('/practice?schoolClassId=11&assignmentId=23');
  });
});
