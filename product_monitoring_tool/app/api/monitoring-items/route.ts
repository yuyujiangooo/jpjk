import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const page = parseInt(url.searchParams.get('page') || '1');
        const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
        const offset = (page - 1) * pageSize;

        // 获取总记录数
        const { count } = await supabase
            .from('monitoring_items')
            .select('*', { count: 'exact', head: true });

        // 获取分页数据
        const { data: items, error } = await supabase
            .from('monitoring_items')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + pageSize - 1);

        if (error) {
            throw error;
        }

        return NextResponse.json({
            items,
            pagination: {
                total: count,
                page,
                pageSize,
                totalPages: Math.ceil((count || 0) / pageSize)
            }
        });
    } catch (error) {
        console.error('Error fetching monitoring items:', error);
        return NextResponse.json(
            { error: 'Failed to fetch monitoring items' },
            { status: 500 }
        );
    }
} 