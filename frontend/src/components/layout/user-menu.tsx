import React, { useState } from 'react'
import { User, Shield, Key, LogOut, ChevronDown, Check, Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { api } from '@/lib/api-client'
import type { ApiKeyItemResponse, ApiKeyCreateResponse } from '@/types/api'

export function UserMenu() {
  const { user, role, isAuthenticated, isLoading, login, logout } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [keyScopes, setKeyScopes] = useState<string[]>(['read:accuracy'])
  const [keys, setKeys] = useState<ApiKeyItemResponse[]>([])
  const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(null)
  const [isKeyLoading, setIsKeyLoading] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [isSwitching, setIsSwitching] = useState<string | null>(null)

  const handleQuickLogin = async (email: string, pass: string) => {
    setIsSwitching(email)
    try {
      await login(email, pass)
      setIsOpen(false)
    } catch (err: any) {
      console.error('Failed to log in:', err)
    } finally {
      setIsSwitching(null)
    }
  }

  const handleOpenKeys = async () => {
    setShowKeyModal(true)
    setIsOpen(false)
    setKeyError(null)
    setCreatedKey(null)
    setIsKeyLoading(true)
    try {
      const fetched = await api.getApiKeys()
      setKeys(fetched)
    } catch (err: any) {
      setKeyError(err.message || 'Failed to load API keys')
    } finally {
      setIsKeyLoading(false)
    }
  }

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyName.trim()) return
    setIsKeyLoading(true)
    setKeyError(null)
    try {
      const res = await api.createApiKey({
        name: keyName.trim(),
        scopes: keyScopes,
        expires_in_days: 90,
      })
      setCreatedKey(res)
      setKeyName('')
      const fetched = await api.getApiKeys()
      setKeys(fetched)
    } catch (err: any) {
      setKeyError(err.message || 'Failed to create key')
    } finally {
      setIsKeyLoading(false)
    }
  }

  const handleRevokeKey = async (id: string) => {
    setIsKeyLoading(true)
    try {
      await api.revokeApiKey(id)
      const fetched = await api.getApiKeys()
      setKeys(fetched)
    } catch (err: any) {
      setKeyError(err.message || 'Failed to revoke key')
    } finally {
      setIsKeyLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80 hover:border-cyan-500/60 hover:bg-slate-800/80 transition-all text-xs"
        aria-label="User account and RBAC profile"
      >
        <div className="w-5 h-5 rounded-full bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-300">
          <User className="w-3 h-3" />
        </div>
        <div className="flex flex-col text-left leading-tight">
          <span className="font-semibold text-slate-200">
            {user ? user.email.split('@')[0] : 'Guest'}
          </span>
          <span className="text-[10px] text-cyan-400 font-mono capitalize">
            {role ?? 'Public'}
          </span>
        </div>
        <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 mt-2 w-72 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-50 p-3 text-xs text-slate-200">
            <div className="pb-2.5 border-b border-slate-800">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                Active Session
              </div>
              <div className="font-medium text-slate-100 truncate">
                {user?.email ?? 'Unauthenticated'}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 border border-cyan-800/80 text-cyan-300 capitalize">
                  Role: {role ?? 'None'}
                </span>
                {user?.is_active && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                    Active
                  </span>
                )}
              </div>
            </div>

            <div className="py-2.5 border-b border-slate-800">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">
                Quick Role Switch (Demo)
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  disabled={isSwitching !== null}
                  onClick={() => handleQuickLogin('viewer@windiq.local', 'ViewerPass123!#')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                    role === 'viewer'
                      ? 'bg-cyan-950/80 border border-cyan-700/70 text-cyan-200'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-slate-400" />
                    <span>Viewer (Basic Read)</span>
                  </div>
                  {role === 'viewer' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </button>

                <button
                  type="button"
                  disabled={isSwitching !== null}
                  onClick={() => handleQuickLogin('analyst@windiq.local', 'AnalystPass123!#')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                    role === 'analyst'
                      ? 'bg-cyan-950/80 border border-cyan-700/70 text-cyan-200'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                    <span>Analyst (Granular Analytics)</span>
                  </div>
                  {role === 'analyst' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </button>

                <button
                  type="button"
                  disabled={isSwitching !== null}
                  onClick={() => handleQuickLogin('admin@windiq.local', 'AdminPass123!#')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                    role === 'admin'
                      ? 'bg-cyan-950/80 border border-cyan-700/70 text-cyan-200'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Admin (Full Privileges + API Keys)</span>
                  </div>
                  {role === 'admin' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </button>
              </div>
            </div>

            <div className="pt-2 space-y-1">
              {role === 'admin' && (
                <button
                  type="button"
                  onClick={handleOpenKeys}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-cyan-400 hover:bg-cyan-950/50 hover:text-cyan-300 transition-colors"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Provision Machine API Keys</span>
                </button>
              )}

              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => {
                    logout()
                    setIsOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-rose-400 hover:bg-rose-950/50 hover:text-rose-300 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Admin Machine API Key Management Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 text-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Machine-to-Machine API Keys
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Created Key Banner */}
            {createdKey && (
              <div className="my-4 p-3 rounded-xl bg-amber-950/60 border border-amber-600/70 text-amber-200 text-xs">
                <div className="font-bold mb-1 flex items-center gap-1.5 text-amber-300">
                  <span>⚠️ Save Plaintext Key Now</span>
                </div>
                <p className="mb-2">This secret key is shown exactly once and cannot be recovered:</p>
                <code className="block p-2 rounded bg-slate-950 font-mono text-[11px] text-amber-400 break-all select-all border border-amber-900/80">
                  {createdKey.plaintext_key}
                </code>
              </div>
            )}

            {/* Provision Form */}
            <form onSubmit={handleCreateKey} className="my-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Key Name / Client ID
                </label>
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g. trading-desk-pipeline"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isKeyLoading || !keyName.trim()}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isKeyLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Generate Key</span>
                </button>
              </div>
            </form>

            {/* Existing Keys Table */}
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-2">
                Active Provisioned Keys
              </div>
              {keys.length === 0 ? (
                <div className="text-xs text-slate-500 py-3 text-center">
                  No active programmatic API keys provisioned.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {keys.map((k) => (
                    <div
                      key={k.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-200">{k.name}</div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {k.key_prefix}••••••••
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRevokeKey(k.id)}
                        disabled={k.is_revoked || isKeyLoading}
                        className="px-2 py-1 rounded bg-rose-950 border border-rose-800/80 text-rose-300 hover:bg-rose-900 text-[11px] disabled:opacity-40"
                      >
                        {k.is_revoked ? 'Revoked' : 'Revoke'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
