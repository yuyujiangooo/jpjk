import { NextResponse } from "next/server"
import { testQianwenConnection } from "@/lib/monitoring/qianwen"

export async function GET() {
  try {
    console.log("测试通义千问API连接...")
    const result = await testQianwenConnection()
    
    if (result.success) {
      console.log("测试成功:", result.message)
      return NextResponse.json({ 
        success: true, 
        message: result.message,
        model: result.model
      })
    } else {
      console.error("测试失败:", result.message)
      return NextResponse.json({ 
        success: false, 
        message: result.message 
      }, { status: 500 })
    }
  } catch (error) {
    console.error("测试过程中出错:", error)
    return NextResponse.json({ 
      success: false, 
      message: `测试过程中出错: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 })
  }
} 