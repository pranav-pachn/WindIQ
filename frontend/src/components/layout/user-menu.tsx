import React, { useState } from 'react'
import { User, Key, LogOut, ChevronDown, Sparkles, X } from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { api } from '@/lib/api-client'
import { QuickRoleSwitcher } from '@/components/layout/quick-role-switcher'
import type { ApiKeyItemResponse, ApiKeyCreateResponse } from '@/types/api'

export function UserMenu() {
  const { user, role, isAuthenticated, logout } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [keyScopes] = useState<string[]>(['read:accuracy'])
  const [keys, setKeys] = useState<ApiKeyItemResponse[]>([])
  const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(null)
  const [_isKeyLoading, setIsKeyLoading] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)

  const isAdmin = role?.toLowerCase() === 'admin'

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
        className="flex items-center gap-2 px-2 py-1 rounded-md bg-[#111C2D] border border-[#26364A] hover:bg-[#162337] transition-colors text-xs"
        aria-label="User account and RBAC profile"
      >
        <div className="w-5 h-5 rounded bg-[#162337] border border-[#26364A] flex items-center justify-center text-[#35B9C8]">
          <User className="w-3 h-3" />
        </div>
        <div className="flex flex-col text-left leading-none">
          <span className="font-semibold text-[#E7EDF5] text-xs">
            {user ? user.email.split('@')[0] : 'Guest'}
          </span>
          <span className="text-[10px] text-[#718198] font-mono capitalize mt-0.5">
            {role ?? 'Public'}
          </span>
        </div>
        <ChevronDown className="w-3 h-3 text-[#718198] ml-0.5" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <div className="absolute right-0 mt-1.5 w-84 sm:w-96 rounded-lg bg-[#111C2D] border border-[#26364A] shadow-2xl z-50 p-3.5 text-xs text-[#E7EDF5]">
            <div className="pb-3 border-b border-[#1E2B3E]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-[#718198] font-mono font-semibold">
                  Active Session
                </span>
                <div className="flex items-center gap-2">
                  {user?.is_active && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#133829] text-[#35B98A] border border-[#1C523B]">
                      Authenticated
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-1 rounded-md text-[#9AAABD] hover:text-[#E7EDF5] hover:bg-[#162337] border border-transparent hover:border-[#26364A] transition-colors"
                    title="Close user menu"
                    aria-label="Close user menu"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="font-semibold text-[#E7EDF5] truncate text-xs">
                {user?.email ?? 'Unauthenticated (Guest Mode)'}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#162337] border border-[#26364A] text-[#9AAABD] capitalize">
                  Role: {role ?? 'Guest'}
                </span>
                {user?.permissions && (
                  <span className="text-[10px] text-[#718198] font-mono">
                    {user.permissions.length} RBAC scopes
                  </span>
                )}
              </div>
            </div>

            <div className="py-2.5 border-b border-[#1E2B3E]">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-wider text-[#9AAABD] font-mono font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-[#35B9C8]" />
                  <span>Demo Role Switcher</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#718198]">Instant RBAC</span>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-[#9AAABD] hover:text-[#E7EDF5] bg-[#162337] hover:bg-[#1E2B3E] border border-[#26364A] transition-colors"
                    title="Close role switcher"
                    aria-label="Close role switcher"
                  >
                    <X className="w-3 h-3" />
                    <span>Close</span>
                  </button>
                </div>
              </div>

              <QuickRoleSwitcher variant="cards" onRoleSwitched={() => {}} />
            </div>

            <div className="pt-2 space-y-1">
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleOpenKeys}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-[#35B9C8] hover:bg-[#162337] transition-colors font-medium border border-[#183E4C]"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Provision API Keys (Admin)</span>
                </button>
              )}

              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => {
                    logout()
                    setIsOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-[#E36D73] hover:bg-[#3E1A1D]/50 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out Session</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full mt-1 py-1 rounded-md text-center text-[11px] font-mono text-[#9AAABD] hover:text-[#E7EDF5] bg-[#162337]/60 hover:bg-[#162337] border border-[#26364A] transition-colors"
              >
                Close Menu
              </button>
            </div>
          </div>
        </>
      )}

      {/* Admin Machine API Key Management Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="w-full max-w-lg rounded-lg bg-[#111C2D] border border-[#26364A] shadow-2xl p-5 text-[#E7EDF5]">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2B3E]">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-[#35B9C8]" />
                <h3 className="text-sm font-bold text-[#E7EDF5]">
                  Machine-to-Machine API Keys
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="text-[#718198] hover:text-[#E7EDF5] text-sm"
              >
                ✕
              </button>
            </div>

            {keyError && (
              <div className="mt-3 p-2 rounded bg-[#3E1A1D] border border-[#5E262B] text-[#E36D73] text-xs">
                {keyError}
              </div>
            )}

            {createdKey && (
              <div className="mt-3 p-3 rounded bg-[#133829] border border-[#1C523B] space-y-1">
                <div className="text-xs font-semibold text-[#35B98A]">API Key Generated</div>
                <div className="text-[11px] text-[#9AAABD]">
                  Save this key now. It will not be shown again.
                </div>
                <code className="block p-2 rounded bg-[#0A101C] font-mono text-xs text-[#E7EDF5] break-all select-all">
                  {createdKey.plaintext_key}
                </code>
              </div>
            )}

            <form onSubmit={handleCreateKey} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] text-[#9AAABD] mb-1 font-medium">
                  Key Description / Service Name
                </label>
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g., automated-pipeline-client"
                  className="w-full px-3 py-1.5 rounded bg-[#0E1726] border border-[#26364A] text-xs text-[#E7EDF5] font-mono focus:border-[#35B9C8] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="px-3 py-1.5 rounded text-xs text-[#9AAABD] hover:text-[#E7EDF5]"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-[#35B9C8] text-[#0A101C] font-semibold text-xs hover:bg-[#2DA4B2]"
                >
                  Create Key
                </button>
              </div>
            </form>

            <div className="mt-4 pt-3 border-t border-[#1E2B3E]">
              <div className="text-[11px] font-semibold text-[#9AAABD] uppercase tracking-wider mb-2 font-mono">
                Active Provisioned Keys ({keys.length})
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {keys.map((k) => (
                  <div
                    key={k.id}
                    className="p-2 rounded bg-[#0E1726] border border-[#1E2B3E] flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold text-[#E7EDF5]">{k.name}</span>
                      <span className="text-[10px] text-[#718198] font-mono block">
                        Prefix: {k.key_prefix}... • Expires: {k.expires_at ? k.expires_at.slice(0, 10) : 'Never'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeKey(k.id)}
                      className="text-[#E36D73] hover:text-rose-300 text-[11px] font-mono"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
