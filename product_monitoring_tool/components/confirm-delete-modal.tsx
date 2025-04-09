import { X } from "lucide-react"

interface ConfirmDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  itemName: string
}

export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  itemName,
}: ConfirmDeleteModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg p-6 w-[400px] shadow-xl">
        <h3 className="text-lg font-medium mb-2">确认删除</h3>
        <p className="text-gray-600 mb-6">
          您确定要删除 "{itemName}" 吗？此操作无法撤销。
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center justify-center bg-[#ECEEFF] text-[#3A48FB] border border-[#3A48FB] rounded-lg px-4 py-2 hover:bg-[#3A48FB] hover:text-white transition-colors"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
} 