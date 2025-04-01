import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    // 确保params是一个Promise，需要await
    const resolvedParams = await params;
    
    if (!resolvedParams || !resolvedParams.id) {
      console.error("Missing params or id:", resolvedParams);
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request: missing id parameter",
        },
        { status: 400 },
      );
    }
    
    const id = resolvedParams.id;
    console.log(`处理停止监控请求，ID: ${id}`);
    
    const result = await db.stopMonitoring(id)

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: "Monitoring item not found",
        },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      item: result,
    })
  } catch (error) {
    console.error(`Error stopping monitoring:`, error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to stop monitoring",
      },
      { status: 500 },
    )
  }
}

