import {
  createDefaultExpiryTimes,
  checkSessionStatus,
  renewSession,
  expireSession,
  isSessionExpired,
  validateExpiryTime,
} from './utils.js';
import { getAuthState } from './auth.js';
import defaultConfig from '../config/config.js';

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

global.window = {};
global.window.localStorage = new LocalStorageMock();

global.document = {};

jest.mock('./auth.js', () => ({
  getAuthState: jest.fn(),
}));

describe('Utils', () => {
  beforeEach(() => {
    global.window.localStorage.clear();
    getAuthState.mockClear();
    jest.resetAllMocks();
  });

  describe('createDefaultExpiryTimes', () => {
    test('should create valid session and refresh expiry times', () => {
      const result = createDefaultExpiryTimes(12);

      const now = new Date();
      const expectedExpiry = new Date(now.setHours(now.getHours() + 12));

      expect(result).toHaveProperty('session_expiry_time');
      expect(result).toHaveProperty('refresh_expiry_time');

      const marginOfError = 10; // milliseconds
      expect(Math.abs(result.session_expiry_time - expectedExpiry)).toBeLessThanOrEqual(marginOfError);
      expect(Math.abs(result.refresh_expiry_time - expectedExpiry)).toBeLessThanOrEqual(marginOfError);
    });
  });

  describe('isSessionExpired', () => {
    test('should return false if session time has not expired', async () => {
      const sessionExpiryTime = new Date().getTime() + 30 * 60 * 1000; // 30 minutes in the future
      expect(await isSessionExpired(sessionExpiryTime)).toBe(false);
    });

    test('should return true if session time has expired', async () => {
      const sessionExpiryTime = new Date().getTime() - 30 * 60 * 1000; // 30 minutes in the past
      expect(await isSessionExpired(sessionExpiryTime)).toBe(true);
    });

    test('should return true if sessionExpiryTime is null and checkSessionStatus returns null', async () => {
      getAuthState.mockReturnValue({ session_expiry_time: null });

      await expect(isSessionExpired(null)).resolves.toBe(true);
    });

    test('should return false if sessionExpiryTime is null and checkSessionStatus returns a future date', async () => {
      const checkedSessionExpiryTime = new Date().getTime() + 30 * 60 * 1000; // 30 minutes in the future
      getAuthState.mockReturnValue({ session_expiry_time: checkedSessionExpiryTime });

      await expect(isSessionExpired(null)).resolves.toBe(false);
    });

    test('should return true if sessionExpiryTime is null and checkSessionStatus returns a past date', async () => {
      const checkedSessionExpiryTime = new Date().getTime() - 30 * 60 * 1000; // 30 minutes in the past
      getAuthState.mockReturnValue({ session_expiry_time: checkedSessionExpiryTime });

      await expect(isSessionExpired(null)).resolves.toBe(true);
    });

    test('should throw an error if diffInSeconds is NaN', async () => {
      const sessionExpiryTime = 'invalid date';

      await expect(isSessionExpired(sessionExpiryTime)).rejects.toThrow(
        'encounted an error checking time interval: diffInSeconds is NaN',
      );
    });
  });

  describe('validateExpiryTime', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should return null for invalid input', () => {
      expect(validateExpiryTime(null)).toBeNull();
      expect(validateExpiryTime(undefined)).toBeNull();
      expect(validateExpiryTime()).toBeNull();
    });

    test('should return converted date when given a valid unconverted date', () => {
      const validDate = new Date('2025-01-16T00:00:00.000Z');

      const result = validateExpiryTime('Thu Jan 16 2025 00:00:00 GMT+0000');
      expect(result).toEqual(validDate);
    });

    test('should return null and log error when given an invalid date', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = validateExpiryTime('invalid date');
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith('[LIBRARY] Invalid format:', expect.any(Date));

      consoleErrorSpy.mockRestore();
    });
  });

  describe('checkSessionStatus', () => {
    test('should return session expiry time from auth state', async () => {
      const mockSessionExpiryTime = new Date().getTime() + 3600 * 1000; // 1 hour in the future
      const mockRefreshExpiryTime = new Date().getTime() + 7200 * 1000; // 2 hours in the future
      getAuthState.mockReturnValue({
        session_expiry_time: mockSessionExpiryTime,
        refresh_expiry_time: mockRefreshExpiryTime,
      });

      const result = await checkSessionStatus();
      expect(result).toEqual({
        checkedSessionExpiryTime: mockSessionExpiryTime,
        checkedRefreshExpiryTime: mockRefreshExpiryTime,
      });
    });

    test('should return session expiry time from id token in cookie', async () => {
      const mockRefreshExpiryTime = new Date().getTime() + 7200 * 1000; // 2 hours in the future
      getAuthState.mockReturnValue({
        refresh_expiry_time: mockRefreshExpiryTime,
      });
      const mockDecodedToken = { exp: Math.floor(Date.now() / 1000) + 3600 }; // 1 hour in the future
      const mockIDToken = `header.${Buffer.from(JSON.stringify(mockDecodedToken)).toString('base64')}.signature`;
      document.cookie = `id_token=${mockIDToken}`;

      const result = await checkSessionStatus();
      expect(result).toEqual({
        checkedSessionExpiryTime: new Date(mockDecodedToken.exp * 1000),
        checkedRefreshExpiryTime: mockRefreshExpiryTime,
      });
    });

    test('should return null if id token decoding fails', async () => {
      getAuthState.mockReturnValue(null);
      document.cookie = 'id_token=invalid-token';

      const result = await checkSessionStatus();
      expect(result).toEqual({
        checkedSessionExpiryTime: null,
        checkedRefreshExpiryTime: null,
      });
    });

    test('should return null if no session expiry time is found', async () => {
      getAuthState.mockReturnValue(null);
      document.cookie = '';

      const result = await checkSessionStatus();
      expect(result).toEqual({
        checkedSessionExpiryTime: null,
        checkedRefreshExpiryTime: null,
      });
    });
  });

  describe('renewSession', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    test('should send session renewal request and return data on success', async () => {
      const mockBody = { test: 'data' };
      const mockResponse = { expirationTime: '2024-12-31T23:59:59.000Z' };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await renewSession(defaultConfig.apiEndpoints.renewSession, mockBody);
      expect(fetch).toHaveBeenCalledWith(defaultConfig.apiEndpoints.renewSession, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockBody),
      });
      expect(result).toEqual(mockResponse);
    });

    test('should throw an error on failed session renewal', async () => {
      global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(renewSession({})).rejects.toThrow('Failed to renew session');
    });
  });

  describe('expireSession', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    test('should send a DELETE request to the expire session endpoint', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true });

      await expireSession('/api/v1/tokens/self');

      expect(fetch).toHaveBeenCalledWith('/api/v1/tokens/self', { method: 'DELETE' });
    });

    test('should resolve without error on a successful response', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true });

      await expect(expireSession('/api/v1/tokens/self')).resolves.toBeUndefined();
    });

    test('should throw an error when the response is not ok', async () => {
      global.fetch.mockResolvedValueOnce({ ok: false, status: 401 });

      await expect(expireSession('/api/v1/tokens/self')).rejects.toThrow('Failed to expire session');
    });
  });
});
