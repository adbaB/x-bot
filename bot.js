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
  // Mensaje. Usa {usuario} como placeholder para la mención.
  message: `¡Hola {usuario}! 👋

Te comparto esta información importante:

🔗 [Tu info aquí]

¡Saludos! 🚀`,

  // Lista default (se sobreescribe con usuarios.txt)
  usuarios: ["usuario1", "usuario2", "usuario3"],

  // Delay entre posts (ms)
  delayMs: 3000,

  // Batch size (0 = todos)
  batchSize: 0,
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
if (getArg("--message")) CONFIG.message = getArg("--message");

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

  if (dryRun) {
    console.log(chalk.yellow("⚠️  Modo DRY RUN — No se publicará nada\n"));
  } else {
    validarCredenciales();
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

  // Crear cliente OAuth 1.0a
  let client;
  if (!dryRun) {
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
      console.log(
        chalk.yellow(
          `\n⚠️  Nota: No se pudo validar el nombre de usuario (${error.message}).`,
        ),
      );
      console.log(
        chalk.yellow(
          '   Esto es común si usas el plan "Free" de X, que no permite leer perfiles.',
        ),
      );
      console.log(
        chalk.yellow(
          "   El bot continuará e intentará publicar de todos modos...\n",
        ),
      );
    }
  }

  // ── Enviar posts ──
  let exitosos = 0;
  let fallidos = 0;
  const errores = [];

  for (let i = 0; i < usuarios.length; i++) {
    const usuario = usuarios[i];
    const texto = CONFIG.message.replace(/\{usuario\}/g, `@${usuario}`);

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
