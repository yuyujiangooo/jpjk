import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // 确保params是一个Promise，需要await
    const resolvedParams = await params;
    
    if (!resolvedParams || !resolvedParams.id) {
      console.error("Missing params or id:", resolvedParams);
      return NextResponse.json({ 
        success: false,
        error: "Invalid request: missing id parameter" 
      }, { status: 400 });
    }
    
    const id = resolvedParams.id;
    console.log(`处理监控运行请求，ID: ${id}`);
    
    // 获取监控项
    const item = await db.getMonitoringItemById(id)
    
    if (!item) {
      return NextResponse.json({ error: "Monitoring item not found" }, { status: 404 })
    }
    
    // 检查监控项是否处于监控状态
    if (!item.isMonitoring) {
      return NextResponse.json({ error: "Monitoring is not active for this item" }, { status: 400 })
    }
    
    console.log(`开始运行监控: ${item.name} (ID: ${id})`)
    
    // 运行监控
    const result = await db.runMonitoring(id)

    if (!result) {
      return NextResponse.json({ error: "Failed to run monitoring" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      result
    })
  } catch (error) {
    console.error(`Error running monitoring:`, error)
    return NextResponse.json({ 
      success: false,
      error: "Failed to run monitoring",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

