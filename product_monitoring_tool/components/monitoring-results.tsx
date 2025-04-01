"use client"

import type { MonitoringItem, MonitoringRecord, MonitoringDetail } from "@/lib/monitoring"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { getMonitoringRecordDetails } from "@/lib/actions"
import { monitoringScheduler } from "@/lib/monitoring/scheduler-service"

// 为window添加全局函数类型
declare global {
  interface Window {
    showDetailContent: (button: HTMLElement, detailId: string) => void;
  }
}

interface MonitoringResultsProps {
  selectedItem: MonitoringItem | null
  records: MonitoringRecord[]
  details: any[]
  onStartMonitoring?: () => void
  onStopMonitoring?: () => void
  isLoadingRecords?: boolean
  onLoadMore?: () => void
  hasMoreRecords?: boolean
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
}: MonitoringResultsProps) {
  const [selectedRecord, setSelectedRecord] = useState<MonitoringRecord | null>(null)
  const [selectedRecordDetails, setSelectedRecordDetails] = useState<MonitoringDetail[]>([])
  const [isLoadingRecordDetails, setIsLoadingRecordDetails] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [detailsCache, setDetailsCache] = useState<Record<string, MonitoringDetail[]>>({})

  // 添加内容查看对话框函数
  const showContentDialog = (detail: MonitoringDetail) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'fixed inset-0 z-50 p-4 bg-white rounded-lg shadow-xl max-w-4xl mx-auto my-16 overflow-auto'
    
    dialog.innerHTML = `
      <div class="p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-medium">内容详情</h3>
          <button 
            className="text-gray-500 hover:text-gray-700" 
            onClick="this.closest('dialog').close()"
            title="关闭"
            aria-label="关闭对话框"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="mb-6">
          <h4 class="font-medium mb-2">页面: ${detail.page}</h4>
          <a href="${detail.link}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">${detail.link}</a>
        </div>
        <div class="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h5 class="font-medium mb-2">旧内容:</h5>
            <div class="bg-gray-50 p-4 rounded max-h-60 overflow-auto text-sm">${detail.old_content.replace(/\n/g, '<br>')}</div>
          </div>
          <div>
            <h5 class="font-medium mb-2">新内容:</h5>
            <div class="bg-gray-50 p-4 rounded max-h-60 overflow-auto text-sm">${detail.new_content.replace(/\n/g, '<br>')}</div>
          </div>
        </div>
      </div>
    `
    
    document.body.appendChild(dialog)
    dialog.showModal()
    
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close()
    })
  }

  // 添加分析结果对话框函数
  const showAnalysisDialog = (detail: MonitoringDetail) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'fixed inset-0 z-50 p-4 bg-white rounded-lg shadow-xl max-w-4xl mx-auto my-16 overflow-auto'
    
    dialog.innerHTML = `
      <div class="p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-medium">竞品分析结果</h3>
          <button 
            className="text-gray-500 hover:text-gray-700" 
            onClick="this.closest('dialog').close()"
            title="关闭"
            aria-label="关闭对话框"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="mb-6">
          <h4 class="font-medium mb-2">页面: ${detail.page}</h4>
          <a href="${detail.link}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">${detail.link}</a>
        </div>
        <div class="prose max-w-none">
          ${detail.analysis_result ? detail.analysis_result.replace(/\n/g, '<br>') : '暂无分析结果'}
        </div>
      </div>
    `
    
    document.body.appendChild(dialog)
    dialog.showModal()
    
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close()
    })
  }

  // 在组件挂载时启动调度器
  useEffect(() => {
    monitoringScheduler.start()
    return () => {
      monitoringScheduler.stop()
    }
  }, [])

  // 监听selectedItem变化，更新调度器中的监控项
  useEffect(() => {
    if (selectedItem) {
      if (selectedItem.is_monitoring) {
        monitoringScheduler.addOrUpdateItem(selectedItem)
      } else {
        monitoringScheduler.removeItem(selectedItem.id)
      }
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

  return (
    <div className="bg-[#F9FAFC] rounded-lg overflow-hidden shadow flex flex-col h-[calc(100vh-100px)]">
      <div className="bg-gradient-blue-light text-white p-4">
        <h2 className="text-lg font-medium">监测结果</h2>
      </div>

        <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-lg font-medium text-blue-dark">{selectedItem.name}</h3>
            {selectedItem.is_monitoring ? (
              <button
                onClick={onStopMonitoring}
                className="flex items-center bg-[#3A48FB] hover:bg-[#2A38EB] text-white px-4 py-2 rounded-lg transition-colors text-sm"
              >
                <span className="mr-2">⏸</span>
                停止监控
              </button>
            ) : (
              <button
                onClick={onStartMonitoring}
                className="flex items-center bg-[#ECEEFF] text-[#3A48FB] border border-[#3A48FB] hover:bg-[#E0E2FF] px-4 py-2 rounded-lg transition-colors text-sm"
              >
                <span className="mr-2">▶</span>
                开始监控
              </button>
            )}
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
              {selectedItem.is_monitoring ? (
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
                        {records.map((record, index) => (
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
                            <div className="tooltip">
                              <span>{record.summary}</span>
                              {record.summary && record.summary.length > 30 && (
                                <span className="tooltiptext">{record.summary}</span>
                              )}
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
                          {selectedItem.is_monitoring
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
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full align-middle">
                  <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 sticky top-0 bg-gray-50 z-10 whitespace-nowrap">序号</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 sticky top-0 bg-gray-50 z-10 whitespace-nowrap">页面</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 sticky top-0 bg-gray-50 z-10 whitespace-nowrap">链接</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 sticky top-0 bg-gray-50 z-10 whitespace-nowrap">变化状态</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 sticky top-0 bg-gray-50 z-10 whitespace-nowrap">内容</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 sticky top-0 bg-gray-50 z-10 whitespace-nowrap">竞品分析</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                    {selectedRecord ? (
                      isLoadingRecordDetails ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-4 text-sm text-center text-gray-500">
                            <div className="flex justify-center items-center">
                              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                              加载中...
                            </div>
                          </td>
                        </tr>
                      ) : loadError ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-4 text-sm text-center text-red-500">
                            {loadError}
                          </td>
                        </tr>
                      ) : selectedRecordDetails.length > 0 ? (
                        selectedRecordDetails.map((detail) => (
                            <tr key={detail.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">{detail.rank}</td>
                            <td className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">{detail.page}</td>
                              <td className="px-4 py-2 text-sm text-blue-600 whitespace-nowrap">
                                <a href={detail.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                  {detail.link.length > 30 ? detail.link.substring(0, 30) + '...' : detail.link}
                                </a>
                              </td>
                              <td className="px-4 py-2 text-sm whitespace-nowrap">
                                {detail.action === "内容变化" ? (
                                  <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">内容变化</span>
                                ) : (
                                  <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">无变化</span>
                                )}
                              </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              <button 
                                className="text-blue-600 hover:text-blue-800 text-xs whitespace-nowrap"
                                onClick={() => showContentDialog(detail)}
                              >
                                查看内容
                              </button>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {detail.action === "内容变化" && detail.analysis_result ? (
                                <button 
                                  className="text-blue-600 hover:text-blue-800 text-xs whitespace-nowrap"
                                  onClick={() => showAnalysisDialog(detail)}
                                >
                                  查看结果
                                </button>
                              ) : (
                                <span className="text-gray-400 text-xs">-</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-4 text-sm text-center text-gray-500">
                            暂无详情数据
                                </td>
                              </tr>
                            )
                        ) : (
                          <tr>
                            <td colSpan={6} className="px-4 py-4 text-sm text-center text-gray-500">
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
              className="bg-[#ECEEFF] text-[#3A48FB] border border-[#3A48FB] hover:bg-[#3A48FB] hover:text-white px-4 py-2 rounded-lg transition-colors"
              disabled={!selectedItem.last_monitor_time || !hasRecords}
            >
              导出监测结果
            </button>
          </div>
        </div>

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
        
        /* Tooltip 样式 */
        .tooltip {
          position: relative;
          display: inline-block;
          cursor: pointer;
        }
        
        .tooltip .tooltiptext {
          visibility: hidden;
          width: 300px;
          background-color: #333;
          color: #fff;
          text-align: left;
          border-radius: 6px;
          padding: 10px;
          position: absolute;
          z-index: 1;
          bottom: 125%;
          left: 50%;
          transform: translateX(-50%);
          opacity: 0;
          transition: opacity 0.3s;
          font-size: 12px;
          line-height: 1.4;
          max-height: 200px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
        }
        
        .tooltip:hover .tooltiptext {
          visibility: visible;
          opacity: 1;
        }
      `}</style>
    </div>
  )
}

