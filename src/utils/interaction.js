import { getAuthState, updateAuthState } from './auth.js';

// eventsToMonitor is an array of event types that we want to listen for in order to detect user interaction with the page.
const eventsToMonitor = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

export function getLastInteractionTime() {
  const authState = getAuthState();
  return authState ? authState.last_interaction_time : null;
}

export function logLastInteraction() {
  console.debug('[LIBRARY] User interaction detected');
  updateAuthState({ last_interaction_time: new Date().toISOString() });
}

export function monitorInteraction(func) {
  console.debug('[LIBRARY] Event listener ', func.name, ' added for ', eventsToMonitor);
  eventsToMonitor.forEach((name) => {
    document.addEventListener(name, func);
  });
}

export function removeInteractionMonitoring(func) {
  console.debug('[LIBRARY] Removing interaction monitoring');
  eventsToMonitor.forEach((name) => {
    document.removeEventListener(name, func);
  });
}

export function checkForInactivity(inactivityThreshold) {
  const lastInteractionTime = getLastInteractionTime();

  if (lastInteractionTime === null) {
    console.debug('[LIBRARY] No last interaction time found, treating as active');
    return false;
  }

  const now = new Date();
  const lastInteractionDate = new Date(lastInteractionTime);
  const inactivityDuration = now - lastInteractionDate;

  console.debug(`[LIBRARY] Inactivity duration: ${inactivityDuration} ms, Threshold: ${inactivityThreshold} ms`);

  return inactivityDuration > inactivityThreshold;
}
