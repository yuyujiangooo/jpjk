"use client"

import { X } from "lucide-react"
import { useState } from "react"

interface AddMonitoringModalProps {
  onClose: () => void
  onOpenModuleModal: () => void
  onOpenFrequencyModal: () => void
  productUrl: string
  setProductUrl: (url: string) => void
  monitoringItemName: string
  setMonitoringItemName: (name: string) => void
  selectedVendor: string
  onSelectVendor: (vendor: string) => void
  selectedModules: string[]
  frequency: string
  onAddItem: (emailEnabled: boolean, emailRecipients: string) => Promise<void>
  nameError?: string
}

export default function AddMonitoringModal({
  onClose,
  onOpenModuleModal,
  onOpenFrequencyModal,
  productUrl,
  setProductUrl,
  monitoringItemName,
  setMonitoringItemName,
  selectedVendor,
  onSelectVendor,
  selectedModules,
  frequency,
  onAddItem,
  nameError,
}: AddMonitoringModalProps) {
  const vendors = ["阿里云", "华为云", "天翼云"]
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState("")
  const [emailError, setEmailError] = useState("")

  const validateEmails = (emails: string) => {
    if (!emails.trim()) return true
    const emailList = emails.split(/[;,\s]+/)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailList.every((email) => emailRegex.test(email.trim()))
  }

  const handleEmailChange = (value: string) => {
    setEmailRecipients(value)
    if (!validateEmails(value)) {
      setEmailError("请输入有效的邮箱地址，多个邮箱请用分号分隔")
    } else {
      setEmailError("")
    }
  }

  const handleSubmit = () => {
    if (emailEnabled && !validateEmails(emailRecipients)) {
      setEmailError("请输入有效的邮箱地址，多个邮箱请用分号分隔")
      return
    }
    onAddItem(emailEnabled, emailRecipients)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 overflow-y-auto">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-3 border-b sticky top-0 bg-white z-10">
          <h2 className="text-base font-medium">添加监控</h2>
          <button 
            onClick={onClose} 
            className="text-gray-500 hover:text-gray-700"
            title="关闭"
            aria-label="关闭对话框"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">选择竞品：</label>
            <div className="grid grid-cols-3 gap-2">
              {vendors.map((vendor) => (
                <button
                  key={vendor}
                  onClick={() => onSelectVendor(vendor)}
                  className={`border rounded-lg py-2 px-4 text-center text-sm ${
                    selectedVendor === vendor
                      ? "border-blue-medium bg-blue-50 text-blue-dark"
                      : "border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {vendor}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">产品url：</label>
            <input
              type="text"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-medium"
            />
          </div>

          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">监控项：</label>
            <input
              type="text"
              value={monitoringItemName}
              onChange={(e) => setMonitoringItemName(e.target.value)}
              className={`w-full border rounded-lg p-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-medium ${
                nameError ? "border-red-500" : "border-gray-300"
              }`}
            />
            {nameError && <p className="mt-0.5 text-xs text-red-500">{nameError}</p>}
          </div>

          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">选择模块：</label>
            <div
              onClick={onOpenModuleModal}
              className="w-full border border-gray-300 rounded-lg p-1.5 flex items-center justify-between cursor-pointer text-sm"
            >
              <div className="flex flex-wrap gap-1">
                {selectedModules.length > 0 ? (
                  selectedModules.map((module, index) => (
                    <div
                      key={index}
                      className="bg-blue-50 text-blue-dark text-xs px-1.5 py-0.5 rounded flex items-center"
                    >
                      {module}
                      <X size={12} className="ml-1 cursor-pointer" />
                    </div>
                  ))
                ) : (
                  <span className="text-gray-500">请选择监控模块</span>
                )}
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-400"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">监控频率：</label>
            <div
              onClick={onOpenFrequencyModal}
              className="w-full border border-gray-300 rounded-lg p-1.5 flex items-center justify-between cursor-pointer text-sm"
            >
              <span>{frequency}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-400"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>

          {/* Email notification section */}
          <div className="mb-4 space-y-3">
            <div className="flex items-center justify-start gap-3">
              <label className="text-xs font-medium text-gray-700">自动发送提醒邮件：</label>
              <button
                onClick={() => setEmailEnabled(!emailEnabled)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-medium focus:ring-offset-1 ${
                  emailEnabled ? "bg-blue-medium" : "bg-gray-200"
                }`}
              >
                <span
                  className={`${
                    emailEnabled ? "translate-x-5" : "translate-x-1"
                  } inline-block h-3 w-3 transform rounded-full bg-white transition-transform`}
                />
                <span className="sr-only">开启邮件提醒</span>
              </button>
            </div>

            {emailEnabled && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">收件人：</label>
                <input
                  type="text"
                  value={emailRecipients}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="多个邮箱请用分号分隔"
                  className={`w-full border rounded-lg p-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-medium ${
                    emailError ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {emailError && <p className="mt-0.5 text-xs text-red-500">{emailError}</p>}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={
                !monitoringItemName ||
                !productUrl ||
                selectedModules.length === 0 ||
                !!nameError ||
                (emailEnabled && (!!emailError || !emailRecipients))
              }
              className={`px-3 py-1.5 rounded-lg transition-colors text-sm ${
                !monitoringItemName ||
                !productUrl ||
                selectedModules.length === 0 ||
                !!nameError ||
                (emailEnabled && (!!emailError || !emailRecipients))
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-[#ECEEFF] text-[#3A48FB] border border-[#3A48FB] hover:bg-[#3A48FB] hover:text-white"
              }`}
            >
              确认添加
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

