import fp from 'lodash/fp.js';
import { getAuthState } from './auth.js';

export function createDefaultExpiryTimes(hours) {
  console.debug('[LIBRARY] Creating default expiry times for', hours, 'hours');
  const now = new Date();
  const expiry = now.setHours(now.getHours() + hours);
  return {
    session_expiry_time: new Date(expiry),
    refresh_expiry_time: new Date(expiry),
  };
}

function getCookieByName(name) {
  console.debug('[LIBRARY] Getting cookie by name:', name);
  const cookies = document.cookie;
  if (!cookies) {
    return null;
  }
  const cookie = cookies.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return cookie ? cookie.substring(name.length + 1) : null;
}

export async function checkSessionStatus() {
  console.debug('[LIBRARY] Checking initial session status');
  const authState = getAuthState();
  const sessionExpiryTime = fp.get('session_expiry_time')(authState);
  const refreshExpiryTime = fp.get('refresh_expiry_time')(authState);

  if (sessionExpiryTime) {
    console.debug('[LIBRARY] Initial session status:', sessionExpiryTime);
    return { checkedSessionExpiryTime: sessionExpiryTime, checkedRefreshExpiryTime: refreshExpiryTime };
  }
  // Check cookie data for id token
  const idToken = getCookieByName('id_token');
  if (idToken) {
    try {
      const decodedToken = JSON.parse(atob(idToken.split('.')[1]));
      const expirationTime = new Date(decodedToken.exp * 1000);
      console.debug('[LIBRARY] Initial session status from id token:', expirationTime);
      return { checkedSessionExpiryTime: expirationTime, checkedRefreshExpiryTime: refreshExpiryTime };
    } catch (error) {
      console.error('[LIBRARY] Failed to decode id token:', error);
      return { checkedSessionExpiryTime: null, checkedRefreshExpiryTime: null };
    }
  }

  return { checkedSessionExpiryTime: null, checkedRefreshExpiryTime: null };
}

export async function expireSession(expireSessionEndpoint) {
  console.debug('[LIBRARY] Expiring session');
  const response = await fetch(expireSessionEndpoint, {
    method: 'DELETE',
  });

  if (!response.ok) {
    console.error('[LIBRARY] Failed to expire session, response status:', response.status);
    throw new Error('Failed to expire session');
  }

  console.debug('[LIBRARY] Session expired successfully');
}

export async function renewSession(renewSessionEndpoint, body) {
  console.debug('[LIBRARY] Starting session renewal process: ', body);
  const response = await fetch(renewSessionEndpoint, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  console.debug(`[LIBRARY] Fetch request sent to ${renewSessionEndpoint}:`, response);

  if (!response.ok) {
    console.error('[LIBRARY] Failed to renew session, response status:', response.status);
    throw new Error('Failed to renew session');
  }

  const data = await response.json();
  return data;
}

export async function isSessionExpired(expiryTime) {
  let sessionExpiryTime = expiryTime;
  if (sessionExpiryTime == null) {
    const { checkedSessionExpiryTime } = await checkSessionStatus();
    if (checkedSessionExpiryTime == null) {
      return true;
    }
    sessionExpiryTime = checkedSessionExpiryTime;
  }

  const now = new Date();

  // Get the time difference between now and the expiry time
  const timerInterval = new Date(sessionExpiryTime) - now;
  const diffInSeconds = Math.round(timerInterval / 1000);

  if (Number.isNaN(diffInSeconds)) {
    console.error('[LIBRARY] time interval is not a valid date format:', timerInterval);
    throw new Error('encounted an error checking time interval: diffInSeconds is NaN');
  }

  return diffInSeconds <= 0;
}

export function validateExpiryTime(expiryTime) {
  if (!expiryTime) return null;
  const convertedExpiryTime = new Date(expiryTime);
  if (Number.isNaN(convertedExpiryTime.getTime())) {
    console.error('[LIBRARY] Invalid format:', convertedExpiryTime);
    return null;
  }
  return convertedExpiryTime;
}
