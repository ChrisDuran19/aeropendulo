// config.js
module.exports = {
  server: {
    port: process.env.PORT || 3000,
    host: 'localhost'
  },
  serial: {
    port: process.env.SERIAL_PORT || '/dev/ttyUSB0',
    baudRate: 9600
  },
  system: {
    maxLogEntries: 100,
    updateInterval: 1000,
    maxDataPoints: 60
  }
};