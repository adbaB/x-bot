# 🤖 X Bot — Publicador de Posts con Menciones (Serverless Ready)

Este bot de Node.js permite publicar posts/tweets en X mencionando a una lista de usuarios. 
---

## 📋 Requisitos

* **Node.js** v18+
* **Cuenta de desarrollador en X** con acceso de lectura y escritura (Read & Write).

---

## 🚀 Instalación y Configuración

### 1. Clonar/Ubicar el proyecto e instalar dependencias

```bash
cd E:\x-bot
npm install
```

### 2. Configurar los Permisos de la App en X Portal
1. Ve al [X Developer Portal](https://developer.x.com).
2. Entra a la configuración de tu **App** (dentro de tu proyecto).
3. Dirígete a **User authentication settings** y haz clic en **Edit**.
4. En **App permissions**, selecciona obligatoriamente **Read and Write** (Lectura y Escritura).
5. Guarda los cambios.

### 3. Obtener tus Keys y Tokens Estáticos
1. En la pestaña **Keys and tokens** de tu App:
   * En **Consumer Keys**, genera y copia:
     * `API Key` (Consumer Key)
     * `API Key Secret` (Consumer Secret)
   * En **Authentication Tokens**, genera y copia (asegúrate de que tenga permisos *Created with Read and Write*):
     * `Access Token`
     * `Access Token Secret`

### 4. Configurar el archivo `.env`
Crea o edita tu archivo `.env` en la raíz del proyecto con las credenciales que obtuviste:

```env
API_KEY=tu_api_key
API_KEY_SECRET=tu_api_key_secret
ACCESS_TOKEN=tu_access_token
ACCESS_TOKEN_SECRET=tu_access_token_secret
```

---

## 📄 Preparar la Lista de Usuarios

Edita el archivo `usuarios.txt` y agrega los nombres de usuario de X que quieres mencionar (uno por línea):

```text
usuario_ejemplo1
@usuario_ejemplo2
usuario_ejemplo3
```
*Nota: El bot limpia automáticamente los caracteres `@` y espacios.*

---

## 🛠️ Modos de Uso

### 1. Ejecución Local (Pruebas)

* **Modo Simulación (Dry Run):** Prueba el funcionamiento y el formato de los mensajes sin publicar realmente en X y sin gastar cuota de API.
  ```bash
  npm test
  ```

* **Enviar posts reales:**
  ```bash
  npm start
  ```

### 2. Modificadores por CLI

Puedes pasar parámetros al script para controlar su comportamiento en ejecuciones manuales o cron:

```bash
# Limitar a un número máximo de envíos por esta ejecución (ej. 500 tweets)
node bot.js --batch 500

# Cambiar el tiempo de espera entre posts (en milisegundos, por defecto 3000ms)
node bot.js --delay 5000

# Sobrescribir el mensaje predeterminado desde la terminal
node bot.js --message "Hola {usuario}! Te invito a probar esto 🚀"
```

---

## ☁️ Integración en Serverless (ej. AWS Lambda o Vercel)

El script `bot.js` exporta la función principal `main` y el objeto `CONFIG`. Esto te permite importarlo como un módulo de Node.js dentro de tus funciones Lambda o Vercel Serverless:

```javascript
import { main, CONFIG } from './bot.js';

export async function handler(event) {
  // Opcional: configurar parámetros dinámicamente desde el evento
  CONFIG.batchSize = event.batchSize || 10;
  
  await main();
  
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Bot ejecutado exitosamente" })
  };
}
```

---

## 💾 Archivos del Proyecto

| Archivo | Descripción |
|---|---|
| `bot.js` | Script principal del bot y lógica de envío. |
| `x-client.js` | Cliente ligero para X API v2 usando firmas OAuth 1.0a sin SDKs pesados. |
| `usuarios.txt` | Lista de nombres de usuario a mencionar. |
| `procesados.log` | Registro auto-generado de usuarios ya contactados (evita duplicados). |
| `.env` | Archivo de configuración para tus credenciales locales. |

