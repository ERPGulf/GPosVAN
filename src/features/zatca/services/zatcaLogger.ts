type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

const DEBUG_FLAG = process.env.EXPO_PUBLIC_ZATCA_DEBUG === '1';

function shouldLog(level: LogLevel): boolean {
  if (level !== 'DEBUG') return true;
  return typeof __DEV__ !== 'undefined' ? __DEV__ || DEBUG_FLAG : DEBUG_FLAG;
}

function toErrorMeta(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { error };
}

function sanitizeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    const lower = key.toLowerCase();
    const isSensitiveKey =
      lower.includes('privatekey') ||
      lower.includes('certificate') ||
      lower.includes('signature') ||
      lower.includes('pem');

    const isPotentiallySensitiveValue =
      typeof value === 'string' ||
      (typeof value === 'object' && value !== null) ||
      Array.isArray(value);

    if (isSensitiveKey && isPotentiallySensitiveValue) {
      sanitized[key] = '[masked]';
      continue;
    }

    sanitized[key] = value;
  }
  return sanitized;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const prefix = `[ZATCA][${level}]`;
  const payload = sanitizeMeta(meta);

  if (level === 'ERROR') {
    if (payload) {
      console.error(prefix, message, payload);
    } else {
      console.error(prefix, message);
    }
    return;
  }

  if (level === 'WARN') {
    if (payload) {
      console.warn(prefix, message, payload);
    } else {
      console.warn(prefix, message);
    }
    return;
  }

  if (payload) {
    console.log(prefix, message, payload);
  } else {
    console.log(prefix, message);
  }
}

export const zatcaLogger = {
  info(message: string, meta?: Record<string, unknown>): void {
    log('INFO', message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    log('WARN', message, meta);
  },
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const errorMeta = error ? toErrorMeta(error) : undefined;
    log('ERROR', message, {
      ...sanitizeMeta(meta),
      ...errorMeta,
    });
  },
  debug(message: string, meta?: Record<string, unknown>): void {
    log('DEBUG', message, meta);
  },
};
