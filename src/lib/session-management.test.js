import SessionManagement from './session-management.js';
import defaultConfig from '../config/config.js';
import {
  checkSessionStatus, renewSession, validateExpiryTime, expireSession,
} from '../utils/utils.js';
import { getAuthState, updateAuthState } from '../utils/auth.js';
import {
  monitorInteraction, removeInteractionMonitoring, checkForInactivity, logLastInteraction,
} from '../utils/interaction.js';

jest.useFakeTimers();

jest.mock('lodash/debounce.js', () => (fn) => fn);

jest.mock('../utils/auth.js', () => ({
  getAuthState: jest.fn(),
  removeAuthState: jest.fn(),
  updateAuthState: jest.fn(),
}));

jest.mock('../utils/utils.js', () => ({
  checkSessionStatus: jest.fn(),
  renewSession: jest.fn(),
  validateExpiryTime: jest.fn(),
  expireSession: jest.fn(),
}));

jest.mock('../utils/interaction.js', () => ({
  monitorInteraction: jest.fn(),
  removeInteractionMonitoring: jest.fn(),
  checkForInactivity: jest.fn(),
  logLastInteraction: jest.fn(),
}));

class LocalStorageMock {
  constructor() {
    this.store = {};
  }

  clear() {
    this.store = {};
  }

  getItem(key) {
    return this.store[key] || null;
  }

  setItem(key, value) {
    this.store[key] = String(value);
  }

  removeItem(key) {
    delete this.store[key];
  }
}

describe('SessionManagement', () => {
  let mockConfig;
  let mockOnSessionValid;
  let mockOnSessionInvalid;
  let mockOnRenewSuccess;
  let mockOnRenewFailure;

  beforeAll(() => {
    global.document = {
      dispatchEvent: jest.fn(),
      cookie: '',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    global.window = {
      localStorage: new LocalStorageMock(),
      location: { pathname: '/test-page', href: '' },
    };
  });

  beforeEach(() => {
    jest.resetAllMocks();

    mockOnSessionValid = jest.fn();
    mockOnSessionInvalid = jest.fn();
    mockOnRenewSuccess = jest.fn();
    mockOnRenewFailure = jest.fn();

    mockConfig = {
      ...defaultConfig,
      onSessionValid: mockOnSessionValid,
      onSessionInvalid: mockOnSessionInvalid,
      onRenewSuccess: mockOnRenewSuccess,
      onRenewFailure: mockOnRenewFailure,
    };

    global.window.location = { pathname: '/test-page', href: '' };
    SessionManagement.timers = {};
  });

  describe('Initialisation', () => {
    test('should initialise with a valid session and call onSessionValid', async () => {
      validateExpiryTime
        .mockImplementationOnce(() => new Date('2024-12-19T17:00:00.000Z'))
        .mockImplementationOnce(() => new Date('2024-12-20T17:00:00.000Z'));

      checkSessionStatus.mockResolvedValue({
        checkedSessionExpiryTime: null,
        checkedRefreshExpiryTime: null,
      });

      SessionManagement.init(mockConfig);
      await SessionManagement.initialiseSessionExpiryTimers(
        new Date('2024-12-19T17:00:00.000Z'),
        new Date('2024-12-20T17:00:00.000Z'),
      );

      expect(mockOnSessionValid).toHaveBeenCalledWith(
        new Date('2024-12-19T17:00:00.000Z'),
        new Date('2024-12-20T17:00:00.000Z'),
      );
    });

    test('should handle invalid session and call onSessionInvalid', async () => {
      checkSessionStatus.mockResolvedValue({
        checkedSessionExpiryTime: null,
        checkedRefreshExpiryTime: null,
      });

      SessionManagement.init(mockConfig);
      await SessionManagement.initialiseSessionExpiryTimers();

      expect(mockOnSessionInvalid).toHaveBeenCalled();
      expect(SessionManagement.timers).toEqual({});
    });

    test('should initialise with a valid config', () => {
      SessionManagement.init(mockConfig);
      expect(SessionManagement.config).toEqual(Object.freeze({ ...defaultConfig, ...mockConfig }));
    });

    test('should initialise with default config if no config provided', () => {
      SessionManagement.init();
      expect(SessionManagement.config).toEqual(Object.freeze({ ...defaultConfig }));
    });

    test('should throw an error if invalid config is provided to init', () => {
      expect(() => {
        SessionManagement.init('invalid config');
      }).toThrow('[LIBRARY] Invalid configuration object');
    });

    test('should store session expiry time in auth state when a valid expiry is provided', async () => {
      const sessionExpiry = new Date('2024-12-19T17:00:00.000Z');
      validateExpiryTime.mockReturnValue(sessionExpiry);
      checkSessionStatus.mockResolvedValue({
        checkedSessionExpiryTime: null,
        checkedRefreshExpiryTime: null,
      });

      SessionManagement.init(mockConfig);
      await SessionManagement.initialiseSessionExpiryTimers(sessionExpiry);

      expect(updateAuthState).toHaveBeenCalledWith({ session_expiry_time: sessionExpiry });
    });

    test('should start monitoring interactions after initialising timers', async () => {
      const sessionExpiry = new Date('2024-12-19T17:00:00.000Z');
      validateExpiryTime.mockReturnValue(sessionExpiry);
      checkSessionStatus.mockResolvedValue({
        checkedSessionExpiryTime: null,
        checkedRefreshExpiryTime: null,
      });

      SessionManagement.init(mockConfig);
      await SessionManagement.initialiseSessionExpiryTimers(sessionExpiry);

      expect(monitorInteraction).toHaveBeenCalledWith(SessionManagement.manageSessionActivity);
    });

    test('should start monitoring even when no expiry times are available', async () => {
      validateExpiryTime.mockReturnValue(null);
      checkSessionStatus.mockResolvedValue({
        checkedSessionExpiryTime: null,
        checkedRefreshExpiryTime: null,
      });

      SessionManagement.init(mockConfig);
      await SessionManagement.initialiseSessionExpiryTimers();

      expect(monitorInteraction).toHaveBeenCalledWith(SessionManagement.manageSessionActivity);
    });

    test('should prefer checkedSessionExpiryTime from checkSessionStatus over provided value', async () => {
      const checkedExpiry = new Date('2024-12-21T17:00:00.000Z');
      const providedExpiry = new Date('2024-12-19T17:00:00.000Z');
      checkSessionStatus.mockResolvedValue({
        checkedSessionExpiryTime: checkedExpiry,
        checkedRefreshExpiryTime: null,
      });

      SessionManagement.init(mockConfig);
      await SessionManagement.initialiseSessionExpiryTimers(providedExpiry);

      expect(updateAuthState).toHaveBeenCalledWith({ session_expiry_time: checkedExpiry });
    });
  });

  describe('Session Activity Management', () => {
    test('should call onSessionInvalid and logout when user has been inactive beyond the threshold', async () => {
      checkForInactivity.mockReturnValue(true);
      expireSession.mockResolvedValue();

      SessionManagement.init(mockConfig);
      await SessionManagement.manageSessionActivity();

      expect(mockOnSessionInvalid).toHaveBeenCalled();
      expect(expireSession).toHaveBeenCalledWith(mockConfig.apiEndpoints.expireSession);
    });

    test('should not check session renewal when user is inactive', async () => {
      checkForInactivity.mockReturnValue(true);
      expireSession.mockResolvedValue();

      SessionManagement.init(mockConfig);
      await SessionManagement.manageSessionActivity();

      expect(renewSession).not.toHaveBeenCalled();
    });

    test('should renew session when active and within the passive renewal window', async () => {
      checkForInactivity.mockReturnValue(false);

      // expires in 4 minutes — within the 5-minute passiveRenewal window
      const sessionExpiry = new Date(Date.now() + 4 * 60 * 1000);
      checkSessionStatus.mockResolvedValue({
        checkedSessionExpiryTime: sessionExpiry,
        checkedRefreshExpiryTime: null,
      });

      const newExpiry = new Date(Date.now() + 15 * 60 * 1000);
      renewSession.mockResolvedValue({ expirationTime: newExpiry.toISOString() });
      validateExpiryTime.mockReturnValue(newExpiry);
      getAuthState.mockReturnValue({ refresh_expiry_time: null });

      SessionManagement.init(mockConfig);
      await SessionManagement.manageSessionActivity();

      expect(renewSession).toHaveBeenCalled();
    });

    test('should not renew session when active but outside the passive renewal window', async () => {
      checkForInactivity.mockReturnValue(false);

      // expires in 10 minutes — outside the 5-minute passiveRenewal window
      const sessionExpiry = new Date(Date.now() + 10 * 60 * 1000);
      checkSessionStatus.mockResolvedValue({
        checkedSessionExpiryTime: sessionExpiry,
        checkedRefreshExpiryTime: null,
      });

      SessionManagement.init(mockConfig);
      await SessionManagement.manageSessionActivity();

      expect(renewSession).not.toHaveBeenCalled();
      expect(logLastInteraction).toHaveBeenCalled();
    });

    test('should log the interaction when active and no renewal needed', async () => {
      checkForInactivity.mockReturnValue(false);

      const sessionExpiry = new Date(Date.now() + 10 * 60 * 1000);
      checkSessionStatus.mockResolvedValue({
        checkedSessionExpiryTime: sessionExpiry,
        checkedRefreshExpiryTime: null,
      });

      SessionManagement.init(mockConfig);
      await SessionManagement.manageSessionActivity();

      expect(logLastInteraction).toHaveBeenCalled();
    });
  });

  describe('Session Validity', () => {
    test('should call onSessionValid with expiry times when session is valid', async () => {
      const sessionExpiry = new Date('2024-12-19T17:00:00.000Z');
      const refreshExpiry = new Date('2024-12-20T17:00:00.000Z');

      SessionManagement.init(mockConfig);
      await SessionManagement.handleSessionValidity(true, sessionExpiry, refreshExpiry);

      expect(mockOnSessionValid).toHaveBeenCalledWith(sessionExpiry, refreshExpiry);
    });

    test('should call onSessionInvalid and trigger logout when session is invalid', async () => {
      expireSession.mockResolvedValue();

      SessionManagement.init(mockConfig);
      await SessionManagement.handleSessionValidity(false);

      expect(mockOnSessionInvalid).toHaveBeenCalled();
      expect(expireSession).toHaveBeenCalled();
    });
  });

  describe('Session Monitoring', () => {
    test('should register manageSessionActivity as the interaction handler', () => {
      SessionManagement.monitorInteractionsForSessionActivity();

      expect(monitorInteraction).toHaveBeenCalledWith(SessionManagement.manageSessionActivity);
    });

    test('should deregister manageSessionActivity when removeTimers is called', () => {
      SessionManagement.removeTimers();

      expect(removeInteractionMonitoring).toHaveBeenCalledWith(SessionManagement.manageSessionActivity);
    });
  });
  describe('Session Renewal', () => {
    test('should handle successful session renewal and call onRenewSuccess', async () => {
      renewSession.mockResolvedValue({
        expirationTime: '2024-12-30T13:00:00+0000 UTC',
      });
      validateExpiryTime.mockReturnValue(new Date('2024-12-30T13:00:00.000Z'));
      getAuthState.mockReturnValue({ refresh_expiry_time: new Date('2024-12-30T12:00:00.000Z') });

      SessionManagement.init(mockConfig);
      await SessionManagement.refreshSession();

      expect(renewSession).toHaveBeenCalled();
      expect(mockOnRenewSuccess).toHaveBeenCalledWith(
        new Date('2024-12-30T13:00:00.000Z'),
        new Date('2024-12-30T12:00:00.000Z'),
      );
    });

    test('should call onRenewFailure when session renewal returns null', async () => {
      renewSession.mockResolvedValue(null);

      SessionManagement.init(mockConfig);
      await SessionManagement.refreshSession();

      expect(renewSession).toHaveBeenCalled();
      expect(mockOnRenewFailure).toHaveBeenCalled();
    });

    test('should call onRenewFailure when session renewal throws', async () => {
      const error = new Error('Session renewal failed');
      renewSession.mockRejectedValue(error);

      SessionManagement.init(mockConfig);
      await SessionManagement.refreshSession();

      expect(renewSession).toHaveBeenCalled();
      expect(mockOnRenewFailure).toHaveBeenCalledWith(error);
    });

    test('should update session expiry time in auth state after successful renewal', async () => {
      const newExpiry = new Date('2024-12-30T13:00:00.000Z');
      renewSession.mockResolvedValue({ expirationTime: newExpiry.toISOString() });
      validateExpiryTime.mockReturnValue(newExpiry);
      getAuthState.mockReturnValue({ refresh_expiry_time: null });

      SessionManagement.init(mockConfig);
      await SessionManagement.refreshSession();

      expect(updateAuthState).toHaveBeenCalledWith({ session_expiry_time: newExpiry });
    });
  });

  describe('Logout', () => {
    test('should call expireSession with the configured endpoint', async () => {
      expireSession.mockResolvedValue();

      SessionManagement.init(mockConfig);
      await SessionManagement.logout();

      expect(expireSession).toHaveBeenCalledWith(mockConfig.apiEndpoints.expireSession);
    });

    test('should clear auth state on logout', async () => {
      expireSession.mockResolvedValue();

      SessionManagement.init(mockConfig);
      await SessionManagement.logout();

      expect(removeInteractionMonitoring).toHaveBeenCalled();
    });

    test('should redirect to loginUrl with current path as next param', async () => {
      expireSession.mockResolvedValue();
      global.window.location = { pathname: '/some/page', href: '' };

      SessionManagement.init(mockConfig);
      await SessionManagement.logout();

      expect(global.window.location.href).toBe(
        `${mockConfig.loginUrl}?next=${encodeURIComponent('/some/page')}`,
      );
    });
  });
});
