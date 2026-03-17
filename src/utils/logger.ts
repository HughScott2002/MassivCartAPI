import chalk from "chalk";

type LogLevel = "INFO" | "WARN" | "ERROR";

type LogContext = Record<string, unknown>;

const IS_TTY = process.stdout.isTTY && process.env.NODE_ENV === "development";

const LEVEL_COLOR: Record<LogLevel, (s: string) => string> = {
  INFO: chalk.green,
  WARN: chalk.yellow,
  ERROR: chalk.red,
};

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
  if (IS_TTY) {
    const time = chalk.dim(new Date().toISOString());
    const lvl = LEVEL_COLOR[level](level.padEnd(5));
    const ctx = context ? " " + chalk.dim(JSON.stringify(context)) : "";
    const line = `${time} ${lvl} ${message}${ctx}`;
    if (level === "ERROR") console.error(line);
    else if (level === "WARN") console.warn(line);
    else console.log(line);
    return;
  }

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
