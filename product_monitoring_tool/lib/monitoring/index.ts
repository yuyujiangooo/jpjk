export interface MonitoringItem {
  id: string;
  name: string;
  url: string;
  vendor: string;
  modules: string[];
  frequency: string;
  is_monitoring: boolean;
  is_executing: boolean;
  status?: string;
  last_monitor_time?: string;
  next_monitor_time?: string;
  email_notification?: boolean;
  email_recipients?: string;
  last_execution_result?: any;  // 存储最后一次执行的结果
} 