'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import ChatPane from '@/components/ChatPane'
import DocumentPane from '@/components/DocumentPane'
import HistoryPane from '@/components/HistoryPane'
import type { Message, Phase, RequirementsDoc, ApiResponse, MdFileDetail } from '@/lib/types'

const INITIAL_DOC: RequirementsDoc = {
  problem: '',
  target: '',
  goal: '',
  requirements: '',
  nonFunctional: '',
  completionConditions: '',
  constraints: '',
  outOfScope: '',
  risks: '',
  techStack: '',
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content: 'こんにちは！一緒にシステムの企画・要件定義を進めましょう。\n\nまず課題の整理からです。**今どんな困りごとや課題がありますか？** また、なぜ今それを解決しようと思いましたか？アイデアの段階でも大丈夫です！',
}

export default function Home() {
  const { data: session, status } = useSession()

  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [phase, setPhase] = useState<Phase>('phase1')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [doc, setDoc] = useState<RequirementsDoc>(INITIAL_DOC)
  const [isLoading, setIsLoading] = useState(false)
  const [mobileTab, setMobileTab] = useState<'chat' | 'doc' | 'history'>('chat')
  const [showHistory, setShowHistory] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [currentFileId, setCurrentFileId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const phase2Triggered = useRef(false)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const docRef = useRef(doc)
  docRef.current = doc
  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading

  async function callApi(msgs: Message[], ph: Phase, qi: number, d: RequirementsDoc) {
    setIsLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs, phase: ph, questionIndex: qi, doc: d }),
      })

      if (res.status === 401) {
        signIn('google')
        return
      }
      if (res.status === 429) {
        const data = await res.json()
        setMessages(prev => [...prev, { role: 'assistant', content: `${data.error}` }])
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data: ApiResponse = await res.json()

      if (data.sectionKey && data.sectionContent) {
        setDoc(prev => ({ ...prev, [data.sectionKey!]: data.sectionContent }))
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.message }])

      if (typeof data.nextQuestion === 'number') {
        setQuestionIndex(data.nextQuestion)
      }

      if (data.phase === 'done') {
        setPhase('done')
      } else if (ph === 'phase1' && data.nextQuestion >= 9) {
        setPhase('phase2')
      }
    } catch (e) {
      console.error('API error:', e)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'エラーが発生しました。しばらく待ってからお試しください。' },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (phase === 'phase2' && !phase2Triggered.current && !isLoadingRef.current) {
      phase2Triggered.current = true
      const trigger: Message = {
        role: 'user',
        content: '企画・要件定義フェーズが完了しました。技術スタックの選定をお願いします。',
      }
      const newMessages = [...messagesRef.current, trigger]
      setMessages(newMessages)
      callApi(newMessages, 'phase2', 9, docRef.current)
    }
  }, [phase])

  // セッション保存（要件書＋会話のスナップショット）。content はサーバが docState から生成する。
  const saveSession = useCallback(async () => {
    const filledCount = Object.values(doc).filter(Boolean).length
    if (filledCount === 0) return
    setSaveStatus('saving')
    const payload = { docState: doc, messages, phase, questionIndex }
    try {
      if (!currentFileId) {
        const filename = `project_plan_${new Date().toISOString().slice(0, 10)}.md`
        const res = await fetch('/api/mdfiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, ...payload }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setCurrentFileId(data.id)
      } else {
        const res = await fetch(`/api/mdfiles/${currentFileId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      }
      setSaveStatus('saved')
    } catch (e) {
      console.error('autosave failed:', e)
      setSaveStatus('idle')
      throw e
    }
  }, [doc, messages, phase, questionIndex, currentFileId])

  // 変更を debounce（約2.5秒）して自動保存する
  useEffect(() => {
    const filledCount = Object.values(doc).filter(Boolean).length
    if (filledCount === 0) return
    const timer = setTimeout(() => {
      void saveSession().catch(() => {})
    }, 2500)
    return () => clearTimeout(timer)
  }, [saveSession, doc])

  function handleSend(content: string) {
    const newMessages: Message[] = [...messages, { role: 'user', content }]
    setMessages(newMessages)
    callApi(newMessages, phase, questionIndex, doc)
  }

  async function handleSaveToDb() {
    const filledCount = Object.values(doc).filter(Boolean).length
    if (filledCount === 0) {
      setSaveMsg('保存するコンテンツがありません')
      setTimeout(() => setSaveMsg(''), 3000)
      return
    }
    setSaving(true)
    try {
      await saveSession()
      setSaveMsg('保存しました')
    } catch {
      setSaveMsg('保存に失敗しました')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  // 履歴から保存済みセッションを開いて復元する
  async function restoreSession(id: string) {
    const hasProgress = messages.length > 1 || Object.values(doc).some(Boolean)
    if (hasProgress && !confirm('現在の会話を破棄して、保存済みのセッションを開きますか？')) return
    try {
      const res = await fetch(`/api/mdfiles/${id}`)
      if (!res.ok) return
      const data: MdFileDetail = await res.json()

      if (data.docState) setDoc(data.docState as RequirementsDoc)
      if (data.messages) setMessages(data.messages as Message[])
      if (data.phase) setPhase(data.phase as Phase)
      if (typeof data.questionIndex === 'number') setQuestionIndex(data.questionIndex)

      setCurrentFileId(data.id)
      phase2Triggered.current = true
      setShowHistory(false)
      setMobileTab('chat')

      if (!data.docState && !data.messages) {
        alert('このデータには会話履歴がありません。要件書のみ利用できます。')
      }
    } catch (e) {
      console.error('restore failed:', e)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-sm text-gray-400">読み込み中...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-sm w-full text-center">
          <h1 className="text-xl font-semibold text-gray-800 mb-2">要件定義サポートAI ver.2</h1>
          <p className="text-sm text-gray-500 mb-8">
            ログインするとセッションが保存され、<br />いつでも過去の要件書を確認できます。
          </p>
          <button
            onClick={() => signIn('google')}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Google でログイン
          </button>
        </div>
      </div>
    )
  }

  const rightPanel = showHistory
    ? <HistoryPane onClose={() => setShowHistory(false)} onOpen={restoreSession} />
    : <DocumentPane doc={doc} phase={phase} />

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">要件定義サポートAI ver.2</span>
        <div className="flex items-center gap-3">
          {saveMsg ? (
            <span className="text-xs text-green-600">{saveMsg}</span>
          ) : saveStatus === 'saving' ? (
            <span className="text-xs text-gray-400">保存中...</span>
          ) : saveStatus === 'saved' ? (
            <span className="text-xs text-gray-400">保存しました</span>
          ) : null}
          <button
            onClick={handleSaveToDb}
            disabled={saving}
            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40"
          >
            {saving ? '保存中...' : 'クラウド保存'}
          </button>
          <button
            onClick={() => setShowHistory(prev => !prev)}
            className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            履歴
          </button>
          <span className="text-xs text-gray-400 hidden sm:inline">{session.user?.name}</span>
          <button onClick={() => signOut()} className="text-xs text-gray-400 hover:text-gray-600">
            ログアウト
          </button>
        </div>
      </div>

      <div className="flex md:hidden shrink-0 bg-white border-b border-gray-200">
        {(['chat', 'doc', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => {
              setMobileTab(tab)
              setShowHistory(tab === 'history')
            }}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === tab ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'
            }`}
          >
            {tab === 'chat' ? 'チャット' : tab === 'doc' ? 'ドキュメント' : '履歴'}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`
          flex-col border-gray-200
          ${mobileTab === 'chat' ? 'flex' : 'hidden'}
          md:flex md:w-2/5 md:border-r
          w-full
        `}>
          <ChatPane
            messages={messages}
            phase={phase}
            questionIndex={questionIndex}
            isLoading={isLoading}
            onSend={handleSend}
          />
        </div>

        <div className={`
          flex-col
          ${mobileTab !== 'chat' ? 'flex' : 'hidden'}
          md:flex md:w-3/5
          w-full
        `}>
          {rightPanel}
        </div>
      </div>
    </div>
  )
}
