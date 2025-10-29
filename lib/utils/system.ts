/**
 * Utilitários para operações de sistema
 */

import { exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Verifica se um comando existe no sistema
 */
export async function commandExists(command: string): Promise<boolean> {
  try {
    const isWindows = process.platform === "win32";
    const checkCommand = isWindows ? "where" : "which";

    await execAsync(`${checkCommand} ${command}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Executa um comando e retorna stdout/stderr
 */
export async function execCommand(
  cmd: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const fullCommand = `${cmd} ${args.join(" ")}`;
    const { stdout, stderr } = await execAsync(fullCommand, {
      cwd: options?.cwd,
      env: options?.env ? { ...process.env, ...options.env } : process.env,
      timeout: options?.timeout || 300000, // 5 minutos default
    });

    return { stdout, stderr, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || error.message,
      exitCode: error.code || 1,
    };
  }
}

/**
 * Spawna um processo e captura output com progresso
 */
export async function spawnWithProgress(
  cmd: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    onOutput?: (data: string, isError: boolean) => void;
    timeout?: number;
  }
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let hasTimedOut = false;

    const childProcess = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Timeout handler
    const timeout = options.timeout || 300000; // 5 minutos default
    const timeoutId = setTimeout(() => {
      hasTimedOut = true;
      childProcess.kill("SIGTERM");

      // Force kill após 5 segundos
      setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill("SIGKILL");
        }
      }, 5000);
    }, timeout);

    // Capturar stdout
    childProcess.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      if (options.onOutput) {
        options.onOutput(text, false);
      }
    });

    // Capturar stderr
    childProcess.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (options.onOutput) {
        options.onOutput(text, true);
      }
    });

    // Error handler
    childProcess.on("error", (error) => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to spawn process: ${error.message}`));
    });

    // Exit handler
    childProcess.on("close", (code) => {
      clearTimeout(timeoutId);

      if (hasTimedOut) {
        reject(
          new Error(
            `Process timed out after ${timeout}ms. stdout: ${stdout}, stderr: ${stderr}`
          )
        );
      } else {
        resolve({
          exitCode: code || 0,
          stdout,
          stderr,
        });
      }
    });
  });
}

/**
 * Sanitiza nome de pacote para evitar command injection
 */
export function sanitizePackageName(packageName: string): string {
  // Remove caracteres perigosos, mantém apenas alphanumeric, @, /, -, _
  return packageName.replace(/[^a-zA-Z0-9@/\-_.]/g, "");
}

/**
 * Valida se um caminho está dentro de um diretório base (previne path traversal)
 */
export function isPathSafe(basePath: string, targetPath: string): boolean {
  const path = require("path");
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);

  return resolvedTarget.startsWith(resolvedBase);
}
