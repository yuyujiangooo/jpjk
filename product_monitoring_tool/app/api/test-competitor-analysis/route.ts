import { NextResponse } from "next/server"
import { analyzeContentChanges } from "@/lib/monitoring/qianwen"

export async function POST(request: Request) {
  try {
    const { old_content, new_content } = await request.json()
    
    if (!old_content || !new_content) {
      return NextResponse.json({ 
        success: false, 
        message: "请提供旧内容和新内容" 
      }, { status: 400 })
    }
    
    console.log("测试竞品分析功能...")
    const result = await analyzeContentChanges(old_content, new_content)
    
    return NextResponse.json({ 
      success: true, 
      result
    })
  } catch (error) {
    console.error("竞品分析过程中出错:", error)
    return NextResponse.json({ 
      success: false, 
      message: `竞品分析过程中出错: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 })
  }
} 