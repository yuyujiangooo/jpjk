"use client"

import type { MonitoringItem, MonitoringRecord, MonitoringDetail } from "@/lib/monitoring"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { getMonitoringRecordDetails } from "@/lib/actions"
import { monitoringScheduler } from "@/lib/monitoring/scheduler-service"
import { utils, writeFile } from 'xlsx'
import { marked } from 'marked'
import DiffMatchPatch from 'diff-match-patch'
import { createPortal } from "react-dom"

// 为window添加全局函数类型
declare global {
  interface Window {
    showDetailContent: (button: HTMLElement, detailId: string) => void;
  }
}

interface MonitoringResultsProps {
  selectedItem: MonitoringItem | null
  records: MonitoringRecord[]
  details: MonitoringDetail[]
  onStartMonitoring?: () => void
  onStopMonitoring?: () => void
  isLoadingRecords?: boolean
  onLoadMore?: () => void
  hasMoreRecords?: boolean
  executingItemIds: Set<string>  // 新增：执行中的监控项ID集合
}

export default function MonitoringResults({
  selectedItem,
  records,
  details,
  onStartMonitoring,
  onStopMonitoring,
  isLoadingRecords,
  onLoadMore,
  hasMoreRecords,
  executingItemIds,  // 新增：执行中的监控项ID集合
}: MonitoringResultsProps) {
  const [selectedRecord, setSelectedRecord] = useState<MonitoringRecord | null>(null)
  const [selectedRecordDetails, setSelectedRecordDetails] = useState<MonitoringDetail[]>([])
  const [isLoadingRecordDetails, setIsLoadingRecordDetails] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [detailsCache, setDetailsCache] = useState<Record<string, MonitoringDetail[]>>({})
  // Tooltip 状态
  const [tooltip, setTooltip] = useState<{visible: boolean, content: string, x: number, y: number}>(
    { visible: false, content: '', x: 0, y: 0 }
  );

  // 修改开始监控的处理函数
  const handleStartMonitoring = async () => {
    if (!selectedItem?.id) return;
    
    // 检查该监控项是否正在执行
    if (executingItemIds.has(selectedItem.id)) {
      console.log('该监控项正在执行中');
      return;
    }

    try {
      await onStartMonitoring?.();
    } catch (error) {
      console.error('监控执行失败:', error);
    }
  };

  // 修改停止监控的处理函数
  const handleStopMonitoring = async () => {
    if (!selectedItem?.id) return;
    
    try {
      await onStopMonitoring?.();
    } catch (error) {
      console.error('停止监控失败:', error);
    }
  };

  // 添加计算文本差异的函数
  const computeTextDiff = (oldText: string, newText: string) => {
    // 如果是首次监测，将旧内容视为空字符串
    if (oldText === "首次监测") {
      oldText = "";
    }
    
    const dmp = new DiffMatchPatch();
    const diffs = dmp.diff_main(oldText, newText);
    dmp.diff_cleanupSemantic(diffs);
    
    let markdownText = '';
    for (const [type, text] of diffs) {
      switch (type) {
        case -1: // 删除的文本
          markdownText += `<span class="bg-red-100 line-through">${text}</span>`;
          break;
        case 1: // 添加的文本
          markdownText += `<span class="bg-green-100">${text}</span>`;
          break;
        case 0: // 未变化的文本
          markdownText += text;
          break;
      }
    }
    
    // 使用 marked 渲染 markdown
    marked.setOptions({
      breaks: true,
      gfm: true,
      async: false // 确保使用同步版本
    });
    
    try {
      // 渲染 markdown
      const html = marked.parse(markdownText) as string;
      
      // 替换所有链接，添加 target="_blank"
      return html.replace(
        /<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/g, 
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline"$2>'
      );
    } catch (error) {
      console.error('Error parsing markdown:', error);
      return markdownText; // 如果解析失败，返回原始文本
    }
  };

  // 修改 showContentDialog 函数
  const showContentDialog = (detail: MonitoringDetail) => {
    const dialog = document.createElement('dialog')
    
    // 检测是否为移动设备
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    dialog.className = 'fixed inset-0 z-50 p-4 bg-white rounded-lg shadow-xl max-w-4xl mx-auto my-16'
    
    // 计算差异并渲染 markdown
    const diffHtml = detail.action === "内容变化" ? 
      computeTextDiff(detail.old_content, detail.new_content) : 
      marked.parse(detail.new_content);

    // 解析分析结果
    let analysisContent = '';
    if (detail.analysis_result) {
      const sections = detail.analysis_result
        .replace(/\*\*/g, '')
        .split('###')
        .filter(Boolean)
        .map(section => section.trim())
        .filter(section => !section.startsWith('竞品分析结果：'));
        
      analysisContent = sections.map(section => {
        const lines = section.trim().split('\n').filter(Boolean);
        const title = lines[0].trim();
        const content = lines.slice(1).map(line => {
          if (line.startsWith('- ')) {
            const parts = line.split('：');
            if (parts.length >= 2) {
              const label = parts[0].replace('- ', '').trim();
              const value = parts[1].trim();
              return `<div class="mb-2">
                <span class="font-medium text-gray-700">${label}：</span>
                <span class="text-gray-600">${value}</span>
              </div>`;
            }
          }
          return `<p class="mb-1 text-gray-600">${line}</p>`;
        }).join('');

        return `
          <div class="mb-6 last:mb-0">
            <h5 class="text-base font-medium text-gray-800 mb-3">${title}</h5>
            <div class="pl-4">${content}</div>
          </div>
        `;
      }).join('');
    }
    
    dialog.innerHTML = `
      <div class="h-full flex flex-col">
        <div class="flex justify-between items-center mb-3">
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-medium">内容详情</h3>
            ${detail.action === "内容变化" ? '<span class="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">内容变化</span>' : ''}
            ${detail.analysis_result && isImportantChange(detail) ? '<span class="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">重要变化</span>' : ''}
          </div>
          <button 
            class="text-gray-500 hover:text-gray-700 p-2" 
            onClick="this.closest('dialog').close()"
            title="关闭"
            aria-label="关闭对话框"
            style="touch-action: manipulation;"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="mb-3">
          <h4 class="font-medium mb-1">页面: ${detail.page}</h4>
          <a href="${detail.link}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline text-sm break-all">${detail.link}</a>
        </div>
        <div class="grid ${detail.analysis_result ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'} gap-4">
          <div class="bg-white border rounded-lg shadow-sm">
            <div class="border-b px-4 py-2.5 bg-gray-50">
              <h4 class="font-medium text-gray-700 text-base">${detail.action === "内容变化" ? '内容对比（红色表示删除，绿色表示新增）' : '内容'}</h4>
            </div>
            <div class="p-3 overflow-y-auto h-[300px] md:h-[400px] prose prose-sm max-w-none custom-scrollbar">
              <div class="min-w-full overflow-x-auto">
                ${diffHtml}
              </div>
            </div>
          </div>
          ${detail.analysis_result ? `
            <div class="bg-white border rounded-lg shadow-sm">
              <div class="border-b px-4 py-2.5 bg-gray-50">
                <h4 class="font-medium text-gray-700 text-base">竞品分析</h4>
              </div>
              <div class="p-3 overflow-y-auto h-[300px] md:h-[400px] prose prose-sm max-w-none custom-scrollbar">
                <div class="min-w-full overflow-x-auto">
                  ${analysisContent}
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `
    
    // 设置弹窗的样式
    if (isMobile) {
      // 移动端样式
      dialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        margin: 0;
        padding: 16px;
        overflow: auto;
        -webkit-overflow-scrolling: touch;
      `
    } else {
      // PC端样式保持不变
      dialog.style.cssText = `
        max-width: ${detail.analysis_result ? '1000px' : '600px'};
        width: 100%;
        margin: 40px auto;
        padding: 20px;
        overflow: hidden;
      `
    }
    
    document.body.appendChild(dialog)
    
    // 确保在移动端也能正常显示
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
    } else {
      // 如果 showModal 不可用，使用备用方案
      dialog.setAttribute('open', '')
      dialog.style.display = 'block'
    }
    
    // 点击空白处关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        if (typeof dialog.close === 'function') {
          dialog.close()
        } else {
          // 如果 close 不可用，手动移除
          dialog.remove()
        }
      }
    })
    
    // 添加触摸滚动支持
    dialog.addEventListener('touchmove', (e) => {
      e.stopPropagation()
    }, { passive: true })
  }

  // 添加判断是否为重要信息的函数
  const isImportantChange = (detail: MonitoringDetail) => {
    if (!detail.analysis_result) return false;
    // 检查分析结果中是否包含表示重要性的关键词
    return detail.analysis_result.includes('重要变化') || 
           detail.analysis_result.includes('注意') ||
           detail.analysis_result.includes('⚠️') ||
           detail.analysis_result.includes('❗');
  };

  // 在组件挂载时启动调度器
  useEffect(() => {
    // 已禁用自动执行功能
    return () => {
      // 清理工作...
    }
  }, [])

  // 监听selectedItem变化，更新调度器中的监控项
  useEffect(() => {
    if (selectedItem) {
      // 已禁用自动执行功能
    }
  }, [selectedItem?.id, selectedItem?.is_monitoring])

  // 在组件卸载时清理对话框
  useEffect(() => {
    return () => {
      // 移除所有打开的对话框
      document.querySelectorAll('dialog').forEach(dialog => {
        if (dialog.open) dialog.close()
        dialog.remove()
      })
    }
  }, [])

  // 监听selectedItem变化，重置相关状态
  useEffect(() => {
    setSelectedRecord(null)
    setSelectedRecordDetails([])
    setIsLoadingRecordDetails(false)
    setLoadError(null)
  }, [selectedItem?.id])

  useEffect(() => {
    if (selectedItem) {
      // 假设有一个函数 fetchMonitoringRecords 用于获取监控记录
      fetchMonitoringRecords(selectedItem.id);
    }
  }, [selectedItem]);

  // 假设 fetchMonitoringRecords 是一个获取监控记录的函数
  const fetchMonitoringRecords = async (itemId: string) => {
    // 在这里实现获取监控记录的逻辑
    // 例如，通过 API 调用获取数据并更新状态
  };

  // 添加导出函数
  const exportMonitoringResults = async (selectedItem: MonitoringItem, selectedRecord: MonitoringRecord | null, selectedRecordDetails: MonitoringDetail[]) => {
    if (!selectedItem || !selectedRecord || selectedRecordDetails.length === 0) {
      return;
    }

    // 添加内容截断函数
    const truncateContent = (content: string, maxLength: number = 32000) => {
      if (!content) return '';
      if (content.length <= maxLength) return content;
      return content.substring(0, maxLength) + '...(内容已截断)';
    };

    // 创建工作簿
    const wb = utils.book_new();

    // 创建监控记录工作表
    const recordData = [
      ['监控项目', '监控时间', '状态', '摘要'],
      [
        selectedItem.name,
        new Date(selectedRecord.date).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
        selectedRecord.status,
        truncateContent(selectedRecord.summary, 32000)
      ]
    ];
    const recordWs = utils.aoa_to_sheet(recordData);
    utils.book_append_sheet(wb, recordWs, '监控记录');

    // 创建监控详情工作表，只包含变化内容
    const detailsData = [
      ['序号', '页面', '链接', '变化状态', '内容变化', '竞品分析']
    ];

    selectedRecordDetails.forEach((detail, index) => {
      // 计算内容差异
      let diffContent = '';
      if (detail.action === "内容变化") {
        const dmp = new DiffMatchPatch();
        const oldText = detail.old_content === "首次监测" ? "" : detail.old_content;
        const diffs = dmp.diff_main(oldText, detail.new_content);
        dmp.diff_cleanupSemantic(diffs);
        
        // 将差异转换为可读的文本格式
        diffContent = diffs.map(([type, text]) => {
          switch (type) {
            case -1: // 删除的文本
              return `【删除】${text}`;
            case 1: // 添加的文本
              return `【新增】${text}`;
            default: // 未变化的文本
              return text;
          }
        }).join('');
      }

      detailsData.push([
        (index + 1).toString(),
        truncateContent(detail.page, 32000),
        truncateContent(detail.link, 32000),
        detail.action,
        detail.action === "内容变化" ? truncateContent(diffContent, 32000) : "无变化",
        truncateContent(detail.analysis_result || '-', 32000)
      ]);
    });

    const detailsWs = utils.aoa_to_sheet(detailsData);
    utils.book_append_sheet(wb, detailsWs, '监控详情');

    // 设置列宽
    const wscols = [
      { wch: 8 },    // 序号
      { wch: 30 },   // 页面
      { wch: 50 },   // 链接
      { wch: 15 },   // 变化状态
      { wch: 80 },   // 内容变化
      { wch: 50 }    // 竞品分析
    ];
    detailsWs['!cols'] = wscols;

    try {
      // 生成文件名
      const fileName = `${selectedItem.name}_监控结果_${new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(/[/:]/g, '')}.xlsx`;

      // 导出文件
      writeFile(wb, fileName);
    } catch (error) {
      console.error('导出文件失败:', error);
      alert('导出文件失败，可能是因为内容过长，请尝试减少导出内容或分批导出。');
    }
  };

  if (!selectedItem) {
    return (
      <div className="bg-[#F9FAFC] rounded-lg overflow-hidden shadow h-[calc(100vh-100px)]">
        <div className="bg-gradient-blue-light text-white p-4">
          <h2 className="text-lg font-medium">监测结果</h2>
        </div>
        <div className="p-12 text-center text-gray-500">请选择一个监控项目查看详细结果</div>
      </div>
    )
  }

  // 检查是否有监控记录和详情
  const hasRecords = records && records.length > 0;
  const hasDetails = details && details.length > 0;

  // 加载特定记录的详情，使用缓存
  const loadRecordDetails = async (recordId: string) => {
    if (!selectedItem) return
    
    // 检查缓存
    if (detailsCache[recordId]) {
      setSelectedRecordDetails(detailsCache[recordId])
      return
    }
    
    setIsLoadingRecordDetails(true)
    setLoadError(null)
    try {
      const result = await getMonitoringRecordDetails(recordId)
      if (result.success) {
        // 更新缓存
        setDetailsCache(prev => ({
          ...prev,
          [recordId]: result.details || []
        }))
        setSelectedRecordDetails(result.details || [])
      } else {
        console.error("获取记录详情失败:", result.error)
        setLoadError("获取记录详情失败，正在重试...")
        // 3秒后自动重试
        setTimeout(() => {
          loadRecordDetails(recordId)
        }, 3000)
      }
    } catch (error) {
      console.error("加载记录详情失败:", error)
      setLoadError("加载记录详情失败，请稍后重试")
    } finally {
      setIsLoadingRecordDetails(false)
    }
  }

  // Tooltip渲染
  const tooltipNode = tooltip.visible && typeof window !== 'undefined'
    ? createPortal(
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            zIndex: 9999,
            background: '#333',
            color: '#fff',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 14,
            maxWidth: 400,
            whiteSpace: 'pre-line',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
            transform: 'translate(-50%, -8px)'
          }}
        >
          {tooltip.content}
        </div>,
        document.body
      )
    : null;

  return (
    <div className="bg-[#F9FAFC] rounded-lg overflow-hidden shadow flex flex-col h-[calc(100vh-100px)]">
      <div className="bg-gradient-blue-light text-white p-4">
        <h2 className="text-lg font-medium">监测结果</h2>
      </div>

        <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-lg font-medium text-blue-dark">{selectedItem.name}</h3>
            <Button
              onClick={executingItemIds.has(selectedItem?.id || '') ? handleStopMonitoring : handleStartMonitoring}
              className={`flex items-center justify-center bg-[#ECEEFF] text-[#3A48FB] border border-[#3A48FB] rounded-lg px-4 py-2 hover:bg-[#3A48FB] hover:text-white transition-colors`}
            >
              <span className="mr-2">{executingItemIds.has(selectedItem?.id || '') ? '⏸' : '▶'}</span>
              {executingItemIds.has(selectedItem?.id || '') ? "停止监控" : "开始监控"}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-sm text-gray-500">监控模块：</div>
              <div className="flex flex-wrap gap-2 mt-1">
                {selectedItem.modules?.map((module, index) => (
                  <span key={index} className="bg-blue-50 text-blue-dark text-sm px-2 py-1 rounded">
                    {module}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-500">监控状态：</div>
              <div className="flex items-center mt-1">
              {executingItemIds.has(selectedItem?.id || '') ? (
                  <div className="flex items-center text-green-600">
                    <div className="w-2 h-2 bg-green-600 rounded-full mr-2 animate-pulse" />
                    <span>监控中</span>
                  </div>
                ) : (
                  <div className="flex items-center text-gray-500">
                    <div className="w-2 h-2 bg-gray-400 rounded-full mr-2" />
                    <span>未开始</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-500">监控频率：</div>
              <div className="mt-1">{selectedItem.frequency || "30天/次"}</div>
            </div>

            <div>
              <div className="text-sm text-gray-500">邮件提醒：</div>
              <div className="flex items-center mt-1">
              {selectedItem.email_notification ? (
                <div className="flex items-center text-green-600">
                  <div className="w-2 h-2 bg-green-600 rounded-full mr-2" />
                  <span>已开启</span>
                </div>
              ) : (
                <div className="flex items-center text-gray-500">
                  <div className="w-2 h-2 bg-gray-400 rounded-full mr-2" />
                  <span>未开启</span>
                </div>
              )}
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h4 className="font-medium mb-2">监控记录：</h4>
            <div className="bg-white rounded-lg shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 whitespace-nowrap">序号</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 whitespace-nowrap">日期</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 whitespace-nowrap">状态</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 whitespace-nowrap">摘要</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {isLoadingRecords && records.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-4 text-sm text-center text-gray-500">
                          <div className="flex justify-center items-center">
                            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                            加载中...
                          </div>
                        </td>
                      </tr>
                    ) : hasRecords ? (
                      <>
                        {records
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .slice(0, 5)  // 只显示前5条记录
                          .map((record, index) => (
                          <tr 
                            key={record.id} 
                            className={`hover:bg-gray-50 cursor-pointer ${selectedRecord?.id === record.id ? 'bg-blue-50' : ''}`}
                            onClick={async () => {
                              setSelectedRecord(record);
                              await loadRecordDetails(record.id);
                            }}
                          >
                              <td className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">{index + 1}</td>
                              <td className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">
                                {(() => {
                                  const date = new Date(record.date);
                                  return date.toLocaleString('zh-CN', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: false
                                  });
                                })()}
                              </td>
                          <td className="px-4 py-2 text-sm whitespace-nowrap">
                            {record.status === "监测成功" ? (
                              <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">成功</span>
                            ) : (
                              <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">失败</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900 max-w-[200px] truncate">
                            <div
                              className="truncate block w-full"
                              style={{ maxWidth: 180 }}
                              onMouseEnter={e => {
                                const rect = (e.target as HTMLElement).getBoundingClientRect();
                                setTooltip({
                                  visible: true,
                                  content: record.summary,
                                  x: rect.left + rect.width / 2,
                                  y: rect.top - 8 // 上方8px
                                });
                              }}
                              onMouseLeave={() => setTooltip({ ...tooltip, visible: false })}
                            >
                              {record.summary}
                            </div>
                          </td>
                            </tr>
                        ))}
                        {hasMoreRecords && (
                          <tr>
                            <td colSpan={4} className="px-4 py-4 text-center">
                            <button 
                                onClick={onLoadMore}
                                disabled={isLoadingRecords}
                                className="text-blue-600 hover:text-blue-800 text-sm"
                              >
                                {isLoadingRecords ? (
                                  <div className="flex items-center justify-center">
                                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                                    加载中...
                                  </div>
                                ) : (
                                  "加载更多"
                                )}
                            </button>
                          </td>
                        </tr>
                        )}
                      </>
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-4 text-sm text-center text-gray-500">
                          {executingItemIds.has(selectedItem?.id || '')
                            ? "监控已开始，首次监控记录将在监控完成后显示"
                            : '暂无监控记录，请点击"开始监控"按钮开始监控'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        <div>
            <h4 className="font-medium mb-2">监控详情：</h4>
          </div>

            <div className="bg-white rounded-lg shadow-sm">
              <div className="overflow-hidden">
                <div className="min-w-full align-middle">
                  <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                    <table className="w-full divide-y divide-gray-200 table-fixed">
                      <thead className="bg-gray-50">
                        <tr>
                      <th className="w-[60px] px-4 py-2 text-left text-sm font-medium text-gray-500 sticky top-0 bg-gray-50 z-10">序号</th>
                      <th className="w-[180px] px-4 py-2 text-left text-sm font-medium text-gray-500 sticky top-0 bg-gray-50 z-10">页面</th>
                      <th className="w-[180px] px-4 py-2 text-left text-sm font-medium text-gray-500 sticky top-0 bg-gray-50 z-10">链接</th>
                      <th className="w-[100px] px-4 py-2 text-left text-sm font-medium text-gray-500 sticky top-0 bg-gray-50 z-10">变化状态</th>
                      <th className="w-[100px] px-4 py-2 text-left text-sm font-medium text-gray-500 sticky top-0 bg-gray-50 z-10">内容分析</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                    {selectedRecord ? (
                      isLoadingRecordDetails ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-4 text-sm text-center text-gray-500">
                            <div className="flex justify-center items-center">
                              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                              加载中...
                            </div>
                          </td>
                        </tr>
                      ) : loadError ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-4 text-sm text-center text-red-500">
                            {loadError}
                          </td>
                        </tr>
                      ) : selectedRecordDetails.length > 0 ? (
                        selectedRecordDetails.map((detail) => (
                            <tr key={detail.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-900">{detail.rank}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              <div className="tooltip">
                                <div className="truncate">{detail.page}</div>
                                <div className="tooltiptext-top">{detail.page}</div>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-sm text-blue-600">
                              <div className="tooltip">
                                <a href={detail.link} target="_blank" rel="noopener noreferrer" className="hover:underline truncate block">
                                  {detail.link}
                                </a>
                                <div className="tooltiptext-top">{detail.link}</div>
                              </div>
                            </td>
                              <td className="px-4 py-2 text-sm whitespace-nowrap">
                                {detail.action === "内容变化" ? (
                                  <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">内容变化</span>
                                ) : (
                                  <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">无变化</span>
                                )}
                              </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              <div className="relative inline-block">
                                <button 
                                  className="text-blue-600 hover:text-blue-800 text-xs whitespace-nowrap"
                                  onClick={() => showContentDialog(detail)}
                                >
                                  查看内容
                                </button>
                                {detail.action === "内容变化" && detail.analysis_result && isImportantChange(detail) && (
                                  <div className="absolute -top-1 -right-2 w-2 h-2 bg-red-500 rounded-full"></div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-4 text-sm text-center text-gray-500">
                            暂无详情数据
                          </td>
                        </tr>
                      )
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-4 text-sm text-center text-gray-500">
                          请选择一条监控记录查看详情
                        </td>
                      </tr>
                    )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

          <div className="mt-6 flex justify-end">
            <button
              className="bg-[#ECEEFF] text-[#3A48FB] border border-[#3A48FB] hover:bg-[#3A48FB] hover:text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!selectedRecord || selectedRecordDetails.length === 0}
              onClick={() => {
                if (selectedItem && selectedRecord && selectedRecordDetails.length > 0) {
                  exportMonitoringResults(selectedItem, selectedRecord, selectedRecordDetails);
                }
              }}
            >
              导出监测结果
            </button>
          </div>
        </div>

      {tooltipNode}

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }
        
        /* 添加表格样式 */
        :global(.prose table) {
          width: 100%;
          table-layout: auto;
          border-collapse: collapse;
        }
        
        :global(.prose td),
        :global(.prose th) {
          min-width: 100px;
          padding: 8px;
          border: 1px solid #e5e7eb;
          white-space: normal;
          word-break: break-word;
          position: relative;
          overflow: visible;
          vertical-align: top;
        }

        :global(.prose td br) {
          display: block;
          content: '';
          margin: 4px 0;
        }
        
        :global(.prose thead th) {
          background-color: #f9fafb;
          font-weight: 500;
        }

        /* 添加链接样式 */
        :global(.prose a) {
          color: #2563eb;
          text-decoration: underline;
          word-break: break-all;
          position: relative;
          z-index: 1;
        }

        :global(.prose a:hover) {
          color: #1d4ed8;
        }

        :global(.prose td > a) {
          display: inline-block;
          max-width: 100%;
        }
        
        /* Tooltip 样式 */
        .tooltip {
          position: relative;
          display: inline-block;
          width: 100%;
          cursor: pointer;
        }
        
        .tooltip .tooltiptext-top {
          visibility: hidden;
          width: auto;
          min-width: 200px;
          max-width: 400px;
          background-color: #333;
          color: #fff;
          text-align: left;
          border-radius: 6px;
          padding: 8px 12px;
          position: absolute;
          z-index: 20;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%) translateY(-8px);
          opacity: 0;
          transition: opacity 0.3s;
          font-size: 12px;
          line-height: 1.4;
          white-space: normal;
          word-break: break-all;
          pointer-events: none;
        }
        
        .tooltip:hover .tooltiptext-top {
          visibility: visible;
          opacity: 1;
        }

        .tooltip .tooltiptext-top::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          margin-left: -5px;
          border-width: 5px;
          border-style: solid;
          border-color: #333 transparent transparent transparent;
        }
      `}</style>
    </div>
  )
}

