import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as schoolApi from '../utils/typingApi';
import SchoolDashboard from './SchoolDashboard';

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
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
