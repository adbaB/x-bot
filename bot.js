// ============================================================
//  OAuth 1.0a — Sin browser — Serverless ready
// ============================================================
//  Uso:
//    node bot.js                        → Envía los posts
//    node bot.js --dry-run              → Muestra qué se enviaría
//    node bot.js --delay 5000           → Espera 5s entre cada post
//    node bot.js --batch 500            → Envía solo 500 posts
//    node bot.js --message "Texto"      → Mensaje personalizado
// ============================================================

import "dotenv/config";
import chalk from "chalk";
import { crearCliente } from "./x-client.js";
import { readFileSync, existsSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Configuración ──────────────────────────────────────────
const CONFIG = {
  // Variantes de mensajes. Si hay más de una, el bot elegirá una para cada post.
  messages: [
    `¡Hola {usuario}! 👋\n\nTe comparto esta información importante:\n\n🔗 [Tu info aquí]\n\n¡Saludos! 🚀`,
    `¿Qué tal {usuario}? 😊\n\nQuería mostrarte este enlace con info de interés:\n\n🔗 [Tu info aquí]\n\n¡Que tengas un buen día! ✨`,
    `¡Buenas {usuario}! ✌️\n\nTe recomiendo que le eches un vistazo a esto:\n\n🔗 [Tu info aquí]\n\n¡Nos vemos! 🙌`,
    `¡Hola {usuario}! 🚀\n\nAquí tienes la información que te comentaba:\n\n🔗 [Tu info aquí]\n\n¡Un saludo! 🎈`
  ],

  // Mensaje por defecto (usado si messages está vacío o se sobreescribe con --message)
  message: `¡Hola {usuario}! 👋

Te comparto esta información importante:

🔗 [Tu info aquí]

¡Saludos! 🚀`,

  // Modo de selección de variante: 'random' (aleatorio) o 'round-robin' (secuencial)
  variantMode: "random",

  // Lista default (se sobreescribe con usuarios.txt)
  usuarios: ["usuario1", "usuario2", "usuario3"],

  // Delay entre posts (ms)
  delayMs: 3000,

  // Batch size (0 = todos)
  batchSize: 0,

  // Tweets por cuenta antes de cambiar de cuenta
  tweetsPerAccount: 5,
};

// ─── Parsear argumentos CLI ─────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

if (getArg("--delay")) CONFIG.delayMs = parseInt(getArg("--delay"), 10);
if (getArg("--batch")) CONFIG.batchSize = parseInt(getArg("--batch"), 10);
if (getArg("--tweets-per-account")) CONFIG.tweetsPerAccount = parseInt(getArg("--tweets-per-account"), 10);
if (getArg("--message")) {
  CONFIG.message = getArg("--message");
  CONFIG.messages = []; // Limpiamos para usar el mensaje único
}

// ─── Cargar usuarios ────────────────────────────────────────
function cargarUsuarios() {
  const file = resolve(__dirname, "usuarios.txt");
  if (!existsSync(file)) return CONFIG.usuarios;

  const lista = readFileSync(file, "utf-8")
    .split("\n")
    .map((l) => l.trim().replace(/^@/, ""))
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lista.length > 0) {
    console.log(
      chalk.cyan(`📄 Cargados ${lista.length} usuarios desde usuarios.txt`),
    );
    return lista;
  }
  return CONFIG.usuarios;
}

// ─── Registro de procesados ─────────────────────────────────
function cargarProcesados() {
  const file = resolve(__dirname, "procesados.log");
  if (!existsSync(file)) return new Set();
  return new Set(
    readFileSync(file, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
}

function marcarProcesado(usuario) {
  appendFileSync(resolve(__dirname, "procesados.log"), usuario + "\n", "utf-8");
}

// ─── Cargar cuentas ──────────────────────────────────────────
function cargarCuentas() {
  const file = resolve(__dirname, "cuentas.json");
  if (!existsSync(file)) return [];
  try {
    const list = JSON.parse(readFileSync(file, "utf-8"));
    if (Array.isArray(list) && list.length > 0) {
      return list;
    }
  } catch (error) {
    console.error(chalk.red(`❌ Error al leer cuentas.json: ${error.message}`));
  }
  return [];
}

// ─── Utilidades ─────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toLocaleString("es-ES");

// ─── Validar credenciales ───────────────────────────────────
function validarCredenciales() {
  const keys = [
    "API_KEY",
    "API_KEY_SECRET",
    "ACCESS_TOKEN",
    "ACCESS_TOKEN_SECRET",
  ];
  const missing = keys.filter(
    (k) => !process.env[k] || process.env[k].length === 0,
  );

  if (missing.length > 0) {
    console.error(chalk.red("\n❌ Faltan credenciales en .env:\n"));
    missing.forEach((k) => console.error(chalk.yellow(`   → ${k}`)));
    console.error(chalk.gray("\n   Configúralas en: https://developer.x.com"));
    console.error(
      chalk.gray("   Proyecto → App → Keys and Tokens → Generate\n"),
    );
    process.exit(1);
  }
}

// ─── Función principal ──────────────────────────────────────
async function main() {
  console.log(chalk.bold.blue(`\n🤖 X Bot — ${ts()}\n`));
  console.log(chalk.gray("─".repeat(55)));

  const cuentas = cargarCuentas();
  if (cuentas.length > 0) {
    console.log(chalk.cyan(`👥 Cargadas ${cuentas.length} cuentas desde cuentas.json`));
  }

  if (dryRun) {
    console.log(chalk.yellow("⚠️  Modo DRY RUN — No se publicará nada\n"));
  } else {
    if (cuentas.length === 0) {
      validarCredenciales();
    } else {
      // Validar cada cuenta del archivo json
      for (let idx = 0; idx < cuentas.length; idx++) {
        const c = cuentas[idx];
        const missing = ["apiKey", "apiKeySecret", "accessToken", "accessTokenSecret"].filter(k => !c[k]);
        if (missing.length > 0) {
          console.error(chalk.red(`\n❌ Error: La cuenta #${idx + 1} (${c.username || "sin nombre"}) en cuentas.json no tiene:`));
          missing.forEach(k => console.error(chalk.yellow(`   → ${k}`)));
          process.exit(1);
        }
      }
    }
  }

  // Cargar y filtrar usuarios
  let usuarios = cargarUsuarios();
  const procesados = cargarProcesados();
  const antes = usuarios.length;
  usuarios = usuarios.filter((u) => !procesados.has(u));

  if (antes !== usuarios.length) {
    console.log(
      chalk.cyan(`🔄 Saltando ${antes - usuarios.length} ya procesados`),
    );
  }

  if (CONFIG.batchSize > 0 && usuarios.length > CONFIG.batchSize) {
    console.log(
      chalk.cyan(
        `📦 Batch: ${CONFIG.batchSize} de ${usuarios.length} pendientes`,
      ),
    );
    usuarios = usuarios.slice(0, CONFIG.batchSize);
  }

  if (usuarios.length === 0) {
    console.log(chalk.green("\n✅ No hay usuarios pendientes.\n"));
    return;
  }

  const costoEst = (usuarios.length * 0.015).toFixed(2);
  console.log(chalk.white(`📋 Usuarios:  ${chalk.bold(usuarios.length)}`));
  console.log(
    chalk.white(`⏱️  Delay:     ${chalk.bold(CONFIG.delayMs + "ms")}`),
  );
  console.log(
    chalk.white(`💰 Costo est: ${chalk.bold("~$" + costoEst + " USD")}`),
  );
  console.log(chalk.gray("─".repeat(55)));

  // Lógica de rotación de clientes
  let client = null;
  let currentAccountIndex = -1;

  // ── Enviar posts ──
  let exitosos = 0;
  let fallidos = 0;
  const errores = [];

  for (let i = 0; i < usuarios.length; i++) {
    const usuario = usuarios[i];
    
    // Rotar cuenta si hay múltiples cuentas configuradas
    const accountIndex = cuentas.length > 0 
      ? Math.floor(i / CONFIG.tweetsPerAccount) % cuentas.length 
      : -1;

    if (accountIndex !== currentAccountIndex) {
      currentAccountIndex = accountIndex;
      if (accountIndex !== -1) {
        const cuenta = cuentas[accountIndex];
        console.log(chalk.blue(`\n🔄 Cambiando a cuenta: @${cuenta.username || `cuenta_${accountIndex + 1}`} (Lote de ${CONFIG.tweetsPerAccount})`));
        if (!dryRun) {
          client = crearCliente({
            apiKey: cuenta.apiKey,
            apiKeySecret: cuenta.apiKeySecret,
            accessToken: cuenta.accessToken,
            accessTokenSecret: cuenta.accessTokenSecret,
          });
          try {
            const me = await client.getMe();
            console.log(chalk.green(`   ✅ Autenticado como: @${me.data.username}`));
          } catch (error) {
            console.log(chalk.yellow(`   ⚠️  Nota: No se pudo validar el nombre de la cuenta (${error.message}).`));
          }
        }
      } else {
        // Cuenta única legacy desde .env
        if (i === 0 && !dryRun && !client) {
          client = crearCliente({
            apiKey: process.env.API_KEY,
            apiKeySecret: process.env.API_KEY_SECRET,
            accessToken: process.env.ACCESS_TOKEN,
            accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
          });
          try {
            const me = await client.getMe();
            console.log(chalk.green(`\n✅ Autenticado: @${me.data.username}\n`));
          } catch (error) {
            console.log(chalk.yellow(`\n⚠️  Nota: No se pudo validar el nombre de usuario (${error.message}).`));
          }
        }
      }
    }

    // Seleccionar plantilla del mensaje (variante)
    let plantilla = CONFIG.message;
    if (CONFIG.messages && CONFIG.messages.length > 0) {
      if (CONFIG.variantMode === "round-robin") {
        plantilla = CONFIG.messages[i % CONFIG.messages.length];
      } else {
        // Por defecto 'random'
        const randomIndex = Math.floor(Math.random() * CONFIG.messages.length);
        plantilla = CONFIG.messages[randomIndex];
      }
    }
    
    const texto = plantilla.replace(/\{usuario\}/g, `@${usuario}`);

    console.log(chalk.white(`[${i + 1}/${usuarios.length}] → @${usuario}`));

    if (texto.length > 280) {
      console.log(chalk.red(`   ❌ Excede 280 chars (${texto.length})`));
      fallidos++;
      errores.push({ usuario, error: "Excede 280 chars" });
      continue;
    }

    if (dryRun) {
      console.log(chalk.gray(`   📝 "${texto.substring(0, 80)}..."`));
      console.log(chalk.green(`   ✅ (dry run)`));
      exitosos++;
    } else {
      try {
        const res = await client.createPost(texto);
        console.log(chalk.green(`   ✅ Post (ID: ${res.data.id})`));
        exitosos++;
        marcarProcesado(usuario);
      } catch (error) {
        const msg = error?.data?.detail || error.message;
        console.log(chalk.red(`   ❌ ${msg}`));
        fallidos++;
        errores.push({ usuario, error: msg });

        // Rate limit → esperar
        if (error.status === 429) {
          const reset = error.headers?.["x-rate-limit-reset"];
          let wait = 60000;
          if (reset)
            wait = Math.max(parseInt(reset) * 1000 - Date.now() + 1000, 10000);

          console.log(
            chalk.yellow(
              `   ⏳ Rate limit. Esperando ${Math.round(wait / 1000)}s...`,
            ),
          );
          await sleep(wait);

          // Reintento
          try {
            const retry = await client.createPost(texto);
            console.log(
              chalk.green(`   ✅ Reintento OK (ID: ${retry.data.id})`),
            );
            exitosos++;
            fallidos--;
            errores.pop();
            marcarProcesado(usuario);
          } catch (e) {
            console.log(chalk.red(`   ❌ Reintento fallido`));
          }
        }
      }
    }

    if (i < usuarios.length - 1) {
      await sleep(dryRun ? 50 : CONFIG.delayMs);
    }
  }

  // ── Resumen ──
  const costoReal = (exitosos * 0.015).toFixed(2);
  console.log(chalk.gray("\n" + "─".repeat(55)));
  console.log(chalk.bold.blue("📊 Resumen:"));
  console.log(chalk.green(`   ✅ Exitosos: ${exitosos}`));
  if (fallidos > 0) console.log(chalk.red(`   ❌ Fallidos: ${fallidos}`));
  console.log(chalk.white(`   📋 Total:    ${usuarios.length}`));
  console.log(chalk.white(`   💰 Costo:    ~$${costoReal} USD`));

  if (errores.length > 0) {
    console.log(chalk.yellow("\n⚠️  Errores:"));
    errores.forEach(({ usuario, error }) =>
      console.log(chalk.yellow(`   → @${usuario}: ${error}`)),
    );
  }

  console.log(chalk.gray("─".repeat(55) + "\n"));
}

// ─── Export para uso como módulo (serverless) ────────────────
export { main, CONFIG };

// ─── Ejecución directa ──────────────────────────────────────
main().catch((e) => {
  console.error(chalk.red("\n💥 Error fatal:"), e.message);
  process.exit(1);
});
