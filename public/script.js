// script.js - Script mejorado para el frontend
class AeropenduloController {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.isPaused = false;
    this.angleData = [];
    this.timeData = [];
    this.dataPoints = 0;
    this.maxDataPoints = 60;
    this.angleChart = null;
    
    this.init();
  }

  init() {
    this.initializeChart();
    this.connectWebSocket();
    this.setupEventListeners();
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('Conectado al servidor');
      this.isConnected = true;
      this.updateConnectionStatus(true);
      this.addLogEntry('Conectado al servidor', 'info');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleServerMessage(data);
      } catch (error) {
        console.error('Error procesando mensaje:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('Desconectado del servidor. Reintentando en 3 segundos...');
      this.isConnected = false;
      this.updateConnectionStatus(false);
      this.addLogEntry('Desconectado del servidor', 'warning');
      setTimeout(() => this.connectWebSocket(), 3000);
    };

    this.ws.onerror = (error) => {
      console.error('Error de WebSocket:', error);
      this.addLogEntry('Error de conexión', 'error');
    };
  }

  handleServerMessage(data) {
    switch (data.type) {
      case 'init':
        this.updateSystemData(data.system);
        break;
        
      case 'dataUpdate':
        this.updateUIData(data);
        break;
        
      case 'systemUpdate':
        this.updateSystemData(data.system);
        break;
        
      case 'pong':
        // Respuesta al ping
        break;
        
      default:
        console.log('Mensaje desconocido:', data);
    }
  }

  updateUIData(data) {
    const angle = parseFloat(data.data.currentAngle);
    const reference = data.data.referenceAngle;
    const error = data.data.error;

    // Actualizar valores en la interfaz
    document.getElementById('currentAngle').textContent = angle.toFixed(1) + '°';
    document.getElementById('referenceAngle').textContent = reference + '°';
    document.getElementById('errorValue').textContent = error.toFixed(1) + '°';

    // Actualizar gauge
    this.updateGauge(angle);

    // Actualizar gráfico si no está pausado
    if (!this.isPaused) {
      this.angleData.push(angle);
      this.timeData.push(this.dataPoints++);
      
      if (this.angleData.length > this.maxDataPoints) {
        this.angleData.shift();
        this.timeData.shift();
      }

      if (this.angleChart) {
        this.angleChart.data.labels = this.timeData;
        this.angleChart.data.datasets[0].data = this.angleData;
        this.angleChart.data.datasets[1].data = new Array(this.angleData.length).fill(reference);
        this.angleChart.update('none');
      }

      // Actualizar estadísticas
      this.updateStatistics(data.data.stats);
    }
  }

  updateSystemData(system) {
    // Actualizar estado del sistema en la UI
    document.getElementById('referenceAngle').textContent = system.referenceAngle + '°';
    
    // Actualizar controles
    document.getElementById('targetAngle').value = system.referenceAngle;
    document.getElementById('angleSlider').value = system.referenceAngle;
    
    // Actualizar PID
    if (system.pid) {
      document.getElementById('kp').value = system.pid.kp;
      document.getElementById('ki').value = system.pid.ki;
      document.getElementById('kd').value = system.pid.kd;
    }
  }

  initializeChart() {
    const ctx = document.getElementById('angleChart').getContext('2d');
    
    this.angleChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Ángulo Actual',
          data: [],
          borderColor: '#00d4ff',
          backgroundColor: 'rgba(0, 212, 255, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4
        }, {
          label: 'Referencia',
          data: [],
          borderColor: '#00ff88',
          borderWidth: 1,
          borderDash: [5, 5],
          fill: false,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 0
        },
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#ffffff',
              usePointStyle: true
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            borderColor: '#00d4ff',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: {
              display: true,
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: '#b3b3b3',
              maxTicksLimit: 10
            }
          },
          y: {
            min: -90,
            max: 90,
            grid: {
              display: true,
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: '#b3b3b3',
              callback: function(value) {
                return value + '°';
              }
            }
          }
        }
      }
    });
  }

  updateGauge(angle) {
    const gaugeFill = document.querySelector('.gauge-fill');
    if (gaugeFill) {
      const normalizedAngle = Math.max(0, Math.min(1, (angle + 90) / 180));
      const circumference = 2 * Math.PI * 70;
      const strokeDasharray = (normalizedAngle * circumference * 0.5) + ' ' + circumference;
      gaugeFill.style.strokeDasharray = strokeDasharray;
    }
  }

  updateStatistics(stats) {
    if (stats) {
      document.getElementById('avgAngle').textContent = stats.avgAngle.toFixed(1) + '°';
      document.getElementById('stdAngle').textContent = stats.stdAngle.toFixed(1) + '°';
      document.getElementById('minMaxAngle').textContent = `${stats.minAngle.toFixed(1)}° / ${stats.maxAngle.toFixed(1)}°`;
    }
  }

  updateConnectionStatus(connected) {
    const indicator = document.querySelector('.connection-status .status-indicator');
    const statusText = document.querySelector('.connection-status span');
    
    if (connected) {
      indicator.className = 'status-indicator status-connected';
      statusText.textContent = 'Conectado';
    } else {
      indicator.className = 'status-indicator status-error';
      statusText.textContent = 'Desconectado';
    }
  }

  setupEventListeners() {
    // Controles del sistema
    document.getElementById('startStopBtn').addEventListener('click', () => this.toggleSystem());
    document.getElementById('targetAngle').addEventListener('input', (e) => this.updateTargetAngle(e.target.value));
    document.getElementById('angleSlider').addEventListener('input', (e) => this.updateTargetAngle(e.target.value));
    
    // PID Controls
    ['kp', 'ki', 'kd'].forEach(param => {
      document.getElementById(param).addEventListener('change', (e) => {
        this.sendPIDCommand();
      });
    });
  }

  sendCommand(command, value = null) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = {
        type: 'command',
        command: command,
        value: value,
        timestamp: new Date().toISOString()
      };
      this.ws.send(JSON.stringify(message));
    }
  }

  toggleSystem() {
    const isRunning = document.getElementById('startStopBtn').classList.contains('btn-active');
    if (isRunning) {
      this.sendCommand('stopSystem');
      this.updateSystemButton(false);
    } else {
      this.sendCommand('startSystem');
      this.updateSystemButton(true);
    }
  }

  updateSystemButton(isRunning) {
    const btn = document.getElementById('startStopBtn');
    const text = document.getElementById('startStopText');
    const icon = document.getElementById('playIcon');
    
    if (isRunning) {
      text.textContent = 'Detener';
      icon.innerHTML = '<path d="M6 6H18V18H6V6Z"/>';
      btn.classList.add('btn-active');
    } else {
      text.textContent = 'Iniciar';
      icon.innerHTML = '<path d="M8 5V19L19 12L8 5Z"/>';
      btn.classList.remove('btn-active');
    }
  }

  updateTargetAngle(value) {
    document.getElementById('targetAngle').value = value;
    document.getElementById('angleSlider').value = value;
    this.sendCommand('setTargetAngle', value);
  }

  sendPIDCommand() {
    const pid = {
      kp: parseFloat(document.getElementById('kp').value) || 1.2,
      ki: parseFloat(document.getElementById('ki').value) || 0.1,
      kd: parseFloat(document.getElementById('kd').value) || 0.05
    };
    this.sendCommand('setPID', pid);
  }

  addLogEntry(message, type = 'info') {
    const logContainer = document.getElementById('eventLog');
    const entry = document.createElement('div');
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-ES', { hour12: false });
    
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `
      <span class="log-time">${timeStr}</span>
      <span class="log-message">${message}</span>
    `;
    
    logContainer.insertBefore(entry, logContainer.firstChild);
    
    // Limitar a 50 entradas
    while (logContainer.children.length > 50) {
      logContainer.removeChild(logContainer.lastChild);
    }
  }

  updateClock() {
    const now = new Date();
    const options = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    };
    document.getElementById('currentTime').textContent = now.toLocaleDateString('es-ES', options);
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
  window.controller = new AeropenduloController();
});