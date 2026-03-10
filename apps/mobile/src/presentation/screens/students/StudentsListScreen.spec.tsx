import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { StudentsListScreen } from './StudentsListScreen';
import * as studentApi from '../../../infra/student/student-api';
import { ok, err } from '../../../domain/common/result';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

jest.mock('../../../infra/student/student-api', () => ({
  listStudents: jest.fn(),
  createStudent: jest.fn(),
  updateStudent: jest.fn(),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: jest.fn(),
}));

const mockListStudents = studentApi.listStudents as jest.Mock;

function makeStudentItem(overrides = {}) {
  return {
    id: 's1',
    academyId: 'a1',
    fullName: 'Test Student',
    dateOfBirth: '2010-01-01',
    gender: 'MALE',
    address: {
      line1: '123 St',
      line2: null,
      city: 'Mumbai',
      state: 'MH',
      pincode: '400001',
    },
    guardian: { name: 'Parent', mobile: '+919876543210', email: 'p@test.com' },
    joiningDate: '2024-01-01',
    monthlyFee: 500,
    mobileNumber: null,
    email: null,
    status: 'ACTIVE',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeListResponse(items = [makeStudentItem()]) {
  return {
    data: items,
    meta: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 },
  };
}

describe('StudentsListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows skeleton on load', async () => {
    let resolvePromise: (v: unknown) => void;
    const pending = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockListStudents.mockReturnValue(pending);

    render(<StudentsListScreen />);

    expect(screen.getByTestId('skeleton-container')).toBeTruthy();

    await act(async () => {
      resolvePromise!(ok(makeListResponse()));
    });
  });

  it('shows student rows on success', async () => {
    mockListStudents.mockResolvedValue(ok(makeListResponse()));

    render(<StudentsListScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('student-row-s1')).toBeTruthy();
    });

    expect(screen.getByText('Test Student')).toBeTruthy();
  });

  it('shows error with retry on API failure', async () => {
    mockListStudents.mockResolvedValue(
      err({ code: 'NETWORK', message: 'Network error. Please check your connection.' }),
    );

    render(<StudentsListScreen />);

    await waitFor(() => {
      expect(screen.getByText('Network error. Please check your connection.')).toBeTruthy();
    });

    expect(screen.getByTestId('retry-button')).toBeTruthy();
  });

  it('filter chip interactions change filters', async () => {
    mockListStudents.mockResolvedValue(ok(makeListResponse()));

    render(<StudentsListScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('student-row-s1')).toBeTruthy();
    });

    // Open filter panel first
    fireEvent.press(screen.getByTestId('filter-button'));

    fireEvent.press(screen.getByTestId('status-chip-active'));

    await waitFor(() => {
      const calls = mockListStudents.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0].status).toBe('ACTIVE');
    });
  });

  it('debounces search input', async () => {
    mockListStudents.mockResolvedValue(ok(makeListResponse()));

    render(<StudentsListScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('student-row-s1')).toBeTruthy();
    });

    // Open search first
    fireEvent.press(screen.getByTestId('search-button'));

    const callCountBefore = mockListStudents.mock.calls.length;

    fireEvent.changeText(screen.getByTestId('search-input'), 'test');

    // Before debounce fires, no new call
    expect(mockListStudents.mock.calls.length).toBe(callCountBefore);

    // After debounce
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => {
      const calls = mockListStudents.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0].search).toBe('test');
    });
  });

  it('add button navigates to form', async () => {
    mockListStudents.mockResolvedValue(ok(makeListResponse()));

    render(<StudentsListScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('student-row-s1')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('add-student-button'));

    expect(mockNavigate).toHaveBeenCalledWith('StudentForm', { mode: 'create' });
  });
});
