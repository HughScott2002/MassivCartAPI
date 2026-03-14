type LogLevel = "INFO" | "WARN" | "ERROR";

type LogContext = Record<string, unknown>;

function serializeError(error: unknown): LogContext {
  if (!(error instanceof Error)) {
    return { error };
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function writeLog(level: LogLevel, message: string, context?: LogContext): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
  };

  const line = JSON.stringify(entry);

  if (level === "ERROR") {
    console.error(line);
    return;
  }

  if (level === "WARN") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function logInfo(message: string, context?: LogContext): void {
  writeLog("INFO", message, context);
}

export function logWarn(message: string, context?: LogContext): void {
  writeLog("WARN", message, context);
}

export function logError(
  message: string,
  error?: unknown,
  context?: LogContext,
): void {
  writeLog("ERROR", message, {
    ...(context ?? {}),
    ...(error === undefined ? {} : { error: serializeError(error) }),
  });
}
