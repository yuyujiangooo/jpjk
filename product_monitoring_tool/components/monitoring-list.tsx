"use client"

import type { MonitoringItem } from "@/lib/monitoring"
import { Search, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

interface MonitoringListProps {
  items: MonitoringItem[]
  onSelectItem: (item: MonitoringItem) => void
  onAddClick: () => void
  onDeleteItem: (id: string) => void
  selectedItemId?: string
}

export default function MonitoringList({
  items,
  onSelectItem,
  onAddClick,
  onDeleteItem,
  selectedItemId,
}: MonitoringListProps) {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredItems = searchTerm
    ? items.filter((item) => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : items

  return (
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

          <button
            onClick={onAddClick}
            className="ml-2 flex items-center justify-center bg-[#ECEEFF] text-[#3A48FB] border border-[#3A48FB] rounded-lg px-4 py-2 hover:bg-[#3A48FB] hover:text-white transition-colors"
          >
            <Plus size={18} className="mr-1" />
            <span>添加</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-4 space-y-2">
          {filteredItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">没有找到匹配的监控项</div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectItem(item)}
                className={`flex items-center justify-between p-4 rounded-lg cursor-pointer border-l-4 transition-all
                  hover:bg-[#ECEEFF] hover:shadow-md
                  ${
                    selectedItemId === item.id
                      ? "bg-[#ECEEFF] border-blue-dark shadow-md"
                      : "bg-white border-transparent"
                  }`}
              >
                <div>
                  <h3 className="font-medium text-blue-dark">{item.name}</h3>
                  <p className="text-sm text-gray-500">{item.url}</p>
                </div>
                <button
                  className="text-gray-400 hover:text-gray-600"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteItem(item.id)
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #F5F5F5;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #BBBBBB;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #999999;
        }
      `}</style>
    </div>
  )
}

