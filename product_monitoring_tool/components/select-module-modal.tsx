"use client"

import { X } from "lucide-react"
import type { Module } from "@/lib/monitoring"

interface SelectModuleModalProps {
  onClose: () => void
  modules: Module[]
  onUpdateModules: (modules: Module[]) => void
  vendorName: string
}

export default function SelectModuleModal({ onClose, modules, onUpdateModules, vendorName }: SelectModuleModalProps) {
  const toggleSelectAll = () => {
    const allSelected = modules.every((m) => m.selected)
    const updatedModules = modules.map((m) => ({ ...m, selected: !allSelected }))
    onUpdateModules(updatedModules)
  }

  const toggleModule = (id: string) => {
    const updatedModules = modules.map((m) => (m.id === id ? { ...m, selected: !m.selected } : m))
    onUpdateModules(updatedModules)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-medium">选择{vendorName}监控模块</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {/* "Select All" checkbox fixed at the top */}
        <div className="p-4 pb-2 border-b shadow-sm">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={modules.every((m) => m.selected)}
              onChange={toggleSelectAll}
              className="w-4 h-4 text-blue-medium focus:ring-blue-medium border-gray-300 rounded"
            />
            <span className="ml-2">全选（默认）</span>
          </label>
        </div>

        {/* Scrollable content area */}
        <div className="p-4 overflow-y-auto" style={{ maxHeight: "calc(80vh - 130px)" }}>
          <div className="space-y-3">
            {modules.map((module) => (
              <label key={module.id} className="flex items-center">
                <input
                  type="checkbox"
                  checked={module.selected}
                  onChange={() => toggleModule(module.id)}
                  className="w-4 h-4 text-blue-medium focus:ring-blue-medium border-gray-300 rounded"
                />
                <span className="ml-2">{module.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

