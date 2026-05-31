'use client'

import { useEffect, useState } from 'react'

interface MdFileSummary {
  id: string
  filename: string
  createdAt: string
}

interface HistoryPaneProps {
  onClose: () => void
}

export default function HistoryPane({ onClose }: HistoryPaneProps) {
  const [files, setFiles] = useState<MdFileSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function fetchFiles() {
    try {
      const res = await fetch('/api/mdfiles')
      if (res.ok) setFiles(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchFiles() }, [])

  async function handleDelete(id: string) {
    if (!confirm('この要件書を削除しますか？')) return
    setDeleting(id)
    try {
      await fetch('/api/mdfiles', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setFiles(prev => prev.filter(f => f.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  async function handleDownload(id: string, filename: string) {
    const res = await fetch(`/api/mdfiles/${id}`)
    if (!res.ok) return
    const { content } = await res.json()
    const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-gray-700">保存済み要件書</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">閉じる</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-6 text-sm text-gray-400">読み込み中...</p>
        ) : files.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">保存済みの要件書はありません。</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {files.map(f => (
              <li key={f.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{f.filename}</p>
                  <p className="text-xs text-gray-400">{new Date(f.createdAt).toLocaleString('ja-JP')}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleDownload(f.id, f.filename)}
                    className="text-xs px-2 py-1 text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-50 transition-colors"
                  >
                    DL
                  </button>
                  <button
                    onClick={() => handleDelete(f.id)}
                    disabled={deleting === f.id}
                    className="text-xs px-2 py-1 text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors disabled:opacity-40"
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
