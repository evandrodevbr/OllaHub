import { NextRequest, NextResponse } from "next/server";
import { deleteModel } from "@/lib/ollama";

export async function DELETE(request: NextRequest) {
  try {
    const { modelName } = await request.json();

    if (!modelName) {
      return NextResponse.json(
        { error: "Model name is required" },
        { status: 400 }
      );
    }

    await deleteModel(modelName);

    return NextResponse.json({
      success: true,
      message: `Model ${modelName} deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting model:", error);
    return NextResponse.json(
      { error: "Failed to delete model" },
      { status: 500 }
    );
  }
}
