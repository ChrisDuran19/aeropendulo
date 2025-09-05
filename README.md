# 🛰️ Servidor de Control con Express + WebSocket

Este proyecto es un **servidor de simulación y control en tiempo real** que integra **API REST** con Express y **WebSockets** para transmitir datos dinámicos.  
Incluye un sistema de control PID, simulación de ángulos, estadísticas y logging en tiempo real.

---

## 📦 Requisitos

- [Node.js](https://nodejs.org/) >= 16
- [npm](https://www.npmjs.com/)

---

## ⚙️ Instalación

1. Clonar el repositorio o copiar el código
   ```bash
   git clone https://github.com/tuusuario/tu-repo.git
   cd tu-repo
   ```

2. Instalar dependencias
   ```bash
   npm install express ws
   ```

   *(El código usa `crypto` y `http` que ya son nativos de Node.js).*

3. Crear los archivos necesarios:
   - `config.js` → Configuración del servidor y sistema
   - `logger.js` → Módulo de logging (personalizado)
   - Carpeta `public/` → Archivos estáticos y `index.html`

---

## 🚀 Uso

Para iniciar el servidor:

```bash
node server.js
```

Por defecto quedará corriendo en:

```
http://localhost:3000
```

---

## 🌐 Endpoints REST

- `GET /` → Página principal (`index.html`)
- `GET /health` → Estado de salud del servidor
- `GET /api/status` → Estado actual del sistema
- `GET /api/history?limit=100` → Últimos datos históricos
- `GET /api/logs` → Logs recientes
- `DELETE /api/logs` → Limpiar logs
- `POST /api/command` → Ejecutar un comando en el sistema  
  ```json
  {
    "command": "startSystem",
    "value": null
  }
  ```
- `PUT /api/pid` → Actualizar parámetros PID  
  ```json
  {
    "kp": 1.5,
    "ki": 0.2,
    "kd": 0.1
  }
  ```

---

## 📡 WebSocket

El servidor también expone un canal WebSocket para comunicación en tiempo real.

Conectar a:
```
ws://localhost:3000
```

### Mensajes soportados:

- **Ping/Pong**
  ```json
  { "type": "ping" }
  ```
- **Enviar comando**
  ```json
  { "type": "command", "command": "setTargetAngle", "value": 90 }
  ```
- **Solicitar historial**
  ```json
  { "type": "getHistory", "limit": 200 }
  ```

### Eventos recibidos:

- `welcome` → Datos iniciales de conexión
- `dataUpdate` → Actualización periódica de ángulos, error y estadísticas
- `commandResponse` → Respuesta a comandos
- `historyData` → Datos históricos
- `systemUpdate` → Actualización global del sistema

---

## 🎛️ Comandos disponibles

- `startSystem` → Inicia la simulación
- `stopSystem` → Detiene el sistema
- `emergencyStop` → Parada de emergencia
- `setTargetAngle` → Cambiar ángulo de referencia
- `resetSystem` → Reinicia todo el sistema

---

## 🧪 Ejemplo rápido con WebSocket (Node.js)

```js
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
  console.log('Conectado al servidor');
  ws.send(JSON.stringify({ type: 'command', command: 'startSystem' }));
});

ws.on('message', (msg) => {
  const data = JSON.parse(msg);
  console.log('Mensaje recibido:', data);
});
```

---

## 📖 Notas

- El servidor incluye **rate limiting básico** (100 requests / 15 min por IP).
- La simulación genera ruido, oscilaciones y disturbios aleatorios para emular un sistema real.
- Se recomienda ejecutar en entorno controlado antes de exponer en producción.

---

## 👨‍💻 Autor

**Cristian David Duran Grimaldo**  
📌 Proyecto personal para simulación y control en tiempo real.  
