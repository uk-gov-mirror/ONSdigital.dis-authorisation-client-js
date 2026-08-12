import {
  getLastInteractionTime,
  logLastInteraction,
  monitorInteraction,
  removeInteractionMonitoring,
  checkForInactivity,
} from './interaction.js';
import { getAuthState, updateAuthState } from './auth.js';

jest.useFakeTimers();

jest.mock('./auth.js', () => ({
  getAuthState: jest.fn(),
  updateAuthState: jest.fn(),
}));

const eventsToMonitor = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

describe('interaction', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.document = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
  });

  describe('getLastInteractionTime', () => {
    test('should return last_interaction_time from auth state', () => {
      getAuthState.mockReturnValue({ last_interaction_time: '2026-08-12T12:00:00.000Z' });

      const result = getLastInteractionTime();

      expect(result).toBe('2026-08-12T12:00:00.000Z');
    });

    test('should return null when auth state is null', () => {
      getAuthState.mockReturnValue(null);

      const result = getLastInteractionTime();

      expect(result).toBeNull();
    });

    test('should return undefined when auth state has no last_interaction_time', () => {
      getAuthState.mockReturnValue({});

      const result = getLastInteractionTime();

      expect(result).toBeUndefined();
    });
  });

  describe('logLastInteraction', () => {
    test('should update auth state with the current time as an ISO string', () => {
      const mockNow = new Date('2026-08-12T12:00:00.000Z');
      jest.setSystemTime(mockNow);

      logLastInteraction();

      expect(updateAuthState).toHaveBeenCalledWith({
        last_interaction_time: '2026-08-12T12:00:00.000Z',
      });
    });
  });

  describe('monitorInteraction', () => {
    test('should add an event listener for each monitored event', () => {
      const mockFn = jest.fn();

      monitorInteraction(mockFn);

      expect(document.addEventListener).toHaveBeenCalledTimes(eventsToMonitor.length);
      eventsToMonitor.forEach((event) => {
        expect(document.addEventListener).toHaveBeenCalledWith(event, mockFn);
      });
    });
  });

  describe('removeInteractionMonitoring', () => {
    test('should remove an event listener for each monitored event', () => {
      const mockFn = jest.fn();

      removeInteractionMonitoring(mockFn);

      expect(document.removeEventListener).toHaveBeenCalledTimes(eventsToMonitor.length);
      eventsToMonitor.forEach((event) => {
        expect(document.removeEventListener).toHaveBeenCalledWith(event, mockFn);
      });
    });

    test('should remove the same function reference that was registered', () => {
      const mockFn = jest.fn();

      monitorInteraction(mockFn);
      removeInteractionMonitoring(mockFn);

      eventsToMonitor.forEach((event) => {
        expect(document.removeEventListener).toHaveBeenCalledWith(event, mockFn);
      });
    });
  });

  describe('checkForInactivity', () => {
    test('should return true when inactivity duration exceeds the threshold', () => {
      const now = new Date('2026-08-12T12:15:00.000Z');
      jest.setSystemTime(now);

      // last interaction was 16 minutes ago, threshold is 15 minutes
      getAuthState.mockReturnValue({ last_interaction_time: '2026-08-12T11:59:00.000Z' });

      const result = checkForInactivity(15 * 60 * 1000);

      expect(result).toBe(true);
    });

    test('should return false when inactivity duration is within the threshold', () => {
      const now = new Date('2026-08-12T12:15:00.000Z');
      jest.setSystemTime(now);

      // last interaction was 5 minutes ago, threshold is 15 minutes
      getAuthState.mockReturnValue({ last_interaction_time: '2026-08-12T12:10:00.000Z' });

      const result = checkForInactivity(15 * 60 * 1000);

      expect(result).toBe(false);
    });

    test('should return false when inactivity duration exactly equals the threshold', () => {
      const now = new Date('2026-08-12T12:15:00.000Z');
      jest.setSystemTime(now);

      // last interaction was exactly 15 minutes ago
      getAuthState.mockReturnValue({ last_interaction_time: '2026-08-12T12:00:00.000Z' });

      const result = checkForInactivity(15 * 60 * 1000);

      expect(result).toBe(false);
    });

    test('should return false when there is no last interaction time recorded', () => {
      getAuthState.mockReturnValue(null);

      const result = checkForInactivity(15 * 60 * 1000);

      // null last interaction time should be treated as active, so returns false
      expect(result).toBe(false);
    });
  });
});
