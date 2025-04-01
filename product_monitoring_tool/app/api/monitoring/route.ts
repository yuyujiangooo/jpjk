import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET() {
  try {
    const items = await db.getMonitoringItems()
    return NextResponse.json({ items })
  } catch (error) {
    console.error("Error fetching monitoring items:", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { 
        error: "Failed to fetch monitoring items", 
        details: message,
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    // Validate required fields
    const requiredFields = ['name', 'url', 'vendor', 'modules', 'frequency']
    const missingFields = requiredFields.filter(field => !data[field])
    
    if (missingFields.length > 0) {
      return NextResponse.json({ 
        error: "Missing required fields",
        details: `Missing fields: ${missingFields.join(', ')}` 
      }, { status: 400 })
    }

    // Check if name already exists
    const nameExists = await db.isMonitoringItemNameExists(data.name)
    if (nameExists) {
      return NextResponse.json({ 
        error: "Monitoring item name already exists",
        details: `Name '${data.name}' is already in use`
      }, { status: 400 })
    }

    const newItem = await db.createMonitoringItem({
      name: data.name,
      url: data.url,
      vendor: data.vendor,
      modules: data.modules,
      frequency: data.frequency,
    })

    if (!newItem) {
      throw new Error("Failed to create monitoring item")
    }

    return NextResponse.json({ item: newItem }, { status: 201 })
  } catch (error) {
    console.error("Error creating monitoring item:", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { 
        error: "Failed to create monitoring item",
        details: message,
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    )
  }
}

