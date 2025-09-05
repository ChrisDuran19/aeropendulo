// utils/validation.js

/**
 * Valida comandos del sistema
 * @param {string} command - Comando a validar
 * @param {any} value - Valor asociado al comando
 * @returns {Object} Resultado de validación
 */
function validateCommand(command, value) {
  const result = {
    valid: false,
    errors: []
  };

  // Comandos válidos
  const validCommands = [
    'startSystem',
    'stopSystem', 
    'emergencyStop',
    'setTargetAngle',
    'resetSystem',
    'calibrate'
  ];

  // Verificar si el comando es válido
  if (!command || typeof command !== 'string') {
    result.errors.push('Comando requerido y debe ser una cadena');
    return result;
  }

  if (!validCommands.includes(command)) {
    result.errors.push(`Comando inválido. Comandos válidos: ${validCommands.join(', ')}`);
    return result;
  }

  // Validaciones específicas por comando
  switch (command) {
    case 'setTargetAngle':
      if (value === undefined || value === null) {
        result.errors.push('Valor requerido para setTargetAngle');
        break;
      }
      
      const angle = parseFloat(value);
      if (isNaN(angle)) {
        result.errors.push('El valor del ángulo debe ser un número');
      } else if (angle < -180 || angle > 180) {
        result.errors.push('El ángulo debe estar entre -180 y 180 grados');
      }
      break;

    case 'startSystem':
    case 'stopSystem':
    case 'emergencyStop':
    case 'resetSystem':
    case 'calibrate':
      // Estos comandos no requieren valor
      if (value !== undefined && value !== null && value !== '') {
        result.errors.push(`El comando ${command} no acepta valores adicionales`);
      }
      break;

    default:
      result.errors.push(`Validación no implementada para el comando: ${command}`);
  }

  result.valid = result.errors.length === 0;
  return result;
}

/**
 * Valida parámetros PID
 * @param {Object} pidParams - Parámetros PID a validar
 * @returns {Object} Resultado de validación
 */
function validatePIDParams(pidParams) {
  const result = {
    valid: false,
    errors: []
  };

  if (!pidParams || typeof pidParams !== 'object') {
    result.errors.push('Parámetros PID deben ser un objeto');
    return result;
  }

  const validParams = ['kp', 'ki', 'kd'];
  const providedParams = Object.keys(pidParams);

  // Verificar que al menos un parámetro válido esté presente
  const hasValidParam = providedParams.some(param => validParams.includes(param));
  if (!hasValidParam) {
    result.errors.push(`Debe proporcionar al menos uno de: ${validParams.join(', ')}`);
    return result;
  }

  // Validar cada parámetro
  for (const [param, value] of Object.entries(pidParams)) {
    if (!validParams.includes(param)) {
      result.errors.push(`Parámetro PID inválido: ${param}`);
      continue;
    }

    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      result.errors.push(`${param} debe ser un número`);
      continue;
    }

    if (numValue < 0) {
      result.errors.push(`${param} debe ser mayor o igual a 0`);
      continue;
    }

    // Rangos razonables para parámetros PID
    const ranges = {
      kp: { min: 0, max: 100 },
      ki: { min: 0, max: 10 },
      kd: { min: 0, max: 10 }
    };

    if (numValue > ranges[param].max) {
      result.errors.push(`${param} (${numValue}) excede el valor máximo recomendado (${ranges[param].max})`);
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

/**
 * Valida parámetros de consulta de historial
 * @param {Object} params - Parámetros a validar
 * @returns {Object} Resultado de validación
 */
function validateHistoryParams(params) {
  const result = {
    valid: false,
    errors: []
  };

  const { limit, from, to } = params;

  // Validar limit
  if (limit !== undefined) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum)) {
      result.errors.push('limit debe ser un número entero');
    } else if (limitNum < 1) {
      result.errors.push('limit debe ser mayor a 0');
    } else if (limitNum > 10000) {
      result.errors.push('limit no puede exceder 10000');
    }
  }

  // Validar fechas
  if (from !== undefined) {
    const fromDate = new Date(from);
    if (isNaN(fromDate.getTime())) {
      result.errors.push('from debe ser una fecha válida');
    }
  }

  if (to !== undefined) {
    const toDate = new Date(to);
    if (isNaN(toDate.getTime())) {
      result.errors.push('to debe ser una fecha válida');
    }
  }

  // Validar rango de fechas
  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    
    if (fromDate.getTime() >= toDate.getTime()) {
      result.errors.push('from debe ser anterior a to');
    }

    // Verificar que el rango no sea muy grande (máximo 30 días)
    const maxRangeMs = 30 * 24 * 60 * 60 * 1000; // 30 días
    if (toDate.getTime() - fromDate.getTime() > maxRangeMs) {
      result.errors.push('El rango de fechas no puede exceder 30 días');
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

/**
 * Valida dirección IP
 * @param {string} ip - IP a validar
 * @returns {boolean} True si es válida
 */
function validateIP(ip) {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip) || ip === 'localhost' || ip === '::1';
}

/**
 * Sanitiza entrada de usuario
 * @param {string} input - Entrada a sanitizar
 * @returns {string} Entrada sanitizada
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .replace(/[<>]/g, '') // Remover < >
    .replace(/javascript:/gi, '') // Remover javascript:
    .replace(/on\w+=/gi, '') // Remover event handlers
    .trim()
    .substring(0, 1000); // Limitar longitud
}

/**
 * Valida estructura de mensaje WebSocket
 * @param {Object} message - Mensaje a validar
 * @returns {Object} Resultado de validación
 */
function validateWebSocketMessage(message) {
  const result = {
    valid: false,
    errors: []
  };

  if (!message || typeof message !== 'object') {
    result.errors.push('El mensaje debe ser un objeto');
    return result;
  }

  if (!message.type || typeof message.type !== 'string') {
    result.errors.push('El mensaje debe tener un tipo válido');
    return result;
  }

  // Validar tamaño del mensaje
  const messageSize = JSON.stringify(message).length;
  if (messageSize > 10000) { // 10KB máximo
    result.errors.push('El mensaje es demasiado grande');
    return result;
  }

  // Tipos de mensaje válidos
  const validTypes = [
    'command',
    'ping',
    'subscribe',
    'unsubscribe',
    'getHistory',
    'heartbeat'
  ];

  if (!validTypes.includes(message.type)) {
    result.errors.push(`Tipo de mensaje inválido: ${message.type}`);
    return result;
  }

  // Validaciones específicas por tipo
  switch (message.type) {
    case 'command':
      if (!message.command) {
        result.errors.push('Comando requerido');
      }
      break;

    case 'subscribe':
    case 'unsubscribe':
      if (!Array.isArray(message.channels)) {
        result.errors.push('channels debe ser un array');
      }
      break;

    case 'getHistory':
      if (message.limit !== undefined) {
        const limitNum = parseInt(message.limit);
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
          result.errors.push('limit debe ser un número entre 1 y 1000');
        }
      }
      break;
  }

  result.valid = result.errors.length === 0;
  return result;
}

/**
 * Valida configuración del sistema
 * @param {Object} config - Configuración a validar
 * @returns {Object} Resultado de validación
 */
function validateSystemConfig(config) {
  const result = {
    valid: false,
    errors: []
  };

  if (!config || typeof config !== 'object') {
    result.errors.push('La configuración debe ser un objeto');
    return result;
  }

  // Validar configuración del servidor
  if (config.server) {
    const { host, port, allowedOrigins } = config.server;
    
    if (host && typeof host !== 'string') {
      result.errors.push('server.host debe ser una cadena');
    }

    if (port !== undefined) {
      const portNum = parseInt(port);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        result.errors.push('server.port debe ser un número entre 1 y 65535');
      }
    }

    if (allowedOrigins && !Array.isArray(allowedOrigins)) {
      result.errors.push('server.allowedOrigins debe ser un array');
    }
  }

  // Validar configuración del sistema
  if (config.system) {
    const { updateInterval, maxDataPoints } = config.system;

    if (updateInterval !== undefined) {
      const intervalNum = parseInt(updateInterval);
      if (isNaN(intervalNum) || intervalNum < 10 || intervalNum > 10000) {
        result.errors.push('system.updateInterval debe ser un número entre 10 y 10000 ms');
      }
    }

    if (maxDataPoints !== undefined) {
      const pointsNum = parseInt(maxDataPoints);
      if (isNaN(pointsNum) || pointsNum < 100 || pointsNum > 100000) {
        result.errors.push('system.maxDataPoints debe ser un número entre 100 y 100000');
      }
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

module.exports = {
  validateCommand,
  validatePIDParams,
  validateHistoryParams,
  validateIP,
  sanitizeInput,
  validateWebSocketMessage,
  validateSystemConfig
};