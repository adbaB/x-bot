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

* **Bot de API Directa (OAuth):**
  * **Modo Simulación (Dry Run):**
    ```bash
    npm test
    ```
  * **Ejecutar envíos reales:**
    ```bash
    npm start
    ```

* **Bot de Navegador Real (Selenium):**
  * **Modo Simulación (Dry Run):**
    ```bash
    npm run selenium:test
    ```
  * **Ejecutar envíos reales:**
    ```bash
    npm run selenium
    ```

### 2. Modificadores por CLI

Puedes pasar parámetros al script para controlar su comportamiento en ejecuciones manuales o cron:

```bash
# Limitar a un número máximo de envíos por esta ejecución (ej. 500 tweets)
node bot.js --batch 500

# Cambiar el tiempo de espera entre posts (en milisegundos, por defecto 3000ms)
node bot.js --delay 5000

# Definir la cantidad de tweets antes de rotar a la siguiente cuenta (por defecto 5)
node bot.js --tweets-per-account 10

# Sobrescribir el mensaje predeterminado desde la terminal (desactiva las variantes)
node bot.js --message "Hola {usuario}! Te invito a probar esto 🚀"
```

---

## 🔀 Variantes de Mensajes

Para evitar que X detecte tus mensajes como spam, ambos bots soportan el uso de múltiples variantes de mensajes. El bot elegirá una variante diferente para cada usuario de forma aleatoria (por defecto) o secuencial.

En el objeto `CONFIG` de ambos scripts puedes definir las variantes:
- `messages`: Un array con plantillas de texto. Usa `{usuario}` para indicar dónde se colocará la mención (ej. `@nombreusuario`).
- `variantMode`: `'random'` (aleatorio, por defecto) o `'round-robin'` (secuencial rotativo).

---

## 👥 Soporte Multi-cuenta (Rotación)

Para distribuir la carga entre varias cuentas y evitar límites o bloqueos:

1. Crea un archivo llamado `cuentas.json` en la raíz del proyecto (basándote en `cuentas.example.json`).
2. Define tus cuentas con este formato:
   ```json
   [
     {
       "username": "cuenta_uno",
       "apiKey": "TU_API_KEY",
       "apiKeySecret": "TU_API_KEY_SECRET",
       "accessToken": "TU_ACCESS_TOKEN",
       "accessTokenSecret": "TU_ACCESS_TOKEN_SECRET"
     },
     {
       "username": "cuenta_dos",
       "apiKey": "TU_API_KEY",
       "apiKeySecret": "TU_API_KEY_SECRET",
       "accessToken": "TU_ACCESS_TOKEN",
       "accessTokenSecret": "TU_ACCESS_TOKEN_SECRET"
     }
   ]
   ```
   *(Si solo usas Selenium, puedes omitir los campos de API key y tokens; solo se requiere `username`).*

3. Configura el límite de tweets por cuenta antes de rotar:
   - En `CONFIG.tweetsPerAccount` (por defecto `5`).
   - O mediante el argumento de terminal `--tweets-per-account 10`.

* **En el Bot de API (`bot.js`)**: El script cambiará las credenciales dinámicamente cada lote de tweets.
* **En el Bot de Selenium (`selenium-bot.js`)**: El script abrirá y cerrará navegadores de Chrome con perfiles independientes (`.chrome_profile_<username>`) para mantener las sesiones de cada cuenta separadas e iniciadas de forma independiente.

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
| `bot.js` | Script principal de envío directo usando la API de X. |
| `selenium-bot.js` | Script principal de envío simulando un navegador Chrome real con Selenium. |
| `x-client.js` | Cliente ligero para X API v2 usando firmas OAuth 1.0a sin SDKs pesados. |
| `usuarios.txt` | Lista de nombres de usuario a mencionar. |
| `procesados.log` | Registro auto-generado de usuarios ya contactados (evita duplicados). |
| `cuentas.json` | Lista de cuentas de X para rotación de envíos (ignorado en git). |
| `cuentas.example.json` | Plantilla modelo para configurar `cuentas.json`. |
| `.env` | Configuración para cuenta única legacy. |

