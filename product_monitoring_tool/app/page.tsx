"use client"

import Image from "next/image"
import { useState, useEffect } from "react"
import MonitoringList from "@/components/monitoring-list"
import MonitoringResults from "@/components/monitoring-results"
import AddMonitoringModal from "@/components/add-monitoring-modal"
import SelectModuleModal from "@/components/select-module-modal"
import SelectFrequencyModal from "@/components/select-frequency-modal"
import type { MonitoringItem, MonitoringRecord, Module } from "@/lib/monitoring"
import { addMonitoringItem, deleteMonitoringItem, runMonitoring, exportMonitoringResults } from "@/lib/actions"

// Define vendor-specific modules
const vendorModules = {
  华为云: [
    { id: "1", name: "最新动态", selected: true },
    { id: "2", name: "功能总览", selected: true },
    { id: "3", name: "产品介绍", selected: false },
    { id: "4", name: "计费说明", selected: true },
    { id: "5", name: "快速入门", selected: false },
    { id: "6", name: "用户指南", selected: false },
    { id: "7", name: "最佳实践", selected: false },
    { id: "8", name: "API参考", selected: false },
    { id: "9", name: "SDK参考", selected: false },
    { id: "10", name: "场景代码示例", selected: false },
    { id: "11", name: "常见问题", selected: false },
    { id: "12", name: "视频帮助", selected: false },
    { id: "13", name: "文档下载", selected: false },
  ],
  阿里云: [
    { id: "1", name: "产品概述", selected: true },
    { id: "2", name: "快速入门", selected: true },
    { id: "3", name: "操作指南", selected: false },
    { id: "4", name: "实践教程", selected: false },
    { id: "5", name: "安全合规", selected: false },
    { id: "6", name: "开发参考", selected: false },
    { id: "7", name: "服务支持", selected: false },
  ],
  腾讯云: [
    { id: "1", name: "动态与公告", selected: true },
    { id: "2", name: "产品简介", selected: true },
    { id: "3", name: "购买指南", selected: false },
    { id: "4", name: "快速入门", selected: false },
    { id: "5", name: "操作指南", selected: false },
    { id: "6", name: "实践教程", selected: false },
    { id: "7", name: "API文档", selected: false },
    { id: "8", name: "常见问题", selected: false },
    { id: "9", name: "服务协议", selected: false },
    { id: "10", name: "联系我们", selected: false },
    { id: "11", name: "词汇表", selected: false },
  ],
  天翼云: [
    { id: "1", name: "产品动态", selected: true },
    { id: "2", name: "产品介绍", selected: true },
    { id: "3", name: "计费说明", selected: true },
    { id: "4", name: "快速入门", selected: false },
    { id: "5", name: "用户指南", selected: false },
    { id: "6", name: "IPv6带宽", selected: false },
    { id: "7", name: "共享流量包", selected: false },
    { id: "8", name: "最佳实践", selected: false },
    { id: "9", name: "API参考", selected: false },
    { id: "10", name: "常见问题", selected: false },
    { id: "11", name: "相关协议", selected: false },
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
  const [selectedModules, setSelectedModules] = useState<string[]>(["最新动态", "功能总览", "计费说明"])
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

  // 加载监控项列表
  useEffect(() => {
    const fetchMonitoringItems = async () => {
      setIsLoading(true)
      let retryCount = 0
      const maxRetries = 3

      const tryFetch = async () => {
        try {
          const response = await fetch('/api/monitoring')
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          const data = await response.json()
          if (data.items) {
            setMonitoringItems(data.items)
          } else {
            throw new Error('No items data in response')
          }
        } catch (error) {
          console.error('Error fetching monitoring items:', error)
          if (retryCount < maxRetries) {
            retryCount++
            console.log(`Retrying... (${retryCount}/${maxRetries})`)
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
            return tryFetch()
          }
          // 显示错误提示
          alert('加载监控项失败，请刷新页面重试')
        }
      }

      await tryFetch()
      setIsLoading(false)
    }

    fetchMonitoringItems()
  }, [])

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
  }

  const handleAddClick = () => {
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
      阿里云: "https://help.aliyun.com/product/eip.html",
      腾讯云: "https://cloud.tencent.com/document/product/eip",
      天翼云: "https://www.ctyun.cn/document/eip",
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

  const handleStartMonitoring = async () => {
    if (!selectedItem) return

    try {
      const response = await fetch(`/api/monitoring/${selectedItem.id}/start`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to start monitoring")
      }

      const result = await response.json()

      if (result.success) {
        // 更新监控项状态
        const updatedItems = monitoringItems.map((item) =>
          item.id === selectedItem.id ? { ...item, is_monitoring: true } : item,
        )
        setMonitoringItems(updatedItems)

        // 更新选中项状态
        const updatedSelectedItem = { ...selectedItem, is_monitoring: true }
        setSelectedItem(updatedSelectedItem)

        // 运行初始监控
        const monitoringResult = await runMonitoring(selectedItem.id)

        if (monitoringResult.success && monitoringResult.result) {
          const { item: updatedItem, record: newRecord, details: newDetails } = monitoringResult.result

          // 更新监控项列表
          const updatedItemsWithResults = updatedItems.map((item) => 
            item.id === updatedItem.id ? updatedItem : item
          )
          setMonitoringItems(updatedItemsWithResults)
          setSelectedItem(updatedItem)

          // 更新缓存和当前显示的记录
          if (newRecord) {
            const updatedRecords = [newRecord, ...(recordsCache[selectedItem.id] || [])]
            setRecordsCache(prev => ({
              ...prev,
              [selectedItem.id]: updatedRecords
            }))
            setMonitoringRecords(updatedRecords)
          }

          // 更新缓存和当前显示的详情
          if (newDetails && newDetails.length > 0) {
            const updatedDetails = [...newDetails, ...(detailsCache[selectedItem.id] || [])]
            setDetailsCache(prev => ({
              ...prev,
              [selectedItem.id]: updatedDetails
            }))
            setMonitoringDetails(updatedDetails)
          }
        }
      }
    } catch (error) {
      console.error("Error starting monitoring:", error)
      alert("启动监控失败")
    }
  }

  const handleStopMonitoring = async () => {
    if (!selectedItem) return

    try {
      const response = await fetch(`/api/monitoring/${selectedItem.id}/stop`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to stop monitoring")
      }

      const result = await response.json()

      if (result.success) {
        // Update the item in the list
        const updatedItems = monitoringItems.map((item) =>
          item.id === selectedItem.id ? { ...item, is_monitoring: false } : item,
        )

        setMonitoringItems(updatedItems)
        setSelectedItem({ ...selectedItem, is_monitoring: false })
      }
    } catch (error) {
      console.error("Error stopping monitoring:", error)
      alert("停止监控失败")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed header with white floating effect */}
      <header className="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
        <div className="max-w-[1440px] mx-auto px-4 py-3">
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
            selectedItemId={selectedItem?.id}
          />

          <MonitoringResults
            selectedItem={selectedItem}
            records={monitoringRecords}
            details={monitoringDetails}
            onStartMonitoring={handleStartMonitoring}
            onStopMonitoring={handleStopMonitoring}
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

