export interface MonitoringItem {
  id: string
  name: string
  url: string
  vendor?: string
  modules?: string[]
  frequency: string  // 默认值: "30 天/次"
  status?: string
  last_monitor_time?: string
  next_monitor_time?: string
  email_notification?: boolean
  email_recipients?: string[]
  is_monitoring?: boolean
  created_at?: string
  updated_at?: string
}

export interface MonitoringRecord {
  id: string
  item_id: string
  rank: number
  date: string
  status: string
  summary: string
  created_at?: string
  updated_at?: string
}

export interface MonitoringDetail {
  id?: string
  item_id: string
  record_id?: string
  rank: number
  page: string
  link: string
  old_content: string
  new_content: string
  action: string
  analysis_result?: string
  created_at?: string
  updated_at?: string
}

export interface Module {
  id: string
  name: string
  selected: boolean
}

// Supabase 数据库表名
export const TABLES = {
  MONITORING_ITEMS: 'monitoring_items',
  MONITORING_RECORDS: 'monitoring_records',
  MONITORING_DETAILS: 'monitoring_details',
}

