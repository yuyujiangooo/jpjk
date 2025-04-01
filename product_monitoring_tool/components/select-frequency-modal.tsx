"use client"

import { X } from "lucide-react"

interface SelectFrequencyModalProps {
  onClose: () => void
  selectedFrequency: string
  onSelectFrequency: (frequency: string) => void
}

export default function SelectFrequencyModal({
  onClose,
  selectedFrequency,
  onSelectFrequency,
}: SelectFrequencyModalProps) {
  const frequencies = ["30天/次", "7天/次", "1天/次", "1小时/次"]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-lg">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-medium">选择监控频率</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-2">
          {frequencies.map((frequency, index) => (
            <div
              key={index}
              onClick={() => onSelectFrequency(frequency)}
              className={`p-4 cursor-pointer hover:bg-gray-50 ${selectedFrequency === frequency ? "bg-blue-50" : ""}`}
            >
              {frequency}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

