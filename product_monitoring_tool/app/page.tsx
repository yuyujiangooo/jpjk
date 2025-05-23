"use client"

import Image from "next/image"
import { useState, useEffect } from "react"
import MonitoringList from "@/components/monitoring-list"
import MonitoringResults from "@/components/monitoring-results"
import AddMonitoringModal from "@/components/add-monitoring-modal"
import SelectModuleModal from "@/components/select-module-modal"
import SelectFrequencyModal from "@/components/select-frequency-modal"
import AuthModal from "@/components/auth-modal"
import type { MonitoringItem, MonitoringRecord, Module } from "@/lib/monitoring"
import { addMonitoringItem, deleteMonitoringItem, runMonitoring, exportMonitoringResults } from "@/lib/actions"
import { monitoringScheduler } from "@/lib/monitoring/scheduler-service"
import { UserCog } from "lucide-react"
import { message } from 'antd'

// Define vendor-specific modules
const vendorModules = {
  华为云: [
    { id: "1", name: "最新动态", selected: true },
    { id: "2", name: "功能总览", selected: true },
    { id: "3", name: "产品介绍", selected: true },
    { id: "4", name: "计费说明", selected: true },
    { id: "5", name: "快速入门", selected: true },
    { id: "6", name: "用户指南", selected: true },
    { id: "7", name: "最佳实践", selected: true },
    { id: "8", name: "API参考", selected: true },
    { id: "9", name: "SDK参考", selected: true },
    { id: "10", name: "场景代码示例", selected: true },
    { id: "11", name: "常见问题", selected: true },
    { id: "12", name: "视频帮助", selected: true },
    { id: "13", name: "文档下载", selected: true },
  ],
  阿里云: [
    { id: "1", name: "产品概述", selected: true },
    { id: "2", name: "快速入门", selected: true },
    { id: "3", name: "操作指南", selected: true },
    { id: "4", name: "实践教程", selected: true },
    { id: "5", name: "安全合规", selected: true },
    { id: "6", name: "开发参考", selected: true },
    { id: "7", name: "服务支持", selected: true },
  ],
  腾讯云: [
    { id: "1", name: "动态与公告", selected: true },
    { id: "2", name: "产品简介", selected: true },
    { id: "3", name: "购买指南", selected: true },
    { id: "4", name: "快速入门", selected: true },
    { id: "5", name: "操作指南", selected: true },
    { id: "6", name: "实践教程", selected: true },
    { id: "7", name: "API文档", selected: true },
    { id: "8", name: "常见问题", selected: true },
    { id: "9", name: "服务协议", selected: true },
    { id: "10", name: "联系我们", selected: true },
    { id: "11", name: "词汇表", selected: true },
  ],
  天翼云: [
    { id: "1", name: "产品动态", selected: true },
    { id: "2", name: "产品介绍", selected: true },
    { id: "3", name: "计费说明", selected: true },
    { id: "4", name: "快速入门", selected: true },
    { id: "5", name: "用户指南", selected: true },
    { id: "6", name: "IPv6带宽", selected: true },
    { id: "7", name: "共享流量包", selected: true },
    { id: "8", name: "最佳实践", selected: true },
    { id: "9", name: "API参考", selected: true },
    { id: "10", name: "常见问题", selected: true },
    { id: "11", name: "相关协议", selected: true },
  ],
}

export default function Home() {
  const [showAddModal, setShowAddModal] = useState(false)
  const [showModuleModal, setShowModuleModal] = useState(false)
  const [showFrequencyModal, setShowFrequencyModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<MonitoringItem | null>(null)

  // Form state for new monitoring item
  const [productUrl, setProductUrl] = useState("https://support.huaweicloud.com/eip/index.html")
  const [monitoringItemName, setMonitoringItemName] = useState("华为云弹性公网IP_1")
  const [selectedVendor, setSelectedVendor] = useState("华为云")
  const [selectedModules, setSelectedModules] = useState<string[]>(
    vendorModules["华为云"].filter(m => m.selected).map(m => m.name)
  )
  const [frequency, setFrequency] = useState("30天/次")
  const [nameError, setNameError] = useState("")
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState("")

  // State for available modules based on selected vendor
  const [modules, setModules] = useState<Module[]>(vendorModules["华为云"])

  // State for monitoring items list
  const [monitoringItems, setMonitoringItems] = useState<MonitoringItem[]>([])
  const [monitoringRecords, setMonitoringRecords] = useState<MonitoringRecord[]>([])
  const [monitoringDetails, setMonitoringDetails] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // 添加分页和缓存状态
  const [recordsPage, setRecordsPage] = useState(1)
  const [recordsCache, setRecordsCache] = useState<Record<string, MonitoringRecord[]>>({})
  const [detailsCache, setDetailsCache] = useState<Record<string, any[]>>({})
  const [isLoadingRecords, setIsLoadingRecords] = useState(false)
  const RECORDS_PER_PAGE = 5

  // 修改用户状态，简化为只有管理员
  const [isAdmin, setIsAdmin] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)

  // 添加 SSE 相关状态
  const [eventSource, setEventSource] = useState<EventSource | null>(null)

  // 添加分页相关状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  // 添加执行中的监控项状态管理
  const [executingItemIds, setExecutingItemIds] = useState<Set<string>>(new Set())

  // 初始化 SSE 连接
  useEffect(() => {
    const sse = new EventSource('/api/monitoring/events')

    sse.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      // 处理不同类型的更新
      switch (data.type) {
        case 'itemAdded':
          setMonitoringItems(prev => [...prev, data.item])
          break
        case 'itemDeleted':
          setMonitoringItems(prev => prev.filter(item => item.id !== data.itemId))
          if (selectedItem?.id === data.itemId) {
            setSelectedItem(null)
          }
          break
        case 'itemUpdated':
          setMonitoringItems(prev => 
            prev.map(item => item.id === data.item.id ? data.item : item)
          )
          if (selectedItem?.id === data.item.id) {
            setSelectedItem(data.item)
          }
          break
        case 'monitoringResult':
          if (data.itemId === selectedItem?.id) {
            // 更新监控记录和详情
            if (data.record) {
              setRecordsCache(prev => ({
                ...prev,
                [data.itemId]: [data.record, ...(prev[data.itemId] || [])]
              }))
              setMonitoringRecords(prev => [data.record, ...prev])
            }
            if (data.details) {
              setDetailsCache(prev => ({
                ...prev,
                [data.itemId]: [...data.details, ...(prev[data.itemId] || [])]
              }))
              setMonitoringDetails(prev => [...data.details, ...prev])
            }
          }
          break
      }
    }

    sse.onerror = (error) => {
      console.error('SSE 连接错误:', error)
      // 5秒后尝试重连
      setTimeout(() => {
        sse.close()
        setEventSource(new EventSource('/api/monitoring/events'))
      }, 5000)
    }

    setEventSource(sse)

    // 清理函数
    return () => {
      sse.close()
    }
  }, [selectedItem?.id])

  // 加载监控项列表
  const fetchMonitoringItems = async (page = 1) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/monitoring-items?page=${page}&pageSize=${pageSize}`);
      if (!response.ok) {
        throw new Error('Failed to fetch monitoring items');
      }
      const data = await response.json();
      setMonitoringItems(data.items);
      setTotalPages(data.pagination.totalPages);
      setCurrentPage(page);
    } catch (error) {
      console.error('Error:', error);
      message.error('获取监控项失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitoringItems();
  }, []);

  // Update modules when vendor changes
  useEffect(() => {
    if (selectedVendor in vendorModules) {
      setModules(vendorModules[selectedVendor as keyof typeof vendorModules])

      // Update selected modules based on the new vendor's default selections
      const defaultSelected = vendorModules[selectedVendor as keyof typeof vendorModules]
        .filter((m) => m.selected)
        .map((m) => m.name)

      setSelectedModules(defaultSelected)
    }
  }, [selectedVendor])

  // 修改获取监控记录的逻辑
  useEffect(() => {
    if (selectedItem) {
      const fetchMonitoringDetails = async () => {
        setIsLoadingRecords(true)
        try {
          // 检查缓存
          if (recordsCache[selectedItem.id]) {
            setMonitoringRecords(recordsCache[selectedItem.id])
            setMonitoringDetails(detailsCache[selectedItem.id] || [])
            setIsLoadingRecords(false)
            return
          }

          const response = await fetch(`/api/monitoring/${selectedItem.id}?page=${recordsPage}&limit=${RECORDS_PER_PAGE}`)
          const data = await response.json()

          if (data.records) {
            // 更新缓存
            setRecordsCache(prev => ({
              ...prev,
              [selectedItem.id]: data.records
            }))
            setMonitoringRecords(data.records)
          }

          if (data.details) {
            // 更新缓存
            setDetailsCache(prev => ({
              ...prev,
              [selectedItem.id]: data.details
            }))
            setMonitoringDetails(data.details)
          }
        } catch (error) {
          console.error(`Error fetching details for monitoring item ${selectedItem.id}:`, error)
        } finally {
          setIsLoadingRecords(false)
        }
      }

      fetchMonitoringDetails()
    } else {
      setMonitoringRecords([])
      setMonitoringDetails([])
    }
  }, [selectedItem, recordsPage])

  // 清除选中项时重置分页
  useEffect(() => {
    setRecordsPage(1)
  }, [selectedItem?.id])

  // 添加加载更多记录的函数
  const handleLoadMoreRecords = () => {
    setRecordsPage(prev => prev + 1)
  }

  const handleSelectItem = (item: MonitoringItem) => {
    setSelectedItem(item)
    monitoringScheduler.addOrUpdateItem(item, true)
    setMonitoringRecords(recordsCache[item.id] || [])
    setMonitoringDetails(detailsCache[item.id] || [])
  }

  // 修改权限检查函数
  const hasPermission = () => {
    return isAdmin
  }

  // 修改登录处理函数
  const handleLogin = async (username: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (data.success) {
        setIsAdmin(true)
        setShowLoginModal(false)
      } else {
        alert(data.error || '登录失败，请检查用户名和密码')
      }
    } catch (error) {
      console.error('Login error:', error)
      alert('登录失败，请稍后重试')
    }
  }

  const handleLogout = () => {
    setIsAdmin(false)
  }

  // 修改现有的操作函数，添加权限检查
  const handleAddClick = () => {
    if (!hasPermission()) {
      alert('只有管理员可以添加监控项')
      return
    }
    setShowAddModal(true)
    // Reset error message when opening modal
    setNameError("")
  }

  const handleCloseAddModal = () => {
    setShowAddModal(false)
    // Reset error message when closing modal
    setNameError("")
  }

  const handleOpenModuleModal = () => {
    setShowModuleModal(true)
  }

  const handleCloseModuleModal = () => {
    setShowModuleModal(false)
  }

  const handleOpenFrequencyModal = () => {
    setShowFrequencyModal(true)
  }

  const handleCloseFrequencyModal = () => {
    setShowFrequencyModal(false)
  }

  const handleSelectVendor = (vendor: string) => {
    setSelectedVendor(vendor)

    // Generate a default name based on the selected vendor
    const defaultName = `${vendor}弹性公网IP_1`
    setMonitoringItemName(defaultName)

    // Update URL based on vendor (simplified example)
    const vendorUrls = {
      华为云: "https://support.huaweicloud.com/eip/index.html",
      阿里云: "https://help.aliyun.com/zh/eip/?spm=a2c4g.11186623.0.0.57606dc2o5T6lX",
      天翼云: "https://www.ctyun.cn/document/10026753",
    }

    setProductUrl(vendorUrls[vendor as keyof typeof vendorUrls])
  }

  const handleUpdateModules = (updatedModules: Module[]) => {
    setModules(updatedModules)
    // Update selected modules array
    const selected = updatedModules.filter((m) => m.selected).map((m) => m.name)
    setSelectedModules(selected)
  }

  const handleSelectFrequency = (newFrequency: string) => {
    setFrequency(newFrequency)
    setShowFrequencyModal(false)
  }

  const handleChangeMonitoringItemName = (name: string) => {
    setMonitoringItemName(name)
    // Clear error when user starts typing
    if (nameError) {
      setNameError("")
    }
  }

  const validateName = async (name: string): Promise<boolean> => {
    // Check if name already exists in the list
    const nameExists = monitoringItems.some((item) => item.name === name)
    if (nameExists) {
      setNameError("监控项名称已存在，请使用其他名称")
      return false
    }
    return true
  }

  const handleAddMonitoringItem = async (emailEnabled: boolean, emailRecipients: string): Promise<void> => {
    // Validate name uniqueness
    if (!(await validateName(monitoringItemName))) {
      return
    }

    // Create form data for server action
    const formData = new FormData()
    formData.append("name", monitoringItemName)
    formData.append("url", productUrl)
    formData.append("vendor", selectedVendor)
    formData.append("modules", selectedModules.join(","))
    formData.append("frequency", frequency)

    // Add email notification settings
    formData.append("email_notification", emailEnabled.toString())
    if (emailEnabled && emailRecipients) {
      formData.append("email_recipients", emailRecipients)
    }

    // Call server action
    const result = await addMonitoringItem(formData)

    if (result.success && result.item) {
      // Add to list
      setMonitoringItems([...monitoringItems, result.item])

      // Select the new item
      setSelectedItem(result.item)

      // Close modal
      setShowAddModal(false)

      // Reset form for next time
      setMonitoringItemName("")
      setProductUrl("")
      setNameError("")
    } else if (result.error) {
      // Show error message
      setNameError(result.error)
    }
  }

  const handleDeleteItem = async (id: string) => {
    if (!hasPermission()) {
      alert('只有管理员可以删除监控项')
      return
    }
    const result = await deleteMonitoringItem(id)

    if (result.success) {
      const updatedItems = monitoringItems.filter((item) => item.id !== id)
      setMonitoringItems(updatedItems)

      // If the deleted item was selected, clear selection
      if (selectedItem && selectedItem.id === id) {
        setSelectedItem(null)
      }
    }
  }

  const handleExportResults = async () => {
    if (!selectedItem) return

    try {
      const result = await exportMonitoringResults(selectedItem.id)

      if (result.success && result.data) {
        // In a real application, you would handle the file download here
        // For this example, we'll just log the data
        console.log("Exported data:", result.data)

        // Create a JSON file for download
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `monitoring-results-${selectedItem.name}-${new Date().toISOString().split("T")[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error("Error exporting results:", error)
    }
  }

  const handleStartMonitoring = async (item: MonitoringItem) => {
    if (!hasPermission()) {
      alert('只有管理员可以执行监控')
      return
    }
    if (!item) return

    try {
      // 添加到执行集合
      setExecutingItemIds(prev => new Set(prev).add(item.id))

      const response = await fetch(`/api/monitoring/${item.id}/start`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to start monitoring")
      }

      const result = await response.json()

      if (result.success) {
        // 运行初始监控
        const monitoringResult = await runMonitoring(item.id)

        if (monitoringResult.success && monitoringResult.result) {
          const { item: updatedItem, record: newRecord, details: newDetails } = monitoringResult.result

          // 更新缓存和当前显示的记录
          if (newRecord) {
            const updatedRecords = [newRecord, ...(recordsCache[item.id] || [])]
            setRecordsCache(prev => ({
              ...prev,
              [item.id]: updatedRecords
            }))
            setMonitoringRecords(updatedRecords)
          }

          // 更新缓存和当前显示的详情
          if (newDetails && newDetails.length > 0) {
            const updatedDetails = [...newDetails, ...(detailsCache[item.id] || [])]
            setDetailsCache(prev => ({
              ...prev,
              [item.id]: updatedDetails
            }))
            setMonitoringDetails(updatedDetails)
          }
        }
      }
    } catch (error) {
      console.error("Error starting monitoring:", error)
      alert("启动监控失败")
    } finally {
      // 从执行集合中移除
      setExecutingItemIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(item.id)
        return newSet
      })
    }
  }

  const handleStopMonitoring = async (id: string) => {
    if (!hasPermission()) {
      alert('只有管理员可以停止监控')
      return
    }
    if (!selectedItem || selectedItem.id !== id) return

    try {
      // 先取消正在执行的监控任务
      monitoringScheduler.cancelExecution(id)

      const response = await fetch(`/api/monitoring/${id}/stop`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to stop monitoring")
      }

      const result = await response.json()

      if (result.success) {
        // 从执行集合中移除
        setExecutingItemIds(prev => {
          const newSet = new Set(prev)
          newSet.delete(id)
          return newSet
        })
      }
    } catch (error) {
      console.error("Error stopping monitoring:", error)
      alert("停止监控失败")
    }
  }

  // 分页组件
  const Pagination = () => {
    return (
        <div className="flex justify-center mt-4 space-x-2">
            <button
                onClick={() => fetchMonitoringItems(currentPage - 1)}
                disabled={currentPage === 1 || isLoading}
                className={`px-4 py-2 rounded ${
                    currentPage === 1 || isLoading
                        ? 'bg-gray-300 cursor-not-allowed'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
            >
                上一页
            </button>
            <span className="px-4 py-2">
                第 {currentPage} 页，共 {totalPages} 页
            </span>
            <button
                onClick={() => fetchMonitoringItems(currentPage + 1)}
                disabled={currentPage === totalPages || isLoading}
                className={`px-4 py-2 rounded ${
                    currentPage === totalPages || isLoading
                        ? 'bg-gray-300 cursor-not-allowed'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
            >
                下一页
            </button>
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed header with white floating effect */}
      <header className="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
        <div className="max-w-[1440px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Image
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/%E7%A4%BA%E4%BE%8B1-Xj5wZNHLMZv389y66etN9SEixUVRDW.png"
                alt="竞品监控工具 Logo"
                width={28}
                height={28}
                className="mr-3"
              />
              <h1 className="text-xl font-bold artistic-title">竞品监控工具</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {isAdmin ? (
                <>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#5767FC] to-[#EC78FF] font-medium">
                    管理员
                  </span>
                  <button
                    onClick={handleLogout}
                    className="text-sm px-4 py-2 rounded-lg bg-gradient-to-r from-[#5767FC] to-[#EC78FF] text-white hover:opacity-90 transition-opacity"
                  >
                    退出登录
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="text-sm px-4 py-2 rounded-lg bg-gradient-to-r from-[#5767FC] to-[#EC78FF] text-white hover:opacity-90 transition-opacity flex items-center space-x-2"
                >
                  <UserCog size={18} />
                  <span>管理员登录</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content with padding to account for fixed header */}
      <main className="pt-16 min-h-screen bg-background">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          <MonitoringList
            items={monitoringItems}
            onSelectItem={handleSelectItem}
            onAddClick={handleAddClick}
            onDeleteItem={handleDeleteItem}
            onStopMonitoring={handleStopMonitoring}
            selectedItemId={selectedItem?.id}
            isAdmin={isAdmin}
            executingItemIds={executingItemIds}
            isLoading={isLoading}
          />

          <MonitoringResults
            selectedItem={selectedItem}
            records={monitoringRecords}
            details={monitoringDetails}
            onStartMonitoring={() => selectedItem && handleStartMonitoring(selectedItem)}
            onStopMonitoring={() => selectedItem && handleStopMonitoring(selectedItem.id)}
            isLoadingRecords={isLoadingRecords}
            onLoadMore={handleLoadMoreRecords}
            hasMoreRecords={recordsPage * RECORDS_PER_PAGE < (monitoringRecords?.length || 0)}
            executingItemIds={executingItemIds}
          />
        </div>
      </main>

      {showAddModal && (
        <AddMonitoringModal
          onClose={handleCloseAddModal}
          onOpenModuleModal={handleOpenModuleModal}
          onOpenFrequencyModal={handleOpenFrequencyModal}
          productUrl={productUrl}
          setProductUrl={setProductUrl}
          monitoringItemName={monitoringItemName}
          setMonitoringItemName={handleChangeMonitoringItemName}
          selectedVendor={selectedVendor}
          onSelectVendor={handleSelectVendor}
          selectedModules={selectedModules}
          frequency={frequency}
          onAddItem={(emailEnabled, emailRecipients) => handleAddMonitoringItem(emailEnabled, emailRecipients)}
          nameError={nameError}
        />
      )}

      {showModuleModal && (
        <SelectModuleModal
          onClose={handleCloseModuleModal}
          modules={modules}
          onUpdateModules={handleUpdateModules}
          vendorName={selectedVendor}
        />
      )}

      {showFrequencyModal && (
        <SelectFrequencyModal
          onClose={handleCloseFrequencyModal}
          selectedFrequency={frequency}
          onSelectFrequency={handleSelectFrequency}
        />
      )}

      {showLoginModal && (
        <AuthModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSubmit={handleLogin}
        />
      )}

      <style jsx global>{`
        .artistic-title {
          background: linear-gradient(to right, #5767FC, #EC78FF);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          letter-spacing: 0.5px;
          font-weight: 700;
          text-shadow: 0px 2px 4px rgba(0, 0, 0, 0.1);
          position: relative;
          display: inline-block;
          transition: all 0.3s ease;
        }
        
        .artistic-title:hover {
          transform: translateY(-1px);
          text-shadow: 0px 4px 8px rgba(0, 0, 0, 0.15);
        }
        
        .artistic-title::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(to right, #5767FC, #EC78FF);
          transform: scaleX(0);
          transform-origin: bottom right;
          transition: transform 0.3s ease;
        }
        
        .artistic-title:hover::after {
          transform: scaleX(1);
          transform-origin: bottom left;
        }
      `}</style>
    </div>
  )
}

