'use client'

import { useState } from 'react'
import { FileText, Table } from 'lucide-react'
import { exportReportAction } from '@/actions/export-actions'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ExportButtons({ reportType, filters }: { reportType: string, filters: any }) {
  const [loading, setLoading] = useState<string | null>(null)

  const handleExport = async (format: 'PDF' | 'EXCEL') => {
    setLoading(format)
    try {
      const response = await exportReportAction(reportType, format, filters)
      if (response?.error) {
        toast.error(response.error)
        return
      }

      if (response?.base64) {
        const link = document.createElement('a')
        link.href = `data:application/${format === 'PDF' ? 'pdf' : 'vnd.openxmlformats-officedocument.spreadsheetml.sheet'};base64,${response.base64}`
        link.download = `Civil_Tracker_${reportType}_${new Date().toISOString().split('T')[0]}.${format === 'PDF' ? 'pdf' : 'xlsx'}`
        link.click()
        toast.success(`Exported ${format} successfully`)
      }
    } catch (e) {
      console.error(e)
      toast.error(`Failed to export ${format}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex gap-2">
      <button 
        onClick={() => handleExport('PDF')} 
        disabled={!!loading}
        className="btn-ghost text-sm bg-white"
      >
        <FileText className="w-4 h-4 text-red-600" />
        {loading === 'PDF' ? 'Exporting...' : 'Export PDF'}
      </button>
      <button 
        onClick={() => handleExport('EXCEL')} 
        disabled={!!loading}
        className="btn-ghost text-sm bg-white"
      >
        <Table className="w-4 h-4 text-green-600" />
        {loading === 'EXCEL' ? 'Exporting...' : 'Export Excel'}
      </button>
    </div>
  )
}
