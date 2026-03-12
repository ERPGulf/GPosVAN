export class Logger {
  static info(scope: string, message: string, meta?: any) {
    console.log(`[INFO] [${scope}] ${message}`, meta ?? '');
  }

  static warn(scope: string, message: string, meta?: any) {
    console.warn(`[WARN] [${scope}] ${message}`, meta ?? '');
  }

  static error(scope: string, message: string, error?: unknown) {
    console.error(`[ERROR] [${scope}] ${message}`, error);
  }
}
