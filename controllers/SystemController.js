// controllers/SystemController.js
const EventEmitter = require('events');
const logger = require('../logger');
const config = require('../config');

class SystemController extends EventEmitter {
  constructor() {
    super();
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
  }

  async getSystemStatus() {
    return {
      ...this.systemData,
      stats: {
        ...this.systemData.stats,
        uptime: Date.now() - this.startTime,
        dataPoints: this.dataHistory.angles.length
      }
    };
  }

  async getHistory(limit = 100, fromDate = null, toDate = null) {
    let startIndex = 0;
    let endIndex = this.dataHistory.times.length;

    if (fromDate) {
      startIndex = this.dataHistory.times.findIndex(time => time >= fromDate.getTime());
      if (startIndex === -1) startIndex = 0;
    }

    if (toDate) {
      endIndex = this.dataHistory.times.findIndex(time => time > toDate.getTime());
      if (endIndex === -1) endIndex = this.dataHistory.times.length;
    }

    const actualLimit = Math.min(limit, endIndex - startIndex);
    const start = Math.max(0, endIndex - actualLimit);

    return {
      angles: this.dataHistory.angles.slice(start, endIndex),
      errors: this.dataHistory.errors.slice(start, endIndex),
      times: this.dataHistory.times.slice(start, endIndex),
      totalPoints: this.dataHistory.angles.length,
      rangeStart: start,
      rangeEnd: endIndex
    };
  }

  async executeCommand(command, value) {
    logger.info(`Ejecutando comando: ${command} ${value || ''}`, 'CONTROL');

    switch (command) {
      case 'startSystem':
        return await this.startSystem();
      
      case 'stopSystem':
        return await this.stopSystem();
      
      case 'emergencyStop':
        return await this.emergencyStop();
      
      case 'setTargetAngle':
        return await this.setTargetAngle(parseFloat(value));
      
      case 'resetSystem':
        return await this.resetSystem();
      
      case 'calibrate':
        return await this.calibrateSystem();
      
      default:
        throw new Error(`Comando desconocido: ${command}`);
    }
  }

  async startSystem() {
    if (this.systemData.isRunning) {
      throw new Error('El sistema ya está en funcionamiento');
    }

    this.systemData.isRunning = true;
    this.systemData.isConnected = true;
    this.resetPIDController();
    
    logger.info('Sistema iniciado exitosamente', 'CONTROL');
    this.emit('systemStarted');
    
    return { status: 'Sistema iniciado' };
  }

  async stopSystem() {
    if (!this.systemData.isRunning) {
      throw new Error('El sistema ya está detenido');
    }

    this.systemData.isRunning = false;
    logger.info('Sistema detenido', 'CONTROL');
    this.emit('systemStopped');
    
    return { status: 'Sistema detenido' };
  }

  async emergencyStop() {
    this.systemData.isRunning = false;
    this.systemData.isConnected = false;
    this.resetPIDController();
    
    logger.error('Parada de emergencia activada', 'CONTROL');
    this.emit('emergencyStop');
    
    return { status: 'Parada de emergencia activada' };
  }

  async setTargetAngle(angle) {
    if (isNaN(angle) || angle < -180 || angle > 180) {
      throw new Error('Ángulo objetivo inválido (debe estar entre -180 y 180)');
    }

    const previousAngle = this.systemData.referenceAngle;
    this.systemData.referenceAngle = angle;
    this.resetPIDController(); // Reset para evitar saltos bruscos
    
    logger.info(`Ángulo objetivo cambiado de ${previousAngle}° a ${angle}°`, 'CONTROL');
    this.emit('targetAngleChanged', { previous: previousAngle, current: angle });
    
    return { 
      status: 'Ángulo objetivo actualizado',
      previousAngle,
      currentAngle: angle
    };
  }

  async resetSystem() {
    this.systemData.isRunning = false;
    this.systemData.currentAngle = 0;
    this.systemData.referenceAngle = 45;
    this.systemData.error = 0;
    this.resetPIDController();
    this.clearHistory();
    
    logger.info('Sistema reseteado', 'CONTROL');
    this.emit('systemReset');
    
    return { status: 'Sistema reseteado exitosamente' };
  }

  async calibrateSystem() {
    // Simular proceso de calibración
    logger.info('Iniciando calibración del sistema...', 'CONTROL');
    
    // En un sistema real, aquí iría la lógica de calibración
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    this.systemData.isConnected = true;
    logger.info('Calibración completada', 'CONTROL');
    this.emit('systemCalibrated');
    
    return { status: 'Calibración completada exitosamente' };
  }

  async updatePIDParameters(pidParams) {
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
      throw new Error('No se proporcionaron parámetros PID válidos');
    }

    this.systemData.pid = { ...this.systemData.pid, ...updates };
    this.resetPIDController(); // Reset integral y error previo
    
    logger.info(`Parámetros PID actualizados: ${JSON.stringify(updates)}`, 'CONTROL');
    this.emit('pidUpdated', this.systemData.pid);
    
    return this.systemData.pid;
  }

  async getSystemStats() {
    const uptime = Date.now() - this.startTime;
    const dataPoints = this.dataHistory.angles.length;
    
    let stats = {
      ...this.systemData.stats,
      uptime,
      dataPoints,
      averageUpdateRate: dataPoints > 0 ? dataPoints / (uptime / 1000) : 0
    };

    if (this.dataHistory.angles.length > 0) {
      stats = this.calculateStatistics();
    }

    return stats;
  }

  async updateSimulation() {
    if (!this.systemData.isRunning) {
      return null;
    }

    const now = Date.now();
    const deltaTime = (now - this.lastUpdateTime) / 1000; // segundos
    this.lastUpdateTime = now;

    // Simular comportamiento del sistema
    this.simulateSystemBehavior();
    
    // Calcular error
    this.systemData.error = this.systemData.currentAngle - this.systemData.referenceAngle;
    
    // Aplicar control PID (simulado)
    this.applyPIDControl(deltaTime);
    
    // Actualizar historial
    this.updateHistory();
    
    // Calcular estadísticas
    this.updateStatistics();

    return {
      currentAngle: this.systemData.currentAngle,
      referenceAngle: this.systemData.referenceAngle,
      error: this.systemData.error,
      pidOutput: this.calculatePIDOutput(deltaTime),
      stats: this.systemData.stats,
      isRunning: this.systemData.isRunning,
      isConnected: this.systemData.isConnected
    };
  }

  simulateSystemBehavior() {
    // Simular dinámicas del sistema físico
    const timeMs = Date.now();
    
    // Componente base: movimiento hacia el ángulo de referencia
    const errorCorrection = this.systemData.error * -0.1;
    
    // Ruido aleatorio
    const noise = (Math.random() - 0.5) * 2;
    
    // Oscilación natural del sistema
    const naturalFreq = 0.001; // Hz
    const oscillation = Math.sin(timeMs * naturalFreq * 2 * Math.PI) * 5;
    
    // Perturbación externa ocasional
    const disturbance = Math.random() < 0.01 ? (Math.random() - 0.5) * 20 : 0;
    
    // Actualizar ángulo actual
    this.systemData.currentAngle += errorCorrection + noise + oscillation * 0.1 + disturbance;
    
    // Limitar ángulo a rango válido
    this.systemData.currentAngle = Math.max(-180, Math.min(180, this.systemData.currentAngle));
  }

  applyPIDControl(deltaTime) {
    const error = this.systemData.error;
    const { pid } = this.systemData;
    
    // Integral
    pid.integral += error * deltaTime;
    
    // Limitar integral (anti-windup)
    pid.integral = Math.max(-100, Math.min(100, pid.integral));
    
    // Derivativo
    const derivative = deltaTime > 0 ? (error - pid.previousError) / deltaTime : 0;
    
    // Calcular salida PID
    const pidOutput = (pid.kp * error) + (pid.ki * pid.integral) + (pid.kd * derivative);
    
    // Actualizar error previo
    pid.previousError = error;
    
    return pidOutput;
  }

  calculatePIDOutput(deltaTime) {
    const error = this.systemData.error;
    const { pid } = this.systemData;
    
    const proportional = pid.kp * error;
    const integral = pid.ki * pid.integral;
    const derivative = deltaTime > 0 ? pid.kd * (error - pid.previousError) / deltaTime : 0;
    
    return {
      proportional,
      integral,
      derivative,
      total: proportional + integral + derivative
    };
  }

  updateHistory() {
    const now = Date.now();
    
    this.dataHistory.angles.push(this.systemData.currentAngle);
    this.dataHistory.errors.push(this.systemData.error);
    this.dataHistory.times.push(now);
    
    // Mantener límite de datos históricos
    while (this.dataHistory.angles.length > this.dataHistory.maxPoints) {
      this.dataHistory.angles.shift();
      this.dataHistory.errors.shift();
      this.dataHistory.times.shift();
    }
  }

  updateStatistics() {
    if (this.dataHistory.angles.length === 0) return;
    
    const angles = this.dataHistory.angles;
    const errors = this.dataHistory.errors;
    
    // Estadísticas básicas
    const sum = angles.reduce((a, b) => a + b, 0);
    this.systemData.stats.avgAngle = sum / angles.length;
    
    const variance = angles.reduce((sq, n) => 
      sq + Math.pow(n - this.systemData.stats.avgAngle, 2), 0
    ) / angles.length;
    this.systemData.stats.stdAngle = Math.sqrt(variance);
    
    this.systemData.stats.minAngle = Math.min(...angles);
    this.systemData.stats.maxAngle = Math.max(...angles);
    
    // Estadísticas de error
    const avgError = errors.reduce((a, b) => a + Math.abs(b), 0) / errors.length;
    this.systemData.stats.avgError = avgError;
    this.systemData.stats.maxError = Math.max(...errors.map(Math.abs));
    
    // Tiempo de funcionamiento
    this.systemData.stats.uptime = Date.now() - this.startTime;
  }

  calculateStatistics() {
    return this.updateStatistics();
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
}

module.exports = SystemController;