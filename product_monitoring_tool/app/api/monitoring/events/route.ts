import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

// 存储所有活动的 SSE 连接
const clients = new Set<{
  id: string
  send: (data: string) => void
}>()

// 广播消息给所有连接的客户端
export function broadcast(data: any) {
  const message = `data: ${JSON.stringify(data)}\n\n`
  clients.forEach(client => {
    try {
      client.send(message)
    } catch (e) {
      console.error(`发送消息到客户端 ${client.id} 失败:`, e)
    }
  })
}

export async function GET(req: NextRequest) {
  const responseStream = new TransformStream()
  const writer = responseStream.writable.getWriter()
  const encoder = new TextEncoder()

  // 生成唯一的客户端 ID
  const clientId = Math.random().toString(36).slice(2)

  // 将新客户端添加到集合中
  const client = {
    id: clientId,
    send: (data: string) => {
      writer.write(encoder.encode(data)).catch(console.error)
    }
  }
  clients.add(client)

  // 发送初始连接成功消息
  client.send(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`)

  // 当连接关闭时清理
  req.signal.addEventListener('abort', () => {
    clients.delete(client)
    writer.close().catch(console.error)
  })

  return new Response(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
} 