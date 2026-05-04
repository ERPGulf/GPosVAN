/**
 * Centralized Logger Service
 *
 * Wraps Firebase Crashlytics for production error reporting while
 * preserving console output for development builds.
 */
import {
  getCrashlytics,
  log as crashLog,
  recordError as crashRecordError,
  setUserId as crashSetUserId,
  setAttribute as crashSetAttribute,
} from '@react-native-firebase/crashlytics';

const crashInstance = getCrashlytics();

/**
 * Normalize an unknown throw into a proper Error instance.
 * Crashlytics requires Error objects for recordError().
 */
function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    const message =
      typeof obj.message === 'string'
        ? obj.message
        : typeof obj.localizedDescription === 'string'
          ? obj.localizedDescription
          : JSON.stringify(obj);
    return new Error(message);
  }
  return new Error(String(error));
}

export const logger = {
  /**
   * Set user identity for crash reports. Call after successful login.
   * All subsequent crash reports will be tagged with this user.
   */
  setUser(userId: string, email?: string): void {
    try {
      crashSetUserId(crashInstance, userId);
      if (email) {
        crashSetAttribute(crashInstance, 'email', email);
      }
    } catch {
      // Crashlytics not available
    }
  },

  /**
   * Set a custom key-value attribute for crash reports.
   * Useful for filtering in the Firebase console.
   */
  setAttribute(key: string, value: string): void {
    try {
      crashSetAttribute(crashInstance, key, value);
    } catch {
      // Crashlytics not available
    }
  },

  /**
   * Log a breadcrumb message. Appears alongside crash reports in the
   * Firebase console, ordered chronologically. Also logs to console
   * in dev builds.
   */
  log(message: string): void {
    if (__DEV__) {
      console.log(`[Logger] ${message}`);
    }
    try {
      crashLog(crashInstance, message);
    } catch {
      // Crashlytics not available
    }
  },

  /**
   * Record a non-fatal error to Firebase Crashlytics.
   * Also logs to console.error for dev visibility.
   *
   * @param error  - The caught error (any type)
   * @param context - Optional tag for filtering (e.g. 'InvoiceSync', 'Login')
   */
  recordError(error: unknown, context?: string): void {
    const err = toError(error);
    const tag = context ? `[${context}]` : '';

    console.error(`${tag} ${err.message}`, err);

    try {
      if (context) {
        crashLog(crashInstance, `Context: ${context}`);
      }
      crashRecordError(crashInstance, err);
    } catch {
      // Crashlytics not available
    }
  },
};

