'use strict';

/**
 * Minimal logger with timestamps. No external dependency.
 * Levels: debug, info, warn, error
 */

function ts() {
  return new Date().toISOString();
}

function format(level, args) {
  return [`[${ts()}] [${level}]`, ...args];
}

const logger = {
  debug(...args) {
    if (process.env.LOG_DEBUG === 'true') {
      console.log(...format('DEBUG', args));
    }
  },
  info(...args) {
    console.log(...format('INFO', args));
  },
  warn(...args) {
    console.warn(...format('WARN', args));
  },
  error(...args) {
    console.error(...format('ERROR', args));
  },
};

module.exports = logger;
