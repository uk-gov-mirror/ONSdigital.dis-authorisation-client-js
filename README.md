# dis-authorisation-client-js

JS library for client side token renewal

## Getting started

* Run `make help` to see full list of make targets

## Usage

### Initialising with custom configuration

You can call `init` with a custom config, this allows you to specify callbacks and settings.
See `defaultConfig` below for more details on what is provided in the default config:

```js
import SessionManagement from 'dis-authorisation-client-js';

// Define configuration
const config = {
  timeOffsets: { passiveRenewal: 300000 }, // Session renewal offset: 5 minutes
  onRenewSuccess: (sessionExpiryTime, refreshExpiryTime) => {
    console.debug(`[APP] Session renewed successfully! Session: ${sessionExpiryTime} and refresh: ${refreshExpiryTime}`);
  },
  onRenewFailure: (error) => {
    console.error('[APP] Session renewal failed:', error);
  },
  onSessionValid: (sessionExpiryTime, refreshExpiryTime) => {
    console.debug(`[APP] Session is valid. Session: ${sessionExpiryTime} and refresh: ${refreshExpiryTime}`);
  },
  onSessionInvalid: () => {
    console.warn('[APP] Session is invalid.');
  },
  onError: (error) => {
    console.error('[APP] Error:', error);
  },
};

// Initialise the SessionManagement library
SessionManagement.init(config);
```

### Setting Session Expiry Times

You can set the session and refresh expiry times either by creating default expiry times using `createDefaultExpiryTimes` or by setting them directly.
If init has not been called yet, the library will automatically initialise with default settings.

#### Using `createDefaultExpiryTimes`

You can create default expiry times for session and refresh using `createDefaultExpiryTimes`:

```js
import SessionManagement, { createDefaultExpiryTimes } from 'dis-authorisation-client-js';

// Create default expiry times
const { session_expiry_time, refresh_expiry_time } = createDefaultExpiryTimes(12); // 12 hours

// Set the expiry timers
SessionManagement.setSessionExpiryTime(session_expiry_time, refresh_expiry_time);
```

#### Setting Expiry Times Directly

You can manually set the session and refresh expiry times using `setSessionExpiryTime`.

```js
import SessionManagement from 'dis-authorisation-client-js';

// Define session and refresh expiry times
const sessionExpiryTime = new Date(new Date().getTime() + 60 * 60 * 1000); // 1 hour from now
const refreshExpiryTime = new Date(new Date().getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

// Set the expiry timers
SessionManagement.setSessionExpiryTime(sessionExpiryTime, refreshExpiryTime);
```

### Note

If expiry times are found in local storage or cookies, those times will be used by default, even if provided times are not. You can also call `setSessionExpiryTime` without providing times, and the library will use the times found in local storage or cookies. To check if times need to be provided or not, you can use `isSessionValid`.

```js
import { isSessionExpired } from 'dis-authorisation-client-js';

async function renewSession() {
  const isExpired = await isSessionExpired();

  if (isExpired) {
    // Define session and refresh expiry times
    const sessionExpiryTime = new Date(new Date().getTime() + 60 * 60 * 1000); // 1 hour from now
    const refreshExpiryTime = new Date(new Date().getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

    // Set the expiry timers
    SessionManagement.setSessionExpiryTime(sessionExpiryTime, refreshExpiryTime);
  } else {
    SessionManagement.setSessionExpiryTime();
  }
}

```

### Dependencies

* No further dependencies other than those defined in `package.json`

## Configuration

### defaultConfig

| Option             | Type     | Default Value                                                                                                                                                        | Description                                                   |
|--------------------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------|
| `timeOffsets`      | Object   | `{ passiveRenewal: 300000, inactivityThreshold: 900000 }`                                                                                                            | Time offsets for session renewal in milliseconds.             |
| `onRenewSuccess`   | Function | `(sessionExpiryTime, refreshExpiryTime) => console.debug('[LIBRARY] Session renewed successfully. Session: ${sessionExpiryTime} and refresh: ${refreshExpiryTime}')` | Callback function to be called on successful session renewal. |
| `onRenewFailure`   | Function | `() => console.warn('[LIBRARY] Session renewal failed')`                                                                                                             | Callback function to be called on session renewal failure.    |
| `onSessionValid`   | Function | `(sessionExpiryTime, refreshExpiryTime) => console.debug('[LIBRARY] Session Valid. Session: ${sessionExpiryTime} and refresh: ${refreshExpiryTime}')`                | Callback function to be called when the session is valid.     |
| `onSessionInvalid` | Function | `() => console.warn('[LIBRARY] Session is invalid')`                                                                                                                 | Callback function to be called when the session is invalid.   |
| `apiEndpoints`     | Object   | `{ renewSession: "/api/v1/tokens/self", expireSession: "/api/v1/tokens/self" }`                                                                                      | The API endpoint for renewing the session.                    |
| `loginUrl`         | String   | '/florence/login'                                                                                                                                                    | Path to redirect to when a forced logout is actioned.         |

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md) for details.

## License

Copyright © 2024, Office for National Statistics <https://www.ons.gov.uk>

Released under MIT license, see [LICENSE](LICENSE.md) for details.
