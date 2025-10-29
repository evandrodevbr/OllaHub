#!/usr/bin/env tsx
/**
 * Script para testar instalação completa de servidores MCP
 *
 * Uso: tsx scripts/test-mcp-installation.ts [npm|python|rust]
 */

import { MCPInstallerService } from "../lib/services/mcp-installer";
import { MCPValidatorService } from "../lib/services/mcp-validator";
import { MCPEnvironmentService } from "../lib/services/mcp-environment";
import type {
  InstallationConfig,
  InstallationProgress,
} from "../lib/types/mcp-installer";

// Configurações de teste por tipo
const TEST_CONFIGS = {
  npm: {
    mcpId: "test-npm-filesystem",
    packageName: "@modelcontextprotocol/server-filesystem",
    packageRegistry: "npm" as const,
    config: {
      name: "filesystem",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    },
    enableLogs: true,
  },
  python: {
    mcpId: "test-python-git",
    packageName: "mcp-server-git",
    packageRegistry: "pypi" as const,
    config: {
      name: "git",
      command: "python",
      args: ["-m", "mcp_server_git"],
    },
    enableLogs: true,
  },
  rust: {
    mcpId: "test-rust-example",
    packageName: "example-mcp-server",
    packageRegistry: "cargo" as const,
    repositoryUrl: "https://github.com/example/mcp-server-rust", // Exemplo - ajustar para repo real
    config: {
      name: "example",
      command: "./target/release/example-mcp-server",
      args: [],
    },
    enableLogs: true,
  },
};

async function testInstallation(type: keyof typeof TEST_CONFIGS) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🧪 Testing ${type.toUpperCase()} installation`);
  console.log(`${"=".repeat(60)}\n`);

  const config = TEST_CONFIGS[type];

  try {
    // 1. Verificar dependências do sistema
    console.log("1️⃣ Checking system dependencies...");
    const deps = await MCPEnvironmentService.checkSystemDependencies();
    console.log("   Dependencies:", deps);

    const requiredDep =
      type === "npm" ? "npm" : type === "python" ? "python" : "cargo";

    if (!deps[requiredDep as keyof typeof deps]) {
      console.error(`   ❌ ${requiredDep} not found on system`);
      return false;
    }

    console.log(`   ✓ ${requiredDep} is available\n`);

    // 2. Testar instalação
    console.log("2️⃣ Installing MCP server...");

    const installConfig: InstallationConfig = {
      ...config,
    };

    const onProgress = (progress: InstallationProgress) => {
      console.log(
        `   [${progress.percentage}%] ${progress.status}: ${progress.message}`
      );

      if (progress.logs && progress.logs.length > 0) {
        progress.logs.forEach((log) => {
          if (log.trim()) {
            console.log(`      ${log.trim().substring(0, 100)}`);
          }
        });
      }
    };

    const environment = await MCPInstallerService.install(
      installConfig,
      onProgress
    );

    console.log("\n   ✓ Installation completed");
    console.log(`   Environment: ${environment.path}`);
    console.log(
      `   Executable: ${environment.executable} ${environment.args?.join(
        " "
      )}\n`
    );

    // 3. Validar servidor MCP
    console.log("3️⃣ Validating MCP server (JSON-RPC protocol)...");

    const validation = await MCPValidatorService.validateMCPServer(
      environment,
      config.config,
      15000 // 15 segundos timeout para teste
    );

    if (validation.success) {
      console.log(`   ✓ Validation successful`);
      console.log(`   Protocol: ${validation.protocol}`);
      console.log(`   Tools found: ${validation.tools.length}`);

      if (validation.tools.length > 0) {
        console.log("\n   Available tools:");
        validation.tools.forEach((tool) => {
          console.log(
            `      - ${tool.name}: ${tool.description || "No description"}`
          );
        });
      }

      if (validation.capabilities) {
        console.log(
          "\n   Capabilities:",
          JSON.stringify(validation.capabilities, null, 2)
        );
      }
    } else {
      console.warn(`   ⚠️ JSON-RPC validation failed: ${validation.error}`);
      console.log("\n   Trying simple validation...");

      const simpleResult = await MCPValidatorService.simpleValidation(
        environment,
        config.config
      );

      if (simpleResult.success) {
        console.log("   ✓ Simple validation passed (server starts)");
      } else {
        console.error(`   ❌ Simple validation failed: ${simpleResult.error}`);
        return false;
      }
    }

    // 4. Cleanup (opcional)
    console.log("\n4️⃣ Cleaning up test installation...");
    await MCPEnvironmentService.cleanupEnvironment(environment);
    console.log("   ✓ Cleanup completed\n");

    console.log(`${"=".repeat(60)}`);
    console.log(`✅ ${type.toUpperCase()} test PASSED`);
    console.log(`${"=".repeat(60)}\n`);

    return true;
  } catch (error: any) {
    console.error(`\n❌ ${type.toUpperCase()} test FAILED`);
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(`Stack: ${error.stack}`);
    }

    console.log(`${"=".repeat(60)}\n`);

    return false;
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const type = args[0] as keyof typeof TEST_CONFIGS;

  if (!type) {
    console.log(
      "Usage: tsx scripts/test-mcp-installation.ts [npm|python|rust|all]"
    );
    console.log("\nExamples:");
    console.log("  tsx scripts/test-mcp-installation.ts npm");
    console.log("  tsx scripts/test-mcp-installation.ts python");
    console.log("  tsx scripts/test-mcp-installation.ts rust");
    console.log("  tsx scripts/test-mcp-installation.ts all");
    process.exit(1);
  }

  if (type === "all") {
    console.log("🧪 Running ALL installation tests\n");

    const results = {
      npm: await testInstallation("npm"),
      python: await testInstallation("python"),
      rust: await testInstallation("rust"),
    };

    console.log("\n" + "=".repeat(60));
    console.log("📊 Test Summary");
    console.log("=".repeat(60));
    console.log(`NPM:    ${results.npm ? "✅ PASSED" : "❌ FAILED"}`);
    console.log(`Python: ${results.python ? "✅ PASSED" : "❌ FAILED"}`);
    console.log(`Rust:   ${results.rust ? "✅ PASSED" : "❌ FAILED"}`);
    console.log("=".repeat(60) + "\n");

    const allPassed = Object.values(results).every((r) => r);
    process.exit(allPassed ? 0 : 1);
  }

  if (!TEST_CONFIGS[type]) {
    console.error(`❌ Unknown type: ${type}`);
    console.error("Valid types: npm, python, rust, all");
    process.exit(1);
  }

  const success = await testInstallation(type);
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
