const defaultConfig = {
  timeOffsets: {
    passiveRenewal: 300000, // 5 minutes
    inactivityThreshold: 900000, // 15 minutes
  },
  onRenewSuccess: (sessionExpiryTime, refreshExpiryTime) => console.debug(
    `[LIBRARY] Session renewed successfully. Session: ${sessionExpiryTime} and refresh: ${refreshExpiryTime}`,
  ),
  onRenewFailure: () => console.warn('[LIBRARY] Session renewal failed'),
  onSessionValid: (sessionExpiryTime, refreshExpiryTime) => console.debug(
    `[LIBRARY] Session Valid. Session: ${sessionExpiryTime} and refresh: ${refreshExpiryTime}`,
  ),
  onSessionInvalid: () => console.warn('[LIBRARY] Session is invalid'),
  onError: (error) => console.error('[LIBRARY] Error:', error),
  loginUrl: '/florence/login',
  apiEndpoints: {
    expireSession: '/api/v1/tokens/self',
    renewSession: '/api/v1/tokens/self',
  },
};

export default defaultConfig;
