// managers/WebSocketManager.js
const WebSocket = require('ws');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');

class WebSocketManager extends EventEmitter {
  constructor(server, systemController) {
    super();
    this.wss = new WebSocket.Server({ server });
    this.systemController = systemController;
    this.clients = new Map();
    this.setupWebSocketServer();
  }

  setupWebSocketServer() {
    this.wss.on('connection', (ws, req) => {
      this.handleNewConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      logger.error(`Error en servidor WebSocket: ${error.message}`, 'WEBSOCKET');
      this.emit('error', error);
    });
  }

  handleNewConnection(ws, req) {
    const clientId = uuidv4();
    const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    const clientInfo = {
      id: clientId,
      ip: clientIp,
      userAgent,
      connectedAt: new Date(),
      lastPing: new Date(),
      isAlive: true
    };

    this.clients.set(ws, clientInfo);

    // Enviar datos iniciales
    this.sendToClient(ws, {
      type: 'welcome',
      clientId,
      system: this.systemController.systemData,
      timestamp: new Date().toISOString()
    });

    // Configurar handlers del cliente
    this.setupClientHandlers(ws, clientInfo);

    // Emitir evento de conexión
    this.emit('clientConnected', clientInfo);

    logger.info(`Cliente WebSocket conectado: ${clientId} desde ${clientIp}`, 'WEBSOCKET');
  }

  setupClientHandlers(ws, clientInfo) {
    // Handler de mensajes
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        await this.handleClientMessage(ws, clientInfo, data);
      } catch (error) {
        logger.error(`Error procesando mensaje de ${clientInfo.id}: ${error.message}`, 'WEBSOCKET');
        this.sendToClient(ws, {
          type: 'error',
          message: 'Error procesando mensaje',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handler de desconexión
    ws.on('close', (code, reason) => {
      this.handleClientDisconnection(ws, clientInfo, code, reason);
    });

    // Handler de errores
    ws.on('error', (error) => {
      logger.error(`Error en WebSocket ${clientInfo.id}: ${error.message}`, 'WEBSOCKET');
    });

    // Handler de pong (para heartbeat)
    ws.on('pong', () => {
      clientInfo.lastPing = new Date();
      clientInfo.isAlive = true;
    });
  }

  async handleClientMessage(ws, clientInfo, data) {
    logger.debug(`Mensaje recibido de ${clientInfo.id}: ${JSON.stringify(data)}`, 'WEBSOCKET');

    switch (data.type) {
      case 'command':
        await this.handleCommand(ws, clientInfo, data);
        break;

      case 'ping':
        this.sendToClient(ws, {
          type: 'pong',
          timestamp: new Date().toISOString()
        });
        break;

      case 'subscribe':
        await this.handleSubscription(ws, clientInfo, data);
        break;

      case 'unsubscribe':
        await this.handleUnsubscription(ws, clientInfo, data);
        break;

      case 'getHistory':
        await this.handleHistoryRequest(ws, clientInfo, data);
        break;

      case 'heartbeat':
        clientInfo.lastPing = new Date();
        clientInfo.isAlive = true;
        break;

      default:
        logger.warn(`Tipo de mensaje desconocido de ${clientInfo.id}: ${data.type}`, 'WEBSOCKET');
        this.sendToClient(ws, {
          type: 'error',
          message: `Tipo de mensaje desconocido: ${data.type}`,
          timestamp: new Date().toISOString()
        });
    }
  }

  async handleCommand(ws, clientInfo, data) {
    try {
      const { command, value } = data;
      const result = await this.systemController.executeCommand(command, value);
      
      // Enviar confirmación al cliente que envió el comando
      this.sendToClient(ws, {
        type: 'commandResponse',
        command,
        value,
        result,
        success: true,
        timestamp: new Date().toISOString()
      });

      // Broadcast a todos los clientes
      this.broadcast({
        type: 'systemUpdate',
        system: await this.systemController.getSystemStatus(),
        lastCommand: { command, value, executedBy: clientInfo.id },
        timestamp: new Date().toISOString()
      });

      logger.info(`Comando ejecutado por ${clientInfo.id}: ${command} ${value || ''}`, 'WEBSOCKET');
    } catch (error) {
      this.sendToClient(ws, {
        type: 'commandResponse',
        command: data.command,
        value: data.value,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      logger.error(`Error ejecutando comando de ${clientInfo.id}: ${error.message}`, 'WEBSOCKET');
    }
  }

  async handleSubscription(ws, clientInfo, data) {
    const { channels = [] } = data;
    
    if (!clientInfo.subscriptions) {
      clientInfo.subscriptions = new Set();
    }

    channels.forEach(channel => {
      clientInfo.subscriptions.add(channel);
    });

    this.sendToClient(ws, {
      type: 'subscriptionConfirmed',
      channels: Array.from(clientInfo.subscriptions),
      timestamp: new Date().toISOString()
    });

    logger.debug(`Cliente ${clientInfo.id} suscrito a: ${channels.join(', ')}`, 'WEBSOCKET');
  }

  async handleUnsubscription(ws, clientInfo, data) {
    const { channels = [] } = data;
    
    if (clientInfo.subscriptions) {
      channels.forEach(channel => {
        clientInfo.subscriptions.delete(channel);
      });
    }

    this.sendToClient(ws, {
      type: 'unsubscriptionConfirmed',
      channels,
      remaining: clientInfo.subscriptions ? Array.from(clientInfo.subscriptions) : [],
      timestamp: new Date().toISOString()
    });

    logger.debug(`Cliente ${clientInfo.id} desuscrito de: ${channels.join(', ')}`, 'WEBSOCKET');
  }

  async handleHistoryRequest(ws, clientInfo, data) {
    try {
      const { limit = 100, from, to } = data;
      const history = await this.systemController.getHistory(
        limit,
        from ? new Date(from) : null,
        to ? new Date(to) : null
      );

      this.sendToClient(ws, {
        type: 'historyData',
        history,
        requestId: data.requestId,
        timestamp: new Date().toISOString()
      });

      logger.debug(`Enviado historial a ${clientInfo.id}: ${history.angles.length} puntos`, 'WEBSOCKET');
    } catch (error) {
      this.sendToClient(ws, {
        type: 'error',
        message: 'Error obteniendo historial',
        error: error.message,
        requestId: data.requestId,
        timestamp: new Date().toISOString()
      });
    }
  }

  handleClientDisconnection(ws, clientInfo, code, reason) {
    this.clients.delete(ws);
    
    logger.info(`Cliente ${clientInfo.id} desconectado (código: ${code})`, 'WEBSOCKET');
    this.emit('clientDisconnected', clientInfo);
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

  broadcast(data, channel = null) {
    const message = JSON.stringify(data);
    let sentCount = 0;
    let failedCount = 0;

    this.clients.forEach((clientInfo, ws) => {
      // Verificar suscripción a canal si se especifica
      if (channel && clientInfo.subscriptions && !clientInfo.subscriptions.has(channel)) {
        return;
      }

      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
          sentCount++;
        } catch (error) {
          failedCount++;
          logger.error(`Error enviando broadcast a ${clientInfo.id}: ${error.message}`, 'WEBSOCKET');
        }
      } else {
        failedCount++;
      }
    });

    if (data.type !== 'dataUpdate') { // Evitar logs excesivos
      logger.debug(`Broadcast enviado: ${sentCount} éxitos, ${failedCount} fallos`, 'WEBSOCKET');
    }

    return { sent: sentCount, failed: failedCount };
  }

  broadcastToChannel(channel, data) {
    return this.broadcast(data, channel);
  }

  getConnectionCount() {
    return this.clients.size;
  }

  getConnectedClients() {
    const clients = [];
    this.clients.forEach((clientInfo, ws) => {
      clients.push({
        id: clientInfo.id,
        ip: clientInfo.ip,
        connectedAt: clientInfo.connectedAt,
        lastPing: clientInfo.lastPing,
        isAlive: clientInfo.isAlive,
        subscriptions: clientInfo.subscriptions ? Array.from(clientInfo.subscriptions) : [],
        readyState: ws.readyState
      });
    });
    return clients;
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((clientInfo, ws) => {
        if (clientInfo.isAlive === false) {
          logger.warn(`Terminando conexión inactiva: ${clientInfo.id}`, 'WEBSOCKET');
          ws.terminate();
          return;
        }

        clientInfo.isAlive = false;
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, 30000); // Ping cada 30 segundos

    logger.info('Heartbeat iniciado para WebSocket', 'WEBSOCKET');
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('Heartbeat detenido', 'WEBSOCKET');
    }
  }

  async closeAll() {
    logger.info('Cerrando todas las conexiones WebSocket...', 'WEBSOCKET');
    
    this.stopHeartbeat();

    const closePromises = [];
    this.clients.forEach((clientInfo, ws) => {
      closePromises.push(new Promise((resolve) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, 'Server shutdown');
        }
        resolve();
      }));
    });

    await Promise.all(closePromises);
    
    this.clients.clear();
    logger.info('Todas las conexiones WebSocket cerradas', 'WEBSOCKET');
  }

  // Método para obtener estadísticas
  getStats() {
    const now = new Date();
    const stats = {
      totalConnections: this.clients.size,
      activeConnections: 0,
      subscriptionCounts: {},
      connectionsByIP: {}
    };

    this.clients.forEach((clientInfo, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        stats.activeConnections++;
      }

      // Contar suscripciones
      if (clientInfo.subscriptions) {
        clientInfo.subscriptions.forEach(channel => {
          stats.subscriptionCounts[channel] = (stats.subscriptionCounts[channel] || 0) + 1;
        });
      }

      // Contar por IP
      stats.connectionsByIP[clientInfo.ip] = (stats.connectionsByIP[clientInfo.ip] || 0) + 1;
    });

    return stats;
  }
}

module.exports = WebSocketManager;