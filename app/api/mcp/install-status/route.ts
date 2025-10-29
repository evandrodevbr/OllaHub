import { NextResponse } from "next/server";
import { MCPRepository } from "@/database/repositories/mcp";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mcpId = searchParams.get("mcpId");

    if (!mcpId) {
      return NextResponse.json(
        { success: false, error: "MCP ID is required" },
        { status: 400 }
      );
    }

    const installation = MCPRepository.getInstalledMCP(mcpId);

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "MCP not found" },
        { status: 404 }
      );
    }

    // Parsear logs se existirem
    let logs: string[] = [];
    if (installation.install_logs) {
      try {
        logs = JSON.parse(installation.install_logs);
      } catch {
        logs = [installation.install_logs];
      }
    }

    return NextResponse.json({
      success: true,
      mcpId: installation.id,
      status: installation.status || "unknown",
      message: installation.status_message || "",
      logs,
      environment: installation.environment_path,
      executableCommand: installation.executable_command,
      installedAt: installation.installed_at,
      updatedAt: installation.updated_at,
    });
  } catch (error: any) {
    console.error("Error getting installation status:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to get installation status",
      },
      { status: 500 }
    );
  }
}
