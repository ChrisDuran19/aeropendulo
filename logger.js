// logger.js
const fs = require('fs');
const path = require('path');
const moment = require('moment');

class Logger {
  constructor() {
    this.logFile = path.join(__dirname, 'system.log');
    this.maxEntries = 1000;
    this.logs = [];
    this.loadLogs();
  }

  loadLogs() {
    try {
      if (fs.existsSync(this.logFile)) {
        const data = fs.readFileSync(this.logFile, 'utf8');
        this.logs = data.split('\n')
          .filter(line => line.trim())
          .slice(-this.maxEntries);
      }
    } catch (error) {
      console.error('Error cargando logs:', error);
    }
  }

  log(level, message, source = 'SYSTEM') {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      source,
      message
    };

    const logString = `[${timestamp}] [${level.toUpperCase()}] [${source}] ${message}`;
    
    // Guardar en memoria
    this.logs.push(logEntry);
    if (this.logs.length > this.maxEntries) {
      this.logs.shift();
    }

    // Guardar en archivo
    fs.appendFileSync(this.logFile, logString + '\n');

    // Mostrar en consola
    console.log(logString);

    return logEntry;
  }

  info(message, source = 'SYSTEM') {
    return this.log('info', message, source);
  }

  warn(message, source = 'SYSTEM') {
    return this.log('warn', message, source);
  }

  error(message, source = 'SYSTEM') {
    return this.log('error', message, source);
  }

  debug(message, source = 'SYSTEM') {
    return this.log('debug', message, source);
  }

  getLogs(limit = 50) {
    return this.logs.slice(-limit);
  }

  clearLogs() {
    this.logs = [];
    fs.writeFileSync(this.logFile, '');
  }
}

module.exports = new Logger();