// ============================================================
//  X Bot — Publicar posts mencionando usuarios via Selenium
//  Navegador Real — Sin API Developer — Sesión Persistente
// ============================================================
//  Uso:
//    node selenium-bot.js                        → Envía los posts
//    node selenium-bot.js --dry-run              → Simula sin publicar
//    node selenium-bot.js --delay 10000          → Espera 10s entre posts
//    node selenium-bot.js --batch 5              → Envía solo 5 posts
// ============================================================

import 'dotenv/config';
import chalk from 'chalk';
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Builder, By, until, Key } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Configuración ──────────────────────────────────────────
const CONFIG = {
  // Variantes de mensajes. Si hay más de una, el bot elegirá una para cada post.
  messages: [
    `🚨 {usuario} Necesitamos apoyo para difundir esta herramienta. En este portal se está unificando la información verificada, puntos de acopio y reportes del terremoto en Venezuela.
🔗 https://terremotovenezuela.app/
¡Agradecemos tu RT para llegar a más personas! 🙌`,
    `📌 {usuario} ¿Nos ayudas a compartir? Crearon una plataforma que centraliza reportes de daños, centros de ayuda y canales oficiales por el sismo en Venezuela. Toda la info en un solo lugar:
👉 https://terremotovenezuela.app/
#TerremotoVenezuela`,
    `🇻🇪 Ante la emergencia, la información correcta salva vidas. {usuario}, ayúdanos a hacer eco de esta iniciativa que reúne mapas de reportes y centros de acopio en el país:
🌐 https://terremotovenezuela.app/
¡Tu difusión es vital en este momento! RT`,
    `📦 Si necesitas reportar una incidencia o buscas dónde llevar donaciones por el temblor en Venezuela, esta app centraliza la ayuda. {usuario}, ayúdanos a que más gente la conozca:
🔗 https://terremotovenezuela.app/`
  ],

  message: `¡Hola {usuario}! 👋

Te comparto esta información importante:

🔗 [Tu info aquí]

¡Saludos! 🚀`,

  // Modo de selección de variante: 'random' (aleatorio) o 'round-robin' (secuencial)
  variantMode: 'round-robin',

  usuarios: ['usuario1', 'usuario2', 'usuario3'],
  delayMs: 8000, // Mayor delay para Selenium para imitar comportamiento humano
  batchSize: 0,

  // Tweets por cuenta antes de cambiar de cuenta
  tweetsPerAccount: 5,
};

// ─── Parsear argumentos CLI ─────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

if (getArg('--delay')) CONFIG.delayMs = parseInt(getArg('--delay'), 10);
if (getArg('--batch')) CONFIG.batchSize = parseInt(getArg('--batch'), 10);
if (getArg('--tweets-per-account')) CONFIG.tweetsPerAccount = parseInt(getArg('--tweets-per-account'), 10);
if (getArg('--message')) {
  CONFIG.message = getArg('--message');
  CONFIG.messages = []; // Limpiamos para usar el mensaje único
}

// ─── Cargar usuarios y procesados ───────────────────────────
function cargarUsuarios() {
  const file = resolve(__dirname, 'usuarios.txt');
  if (!existsSync(file)) return CONFIG.usuarios;

  const lista = readFileSync(file, 'utf-8')
    .split('\n')
    .map(l => l.trim().replace(/^@/, ''))
    .filter(l => l.length > 0 && !l.startsWith('#'));

  if (lista.length > 0) {
    console.log(chalk.cyan(`📄 Cargados ${lista.length} usuarios desde usuarios.txt`));
    return lista;
  }
  return CONFIG.usuarios;
}

function cargarProcesados() {
  const file = resolve(__dirname, 'procesados.log');
  if (!existsSync(file)) return new Set();
  return new Set(readFileSync(file, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean));
}

function marcarProcesado(usuario) {
  appendFileSync(resolve(__dirname, 'procesados.log'), usuario + '\n', 'utf-8');
}

// ─── Cargar cuentas ──────────────────────────────────────────
function cargarCuentas() {
  const file = resolve(__dirname, 'cuentas.json');
  if (!existsSync(file)) return [];
  try {
    const list = JSON.parse(readFileSync(file, 'utf-8'));
    if (Array.isArray(list) && list.length > 0) {
      return list;
    }
  } catch (error) {
    console.error(chalk.red(`❌ Error al leer cuentas.json: ${error.message}`));
  }
  return [];
}

// ─── Utilidades ─────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toLocaleString('es-ES');

// ─── Lógica de Navegador (Selenium) ──────────────────────────

async function inicializarDriver(username) {
  const suffix = username ? `_${username}` : '';
  const profileDir = resolve(__dirname, `.chrome_profile${suffix}`);
  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }

  const options = new chrome.Options();
  
  // Usar perfil de Chrome persistente para mantener la sesión iniciada
  options.addArguments(`--user-data-dir=${profileDir}`);
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');
  
  // Evitar detección básica de automatización
  options.addArguments('--disable-blink-features=AutomationControlled');
  options.excludeSwitches('enable-automation');
  options.excludeSwitches('enable-logging'); // Silenciar logs de depuración interna de Chrome
  options.addArguments('--log-level=3');     // Mostrar solo errores fatales de Chrome
  options.addArguments('--silent');          // Reducir la verbosidad de salida

  console.log(chalk.blue('🌐 Iniciando navegador Chrome con sesión persistente...'));
  
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  // Modificar navigator.webdriver mediante script para pasar más chequeos
  await driver.executeScript("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})");

  return driver;
}

async function loginX(driver) {
  console.log(chalk.blue('🔗 Navegando a X.com...'));
  await driver.get('https://x.com/home');
  await sleep(4000);

  let currentUrl = await driver.getCurrentUrl();

  // Si ya estamos en la página de inicio, omitir login
  if (currentUrl.includes('/home')) {
    console.log(chalk.green('✅ Sesión existente detectada. Listo para publicar.'));
    return true;
  }

  console.log(chalk.yellow('\n🔑 No se detectó sesión activa.'));
  console.log(chalk.yellow('💡 [ACCIÓN REQUERIDA] Por favor, inicia sesión MANUALMENTE en la ventana de Chrome abierta.'));
  console.log(chalk.gray('   Nota: Para evitar bloqueos temporales de X por automatización, no escribiremos'));
  console.log(chalk.gray('   las credenciales automáticamente. Solo debes loguearte una vez y el bot guardará la sesión.'));
  
  await driver.get('https://x.com/login');

  // Esperar a que el usuario complete el login manualmente (máx. 5 minutos)
  console.log(chalk.cyan('\n⏳ Esperando a que inicies sesión en el navegador (máx. 5 minutos)...'));
  console.log(chalk.cyan('   (Resuelve captchas, códigos de verificación o limitaciones si aparecen)'));

  for (let i = 0; i < 150; i++) {
    try {
      const url = await driver.getCurrentUrl();
      if (url.includes('/home') || url.includes('/compose/post')) {
        console.log(chalk.green('\n🎉 ¡Inicio de sesión detectado con éxito!'));
        await sleep(3000);
        return true;
      }
    } catch (err) {
      // Ignorar errores temporales si el navegador está cargando o respondiendo lento
    }
    await sleep(2000);
  }

  throw new Error('Timeout esperando el inicio de sesión manual. Por favor, vuelve a iniciar el script cuando puedas loguearte.');
}

async function publicarTweet(driver, mensaje, dryRun) {
  // Ir directo a la URL de composición para evitar clics en la UI
  await driver.get('https://x.com/compose/post');
  await sleep(4000);

  // Esperar y buscar el campo de texto editable
  const textbox = await driver.wait(
    until.elementLocated(By.css('div[data-testid="tweetTextarea_0"]')),
    10000
  );

  // Limpiar y escribir el mensaje
  await textbox.click();
  await sleep(500);
  
  await driver.executeScript((el, text) => {
    el.focus();
    
    // Limpiar el editor completamente
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    
    // Crear un evento de Pegado (Paste) sintético
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true
    });
    
    // Despachar el evento en el editor editable para que Draft.js procese los saltos de línea y emojis
    el.dispatchEvent(pasteEvent);
  }, textbox, mensaje);
  
  await sleep(2500); // Esperar a que se procese el pegado, el formato y se rendericen las menciones

  if (dryRun) {
    console.log(chalk.yellow('   ⚠️ [DRY RUN] Simulación de envío:'));
    console.log(chalk.gray(`   💬 "${mensaje.replace(/\n/g, ' ')}"`));
    // Cancelar/cerrar modal
    try {
      await driver.get('https://x.com/home');
      await sleep(1000);
      // Si aparece alerta de descartar post
      const alert = await driver.switchTo().alert().catch(() => null);
      if (alert) await alert.accept();
    } catch (e) {}
    return true;
  }

  // Buscar el botón de publicar/Postear
  // Buscamos por data-testid="tweetButton" o "tweetButtonInline"
  const postBtn = await driver.wait(
    until.elementLocated(By.css('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')),
    5000
  );

  // Hacer clic en publicar (usamos script inyectado para evitar que popups de autocompletado bloqueen el click)
  await driver.executeScript('arguments[0].click();', postBtn);
  console.log(chalk.green('   ✅ Botón de publicar presionado.'));
  
  // Esperar a que se cierre el composer o aparezca confirmación
  await sleep(5000); 
  return true;
}

// ─── Función Principal ──────────────────────────────────────
async function main() {
  console.log(chalk.bold.blue(`\n🤖 X Bot (Selenium) — ${ts()}\n`));
  console.log(chalk.gray('─'.repeat(60)));

  let usuarios = cargarUsuarios();
  const procesados = cargarProcesados();
  const antes = usuarios.length;
  usuarios = usuarios.filter(u => !procesados.has(u));

  if (antes !== usuarios.length) {
    console.log(chalk.cyan(`🔄 Saltando ${antes - usuarios.length} ya procesados`));
  }

  if (CONFIG.batchSize > 0 && usuarios.length > CONFIG.batchSize) {
    console.log(chalk.cyan(`📦 Batch: ${CONFIG.batchSize} de ${usuarios.length} pendientes`));
    usuarios = usuarios.slice(0, CONFIG.batchSize);
  }

  if (usuarios.length === 0) {
    console.log(chalk.green('\n✅ No hay usuarios pendientes por procesar.\n'));
    return;
  }

  console.log(chalk.white(`📋 Usuarios a procesar: ${chalk.bold(usuarios.length)}`));
  console.log(chalk.white(`⏱️  Espera entre posts:   ${chalk.bold(CONFIG.delayMs + 'ms')}`));
  if (dryRun) console.log(chalk.yellow('⚠️  Ejecutando en Modo DRY RUN (Simulación)'));
  console.log(chalk.gray('─'.repeat(60)));

  const cuentas = cargarCuentas();
  if (cuentas.length > 0) {
    console.log(chalk.cyan(`👥 Cargadas ${cuentas.length} cuentas desde cuentas.json`));
  }

  let driver = null;
  let currentAccountIndex = -2; // Valor que no coincida con -1 o 0

  try {
    let exitosos = 0;
    let fallidos = 0;

    for (let i = 0; i < usuarios.length; i++) {
      const usuario = usuarios[i];
      
      // Determinar cuenta y rotar si es necesario
      const accountIndex = cuentas.length > 0 
        ? Math.floor(i / CONFIG.tweetsPerAccount) % cuentas.length 
        : -1;

      if (accountIndex !== currentAccountIndex) {
        currentAccountIndex = accountIndex;
        if (driver) {
          console.log(chalk.blue('   🔌 Cerrando navegador de la cuenta anterior...'));
          try {
            await driver.quit();
          } catch (e) {}
          driver = null;
        }

        const currentCuenta = accountIndex !== -1 ? cuentas[accountIndex] : null;
        const currentUsername = currentCuenta ? currentCuenta.username : null;

        if (currentUsername) {
          console.log(chalk.blue(`\n🔄 Cambiando a cuenta: @${currentUsername} (Lote de ${CONFIG.tweetsPerAccount})`));
        } else {
          console.log(chalk.blue(`\n🔄 Usando cuenta por defecto...`));
        }

        driver = await inicializarDriver(currentUsername);
        await loginX(driver);
      }
      
      // Seleccionar plantilla del mensaje (variante)
      let plantilla = CONFIG.message;
      if (CONFIG.messages && CONFIG.messages.length > 0) {
        if (CONFIG.variantMode === 'round-robin') {
          plantilla = CONFIG.messages[i % CONFIG.messages.length];
        } else {
          // Por defecto 'random'
          const randomIndex = Math.floor(Math.random() * CONFIG.messages.length);
          plantilla = CONFIG.messages[randomIndex];
        }
      }

      const mensaje = plantilla.replace(/\{usuario\}/g, `@${usuario}`);

      console.log(chalk.white(`\n[${i + 1}/${usuarios.length}] → Enviando a @${usuario}...`));

      try {
        await publicarTweet(driver, mensaje, dryRun);
        exitosos++;
        if (!dryRun) {
          marcarProcesado(usuario);
        }
      } catch (err) {
        console.log(chalk.red(`   ❌ Error al publicar para @${usuario}: ${err.message}`));
        fallidos++;
        
        // Si nos deslogueó o cerraron la ventana, detener
        try {
          await driver.getCurrentUrl();
        } catch (e) {
          console.log(chalk.red('\n💥 Se perdió la conexión con el navegador. Abortando...'));
          break;
        }
      }

      // Esperar delay
      if (i < usuarios.length - 1) {
        const delayRnd = CONFIG.delayMs + Math.floor(Math.random() * 3000); // Añadir variación humana
        console.log(chalk.gray(`   ⏳ Esperando ${Math.round(delayRnd / 1000)} segundos...`));
        await sleep(delayRnd);
      }
    }

    console.log(chalk.gray('\n' + '─'.repeat(60)));
    console.log(chalk.bold.blue('📊 Resumen de Ejecución:'));
    console.log(chalk.green(`   ✅ Exitosos: ${exitosos}`));
    if (fallidos > 0) console.log(chalk.red(`   ❌ Fallidos:  ${fallidos}`));
    console.log(chalk.white(`   📋 Total:     ${usuarios.length}`));
    console.log(chalk.gray('─'.repeat(60) + '\n'));

  } catch (error) {
    console.error(chalk.red('\n💥 Error Fatal en la ejecución:'), error.message);
  } finally {
    if (driver) {
      console.log(chalk.blue('🔌 Cerrando navegador en 5 segundos...'));
      await sleep(5000);
      try {
        await driver.quit();
      } catch (e) {}
    }
  }
}

main();
