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
  message: `¡Hola {usuario}! 👋

Te comparto esta información importante:

🔗 [Tu info aquí]

¡Saludos! 🚀`,

  usuarios: ['usuario1', 'usuario2', 'usuario3'],
  delayMs: 8000, // Mayor delay para Selenium para imitar comportamiento humano
  batchSize: 0,
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
if (getArg('--message')) CONFIG.message = getArg('--message');

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

// ─── Utilidades ─────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toLocaleString('es-ES');

// ─── Lógica de Navegador (Selenium) ──────────────────────────

async function inicializarDriver() {
  const profileDir = resolve(__dirname, '.chrome_profile');
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

  // Limpiar y escribir el mensaje (usamos script inyectado para soportar Emojis / caracteres fuera del BMP)
  await textbox.click();
  await sleep(500);
  
  await driver.executeScript((el, text) => {
    el.focus();
    // Limpiar contenido existente por si acaso
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    // Escribir el nuevo texto (soporta emojis nativamente)
    document.execCommand('insertText', false, text);
  }, textbox, mensaje);
  
  await sleep(1500); // Esperar a que se renderice el texto y mención

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

  // Hacer clic en publicar
  await postBtn.click();
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

  let driver;
  try {
    driver = await inicializarDriver();
    await loginX(driver);

    let exitosos = 0;
    let fallidos = 0;

    for (let i = 0; i < usuarios.length; i++) {
      const usuario = usuarios[i];
      const mensaje = CONFIG.message.replace(/\{usuario\}/g, `@${usuario}`);

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
