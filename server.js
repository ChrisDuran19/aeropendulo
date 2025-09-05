// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('crypto'); // Usar crypto nativo en lugar de uuid

const config = require('./config');
const logger = require('./logger');

class Server {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.clients = new Map();
    
    // Sistema de datos
    this.systemData = {
      currentAngle: 0,
      referenceAngle: 45,
      error: 0,
      isRunning: false,
      isConnected: false,
      pid: {
        kp: 1.2,
        ki: 0.1,
        kd: 0.05,
        integral: 0,
        previousError: 0
      },
      stats: {
        avgAngle: 0,
        stdAngle: 0,
        minAngle: 0,
        maxAngle: 0,
        uptime: 0,
        errorCount: 0
      }
    };

    this.dataHistory = {
      angles: [],
      errors: [],
      times: [],
      maxPoints: config.system?.maxDataPoints || 1000
    };

    this.startTime = Date.now();
    this.lastUpdateTime = Date.now();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
    this.startSimulation();
  }

  // Generar UUID simple usando crypto nativo
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  setupMiddleware() {
    // Headers de seguridad básicos (sin helmet)
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });

    // CORS básico
    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // Rate limiting básico (sin express-rate-limit)
    const rateLimitMap = new Map();
    this.app.use('/api/', (req, res, next) => {
      const clientIP = req.ip || req.connection.remoteAddress;
      const now = Date.now();
      const windowMs = 15 * 60 * 1000; // 15 minutos
      
      if (!rateLimitMap.has(clientIP)) {
        rateLimitMap.set(clientIP, { count: 1, resetTime: now + windowMs });
      } else {
        const clientData = rateLimitMap.get(clientIP);
        if (now > clientData.resetTime) {
          clientData.count = 1;
          clientData.resetTime = now + windowMs;
        } else {
          clientData.count++;
          if (clientData.count > 100) {
            return res.status(429).json({ error: 'Demasiadas solicitudes' });
          }
        }
      }
      next();
    });

    // Parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Archivos estáticos
    this.app.use(express.static(path.join(__dirname, 'public')));

    // Logging de requests
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path} - ${req.ip}`, 'HTTP');
      next();
    });
  }

  setupRoutes() {
    // Ruta principal
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version
      });
    });

    // API Routes
    this.setupAPIRoutes();

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ 
        error: 'Endpoint no encontrado',
        path: req.originalUrl 
      });
    });
  }

  setupAPIRoutes() {
    // Status del sistema
    this.app.get('/api/status', async (req, res) => {
      try {
        res.json({
          status: 'Operacional',
          timestamp: new Date().toISOString(),
          system: {
            ...this.systemData,
            stats: {
              ...this.systemData.stats,
              uptime: Date.now() - this.startTime,
              dataPoints: this.dataHistory.angles.length
            }
          },
          connections: this.clients.size
        });
      } catch (error) {
        logger.error(`Error obteniendo status: ${error.message}`, 'API');
        res.status(500).json({ error: 'Error interno del servidor' });
      }
    });

    // Datos históricos
    this.app.get('/api/history', async (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
        const start = Math.max(0, this.dataHistory.angles.length - limit);
        
        res.json({
          angles: this.dataHistory.angles.slice(start),
          errors: this.dataHistory.errors.slice(start),
          times: this.dataHistory.times.slice(start),
          totalPoints: this.dataHistory.angles.length
        });
      } catch (error) {
        logger.error(`Error obteniendo historial: ${error.message}`, 'API');
        res.status(500).json({ error: 'Error obteniendo datos históricos' });
      }
    });

    // Logs del sistema
    this.app.get('/api/logs', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 50;
        const logs = logger.getLogs ? logger.getLogs(limit) : [];
        res.json(logs);
      } catch (error) {
        logger.error(`Error obteniendo logs: ${error.message}`, 'API');
        res.status(500).json({ error: 'Error obteniendo logs' });
      }
    });

    this.app.delete('/api/logs', (req, res) => {
      try {
        if (logger.clearLogs) logger.clearLogs();
        res.json({ 
          success: true, 
          message: 'Logs eliminados exitosamente',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error(`Error limpiando logs: ${error.message}`, 'API');
        res.status(500).json({ error: 'Error limpiando logs' });
      }
    });

    // Comandos del sistema
    this.app.post('/api/command', async (req, res) => {
      try {
        const { command, value } = req.body;
        
        // Validar comando básico
        if (!command || typeof command !== 'string') {
          return res.status(400).json({ error: 'Comando inválido' });
        }

        const result = await this.executeCommand(command, value);
        
        // Broadcast a clientes WebSocket
        this.broadcast({
          type: 'commandExecuted',
          command,
          value,
          result,
          timestamp: new Date().toISOString()
        });

        logger.info(`Comando ejecutado: ${command} ${value || ''}`, 'API');
        res.json({ 
          success: true, 
          message: 'Comando ejecutado exitosamente',
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error(`Error ejecutando comando: ${error.message}`, 'API');
        res.status(500).json({ 
          error: 'Error ejecutando comando',
          details: error.message 
        });
      }
    });

    // Configuración PID
    this.app.put('/api/pid', async (req, res) => {
      try {
        const pidParams = req.body;
        
        if (!pidParams || typeof pidParams !== 'object') {
          return res.status(400).json({ error: 'Parámetros PID inválidos' });
        }

        const validParams = ['kp', 'ki', 'kd'];
        const updates = {};

        for (const [key, value] of Object.entries(pidParams)) {
          if (validParams.includes(key)) {
            const numValue = parseFloat(value);
            if (!isNaN(numValue) && numValue >= 0) {
              updates[key] = numValue;
            }
          }
        }

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ error: 'No se proporcionaron parámetros válidos' });
        }

        this.systemData.pid = { ...this.systemData.pid, ...updates };
        this.resetPIDController();
        
        this.broadcast({
          type: 'pidUpdated',
          pid: this.systemData.pid,
          timestamp: new Date().toISOString()
        });

        logger.info(`Parámetros PID actualizados: ${JSON.stringify(updates)}`, 'API');
        res.json({ 
          success: true, 
          message: 'Parámetros PID actualizados',
          pid: this.systemData.pid,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error(`Error actualizando PID: ${error.message}`, 'API');
        res.status(500).json({ 
          error: 'Error actualizando parámetros PID',
          details: error.message 
        });
      }
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      this.handleNewConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      logger.error(`Error en servidor WebSocket: ${error.message}`, 'WEBSOCKET');
    });
  }

  handleNewConnection(ws, req) {
    const clientId = this.generateUUID();
    const clientIp = req.socket.remoteAddress || 'unknown';
    
    const clientInfo = {
      id: clientId,
      ip: clientIp,
      connectedAt: new Date(),
      isAlive: true
    };

    this.clients.set(ws, clientInfo);

    // Enviar datos iniciales
    this.sendToClient(ws, {
      type: 'welcome',
      clientId,
      system: this.systemData,
      timestamp: new Date().toISOString()
    });

    // Configurar handlers
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        await this.handleClientMessage(ws, clientInfo, data);
      } catch (error) {
        logger.error(`Error procesando mensaje de ${clientInfo.id}: ${error.message}`, 'WEBSOCKET');
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      logger.info(`Cliente ${clientInfo.id} desconectado`, 'WEBSOCKET');
    });

    ws.on('error', (error) => {
      logger.error(`Error en WebSocket ${clientInfo.id}: ${error.message}`, 'WEBSOCKET');
    });

    logger.info(`Cliente WebSocket conectado: ${clientId} desde ${clientIp}`, 'WEBSOCKET');
  }

  async handleClientMessage(ws, clientInfo, data) {
    switch (data.type) {
      case 'command':
        try {
          const result = await this.executeCommand(data.command, data.value);
          this.sendToClient(ws, {
            type: 'commandResponse',
            command: data.command,
            value: data.value,
            result,
            success: true,
            timestamp: new Date().toISOString()
          });

          this.broadcast({
            type: 'systemUpdate',
            system: this.systemData,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          this.sendToClient(ws, {
            type: 'commandResponse',
            command: data.command,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
        break;

      case 'ping':
        this.sendToClient(ws, {
          type: 'pong',
          timestamp: new Date().toISOString()
        });
        break;

      case 'getHistory':
        const limit = Math.min(data.limit || 100, 1000);
        const start = Math.max(0, this.dataHistory.angles.length - limit);
        
        this.sendToClient(ws, {
          type: 'historyData',
          history: {
            angles: this.dataHistory.angles.slice(start),
            errors: this.dataHistory.errors.slice(start),
            times: this.dataHistory.times.slice(start)
          },
          timestamp: new Date().toISOString()
        });
        break;
    }
  }

  async executeCommand(command, value) {
    logger.info(`Ejecutando comando: ${command} ${value || ''}`, 'CONTROL');

    switch (command) {
      case 'startSystem':
        if (this.systemData.isRunning) {
          throw new Error('El sistema ya está funcionando');
        }
        this.systemData.isRunning = true;
        this.systemData.isConnected = true;
        this.resetPIDController();
        return { status: 'Sistema iniciado' };

      case 'stopSystem':
        if (!this.systemData.isRunning) {
          throw new Error('El sistema ya está detenido');
        }
        this.systemData.isRunning = false;
        return { status: 'Sistema detenido' };

      case 'emergencyStop':
        this.systemData.isRunning = false;
        this.systemData.isConnected = false;
        this.resetPIDController();
        return { status: 'Parada de emergencia' };

      case 'setTargetAngle':
        const angle = parseFloat(value);
        if (isNaN(angle) || angle < -180 || angle > 180) {
          throw new Error('Ángulo inválido');
        }
        this.systemData.referenceAngle = angle;
        this.resetPIDController();
        return { status: 'Ángulo actualizado', angle };

      case 'resetSystem':
        this.systemData.isRunning = false;
        this.systemData.currentAngle = 0;
        this.systemData.referenceAngle = 45;
        this.resetPIDController();
        this.clearHistory();
        return { status: 'Sistema reseteado' };

      default:
        throw new Error(`Comando desconocido: ${command}`);
    }
  }

  sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
        return true;
      } catch (error) {
        logger.error(`Error enviando mensaje: ${error.message}`, 'WEBSOCKET');
        return false;
      }
    }
    return false;
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    let sentCount = 0;

    this.clients.forEach((clientInfo, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
          sentCount++;
        } catch (error) {
          logger.error(`Error en broadcast: ${error.message}`, 'WEBSOCKET');
        }
      }
    });

    return sentCount;
  }

  startSimulation() {
    this.simulationInterval = setInterval(() => {
      if (!this.systemData.isRunning) return;

      const now = Date.now();
      const deltaTime = (now - this.lastUpdateTime) / 1000;
      this.lastUpdateTime = now;

      // Simular comportamiento del sistema
      this.simulateSystemBehavior();
      
      // Calcular error
      this.systemData.error = this.systemData.currentAngle - this.systemData.referenceAngle;
      
      // Control PID
      this.applyPIDControl(deltaTime);
      
      // Actualizar historial
      this.updateHistory();
      
      // Calcular estadísticas
      this.updateStatistics();

      // Broadcast a clientes
      this.broadcast({
        type: 'dataUpdate',
        data: {
          currentAngle: this.systemData.currentAngle,
          referenceAngle: this.systemData.referenceAngle,
          error: this.systemData.error,
          stats: this.systemData.stats,
          isRunning: this.systemData.isRunning
        },
        timestamp: new Date().toISOString()
      });

    }, config.system?.updateInterval || 100);

    logger.info('Simulación iniciada', 'SIMULATION');
  }

  simulateSystemBehavior() {
    const timeMs = Date.now();
    const errorCorrection = this.systemData.error * -0.1;
    const noise = (Math.random() - 0.5) * 2;
    const oscillation = Math.sin(timeMs * 0.001 * 2 * Math.PI) * 5;
    const disturbance = Math.random() < 0.01 ? (Math.random() - 0.5) * 20 : 0;
    
    this.systemData.currentAngle += errorCorrection + noise + oscillation * 0.1 + disturbance;
    this.systemData.currentAngle = Math.max(-180, Math.min(180, this.systemData.currentAngle));
  }

  applyPIDControl(deltaTime) {
    const error = this.systemData.error;
    const { pid } = this.systemData;
    
    pid.integral += error * deltaTime;
    pid.integral = Math.max(-100, Math.min(100, pid.integral));
    
    const derivative = deltaTime > 0 ? (error - pid.previousError) / deltaTime : 0;
    const pidOutput = (pid.kp * error) + (pid.ki * pid.integral) + (pid.kd * derivative);
    
    pid.previousError = error;
    return pidOutput;
  }

  updateHistory() {
    this.dataHistory.angles.push(this.systemData.currentAngle);
    this.dataHistory.errors.push(this.systemData.error);
    this.dataHistory.times.push(Date.now());
    
    while (this.dataHistory.angles.length > this.dataHistory.maxPoints) {
      this.dataHistory.angles.shift();
      this.dataHistory.errors.shift();
      this.dataHistory.times.shift();
    }
  }

  updateStatistics() {
    if (this.dataHistory.angles.length === 0) return;
    
    const angles = this.dataHistory.angles;
    const sum = angles.reduce((a, b) => a + b, 0);
    
    this.systemData.stats.avgAngle = sum / angles.length;
    this.systemData.stats.minAngle = Math.min(...angles);
    this.systemData.stats.maxAngle = Math.max(...angles);
    
    const variance = angles.reduce((sq, n) => 
      sq + Math.pow(n - this.systemData.stats.avgAngle, 2), 0
    ) / angles.length;
    this.systemData.stats.stdAngle = Math.sqrt(variance);
    this.systemData.stats.uptime = Date.now() - this.startTime;
  }

  resetPIDController() {
    this.systemData.pid.integral = 0;
    this.systemData.pid.previousError = 0;
  }

  clearHistory() {
    this.dataHistory.angles = [];
    this.dataHistory.errors = [];
    this.dataHistory.times = [];
  }

  setupErrorHandling() {
    this.app.use((error, req, res, next) => {
      logger.error(`Error en Express: ${error.message}`, 'EXPRESS');
      
      if (res.headersSent) {
        return next(error);
      }

      res.status(500).json({
        error: 'Error interno del servidor',
        timestamp: new Date().toISOString()
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error(`Error no capturado: ${error.message}`, 'SYSTEM');
      console.error('Uncaught Exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error(`Promesa rechazada: ${reason}`, 'SYSTEM');
      console.error('Unhandled Rejection:', reason);
    });

    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }

  gracefulShutdown(signal) {
    logger.info(`Cerrando servidor (${signal})...`, 'SYSTEM');
    
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
    }

    this.server.close(() => {
      logger.info('Servidor cerrado', 'SYSTEM');
      process.exit(0);
    });

    setTimeout(() => {
      process.exit(1);
    }, 10000);
  }

  start() {
    const { host, port } = config.server;
    
    this.server.listen(port, host, () => {
      logger.info(`Servidor iniciado en http://${host}:${port}`, 'SERVER');
      logger.info('Sistema listo para conexiones', 'SERVER');
    });

    return this.server;
  }
}

// Crear y iniciar servidor
if (require.main === module) {
  const server = new Server();
  server.start();
}

module.exports = Server;