"use client"

import type { MonitoringItem } from "@/lib/monitoring"
import { Search, Plus, Trash2 } from "lucide-react"
import { useState, useMemo } from "react"
import { FixedSizeList as List } from 'react-window'
import ConfirmDeleteModal from "./confirm-delete-modal"

interface MonitoringListProps {
  items: MonitoringItem[]
  onSelectItem: (item: MonitoringItem) => void
  onAddClick: () => void
  onDeleteItem: (id: string) => void
  onStopMonitoring: (id: string) => void
  selectedItemId?: string
  isAdmin: boolean
  executingItemIds: Set<string>
  isLoading: boolean
}

// 列表项组件
const MonitoringItemRow = ({ data, index, style }: any) => {
  const { items, selectedItemId, onSelectItem, handleDeleteClick } = data;
  const item = items[index];

  return (
    <div style={style}>
      <div
        onClick={() => onSelectItem(item)}
        className={`flex items-center justify-between p-4 rounded-lg cursor-pointer border-l-4 transition-all m-2
          hover:bg-[#ECEEFF] hover:shadow-md w-[calc(100%-16px)]
          ${
            selectedItemId === item.id
              ? "bg-[#ECEEFF] border-blue-dark shadow-md"
              : "bg-white border-transparent"
          }`}
      >
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-blue-dark truncate">{item.name}</h3>
          <p className="text-sm text-gray-500 truncate">{item.url}</p>
        </div>
        <button
          className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0"
          onClick={(e) => handleDeleteClick(e, item)}
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
};

export default function MonitoringList({
  items,
  onSelectItem,
  onAddClick,
  onDeleteItem,
  onStopMonitoring,
  selectedItemId,
  isAdmin,
  executingItemIds,
  isLoading,
}: MonitoringListProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [itemToDelete, setItemToDelete] = useState<MonitoringItem | null>(null)

  const filteredItems = useMemo(() => {
    if (!searchTerm) return items;
    const lowercaseSearchTerm = searchTerm.toLowerCase();
    return items.filter((item) => 
      item.name.toLowerCase().includes(lowercaseSearchTerm)
    );
  }, [items, searchTerm]);

  const handleDeleteClick = (e: React.MouseEvent, item: MonitoringItem) => {
    e.stopPropagation()
    if (!isAdmin) {
      alert('只有管理员可以删除监控项')
      return
    }

    if (executingItemIds.has(item.id)) {
      onStopMonitoring(item.id)
    }
    setItemToDelete(item)
  }

  const handleConfirmDelete = async () => {
    if (itemToDelete) {
      if (executingItemIds.has(itemToDelete.id)) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      onDeleteItem(itemToDelete.id)
      setItemToDelete(null)
    }
  }

  // 列表项数据
  const itemData = useMemo(() => ({
    items: filteredItems,
    selectedItemId,
    onSelectItem,
    handleDeleteClick,
  }), [filteredItems, selectedItemId, onSelectItem]);

  return (
    <>
      <div className="bg-[#F9FAFC] rounded-lg overflow-hidden shadow flex flex-col h-[calc(100vh-100px)]">
        <div className="bg-gradient-purple-blue text-white p-4">
          <h2 className="text-lg font-medium">监控列表</h2>
        </div>

        <div className="p-4 border-b bg-[#F9FAFC]">
          <div className="flex">
            <div className="relative flex-grow">
              <input
                type="text"
                placeholder="按名称搜索"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border border-gray-300 rounded-lg pl-3 pr-10 py-2 focus:outline-none focus:ring-2 focus:ring-blue-medium"
              />
              <button className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                <Search size={18} />
              </button>
            </div>

            <div className="ml-4">
              <button
                onClick={onAddClick}
                disabled={executingItemIds.size > 0}
                className={`flex items-center justify-center rounded-lg px-4 py-2 transition-colors group ${
                  executingItemIds.size > 0
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-[#ECEEFF] text-[#3A48FB] border border-[#3A48FB] hover:bg-[#3A48FB] hover:text-white'
                }`}
              >
                <Plus size={18} className="mr-1" />
                <span>添加</span>
                {executingItemIds.size > 0 && (
                  <div className="absolute invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-200 bottom-full right-0 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg whitespace-nowrap z-50">
                    监控执行中，暂时无法添加新的监控项
                    <div className="absolute -bottom-1 right-4 transform w-2 h-2 bg-gray-800 rotate-45"></div>
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-500">加载监控列表...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">没有找到匹配的监控项</div>
          ) : (
            <List
              height={window.innerHeight - 250}
              itemCount={filteredItems.length}
              itemSize={88}
              width="100%"
              itemData={itemData}
            >
              {MonitoringItemRow}
            </List>
          )}
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={itemToDelete !== null}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        itemName={itemToDelete?.name || ""}
      />
    </>
  )
}

