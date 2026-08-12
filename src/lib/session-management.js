import fp from 'lodash/fp.js';
import debounce from 'lodash/debounce.js';
import defaultConfig from '../config/config.js';
import {
  checkSessionStatus, renewSession, validateExpiryTime, expireSession,
} from '../utils/utils.js';
import { updateAuthState, getAuthState, removeAuthState } from '../utils/auth.js';
import {
  monitorInteraction, removeInteractionMonitoring, checkForInactivity, logLastInteraction,
} from '../utils/interaction.js';

class SessionManagement {
  static instance;

  constructor() {
    if (SessionManagement.instance) {
      throw new Error('Use SessionManagement.getInstance() to get the single instance of this class.');
    }

    this.config = {};
    this.eventsToMonitor = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

    // Bind methods to the instance
    this.refreshSession = this.refreshSession.bind(this);
    this.monitorInteractionsForSessionActivity = this.monitorInteractionsForSessionActivity.bind(this);
    this.manageSessionActivity = debounce(this.manageSessionActivity.bind(this), 500);

    SessionManagement.instance = this;
  }

  static getInstance() {
    if (!SessionManagement.instance) {
      SessionManagement.instance = new SessionManagement();
    }
    return SessionManagement.instance;
  }

  init(config = defaultConfig) {
    if (typeof config !== 'object') {
      throw new Error('[LIBRARY] Invalid configuration object');
    }
    this.config = Object.freeze({ ...defaultConfig, ...config });
    console.debug('[LIBRARY] Initialising session management with config:', this.config);
  }

  setSessionExpiryTime(sessionExpiryTime, refreshExpiryTime) {
    console.debug('[LIBRARY] Setting session expiry time');
    this.initialiseSessionExpiryTimers(sessionExpiryTime, refreshExpiryTime);
  }

  async initialiseSessionExpiryTimers(sessionExpiryTime, refreshExpiryTime) {
    console.debug('[LIBRARY] init config: ', this.config);
    if (!this.config || Object.keys(this.config).length === 0) {
      console.debug('[LIBRARY] No config found, initialising with default config');
      this.init(this.config);
    }

    try {
      console.debug('[LIBRARY] Checking initial session state');
      const { checkedSessionExpiryTime, checkedRefreshExpiryTime } = await checkSessionStatus();

      const finalSessionExpiryTime = checkedSessionExpiryTime || validateExpiryTime(sessionExpiryTime);
      const finalRefreshExpiryTime = checkedRefreshExpiryTime || validateExpiryTime(refreshExpiryTime);

      console.debug('[LIBRARY] sessionExpiryTime: ', finalSessionExpiryTime);
      console.debug('[LIBRARY] refreshExpiryTime: ', finalRefreshExpiryTime);

      if (finalSessionExpiryTime) {
        console.debug(`[LIBRARY] Session expiry time: ${finalSessionExpiryTime}`);
        SessionManagement.startSessionTimer(finalSessionExpiryTime);
        this.handleSessionValidity(true, finalSessionExpiryTime, finalRefreshExpiryTime);
      } else {
        console.debug('[LIBRARY] No session expiry time found, handling session as invalid');
        this.handleSessionValidity(false);
      }

      this.monitorInteractionsForSessionActivity();
    } catch (error) {
      console.error('[LIBRARY] Failed to initialise session expiry timers:', error);
      this.handleSessionValidity(false);
    }
  }

  async handleSessionValidity(isValid, sessionExpiryTime, refreshExpiryTime) {
    const { onSessionValid, onSessionInvalid } = this.config;

    if (isValid && onSessionValid) {
      onSessionValid(sessionExpiryTime, refreshExpiryTime);
      return;
    }

    if (!isValid && onSessionInvalid) {
      onSessionInvalid();
      try {
        await this.logout();
      } catch (error) {
        console.error('[LIBRARY] Logout failed:', error);
        if (this.config.onError) this.config.onError(error);
      }

      return;
    }

    console.debug(`[LIBRARY] No ${isValid ? 'onSessionValid' : 'onSessionInvalid'} callback provided.`);
  }

  async manageSessionActivity() {
    // first check to see if the user has been inactive for longer than the inactivity threshold
    if (checkForInactivity(this.config.timeOffsets.inactivityThreshold)) {
      console.debug('[LIBRARY] User has been inactive for longer than the inactivity threshold, handling session as invalid');
      await this.handleSessionValidity(false);
      return;
    }
    const { checkedSessionExpiryTime } = await checkSessionStatus();
    if (!checkedSessionExpiryTime) {
      console.debug('[LIBRARY] No session expiry time found, handling session as invalid');
      await this.handleSessionValidity(false);
      return;
    }

    const sessionRenewalTime = new Date(checkedSessionExpiryTime).getTime() - this.config.timeOffsets.passiveRenewal;

    if (checkedSessionExpiryTime > 0 && sessionRenewalTime < Date.now()) {
      console.debug('[LIBRARY] Session renewal time has passed, attempting to refresh session');
      console.debug('[LIBRARY] Session expiry time: ', sessionRenewalTime);
      await this.refreshSession();
    }
    console.debug('[LIBRARY] Logging user interaction');
    logLastInteraction();
  }

  monitorInteractionsForSessionActivity() {
    console.debug('[LIBRARY] Monitoring for user interaction to manage session activity');
    monitorInteraction(this.manageSessionActivity);
  }

  static startSessionTimer(sessionExpiryTime) {
    updateAuthState({ session_expiry_time: sessionExpiryTime });
  }

  async refreshSession() {
    console.debug('[LIBRARY] Refreshing session');
    const renewError = (error) => {
      console.error("[LIBRARY] an unexpected error has occurred when extending the user's session: ", error);
      if (error != null) {
        if (this.config.onRenewFailure) {
          this.config.onRenewFailure(error);
        }
      }
    };
    try {
      const response = await renewSession(this.config.apiEndpoints.renewSession);
      if (response) {
        let expirationTime = fp.get('expirationTime')(response);
        console.debug(
          '[LIBRARY] Session renewed successfully, new expiration time:',
          expirationTime,
        );
        expirationTime = validateExpiryTime(expirationTime);
        console.debug(
          '[LIBRARY] Session renewed successfully, new converted expiration time:',
          expirationTime,
        );
        SessionManagement.startSessionTimer(expirationTime);
        if (this.config.onRenewSuccess) {
          const refreshExpiryTime = fp.get('refresh_expiry_time')(getAuthState());
          this.config.onRenewSuccess(expirationTime, refreshExpiryTime);
        }
      } else {
        renewError('Session renewal failed');
      }
    } catch (error) {
      renewError(error);
    }
  }

  async logout() {
    try {
      await expireSession(this.config.apiEndpoints.expireSession);
    } catch (error) {
      console.error('[LIBRARY] Failed to expire session:', error);
      if (this.config.onError) this.config.onError(error);
    }
    // Even if the expire session request fails, we still want to clear the auth state and redirect the user to the login page.
    this.removeTimers();
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `${this.config.loginUrl}?next=${next}`;
  }

  removeTimers() {
    removeInteractionMonitoring(this.manageSessionActivity);
    removeAuthState();
  }
}

// Export a single instance of SessionManagement
const sessionManagementInstance = SessionManagement.getInstance();
export default sessionManagementInstance;
