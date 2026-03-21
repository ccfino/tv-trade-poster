const { createLogger, format, transports } = require('winston');
const Transport = require('winston-transport');

// Custom transport that forwards log entries to the dashboard via appEvents
class DashboardTransport extends Transport {
  log(info, callback) {
    setImmediate(() => {
      try {
        // Lazy-require to avoid circular dependency at module load time
        const appEvents = require('./appEvents');
        appEvents.emit('log', { level: info.level, message: info.message, time: new Date().toISOString() });
      } catch (_) {}
      callback();
    });
  }
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      const base = `[${timestamp}] ${level.toUpperCase().padEnd(5)} ${message}`;
      return stack ? `${base}\n${stack}` : base;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
    new DashboardTransport(),
  ],
});

// Create logs dir on first use (winston won't auto-create)
const fs = require('fs');
if (!fs.existsSync('logs')) fs.mkdirSync('logs');

module.exports = logger;
