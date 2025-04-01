import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { MonitoringItem } from '@/lib/monitoring';

export async function POST(request: Request) {
  try {
    const item: MonitoringItem = await request.json();
    
    if (!item || !item.id) {
      return NextResponse.json(
        { error: '无效的监控项数据' },
        { status: 400 }
      );
    }

    const result = await db.runMonitoring(item.id);
    
    if (!result) {
      return NextResponse.json(
        { error: '监控执行失败' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('监控执行出错:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
} 