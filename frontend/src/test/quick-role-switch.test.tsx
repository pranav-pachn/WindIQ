import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuickRoleSwitcher } from '@/components/layout/quick-role-switcher'
import { AuthProvider } from '@/context/auth-context'
import { api } from '@/lib/api-client'

vi.mock('@/lib/api-client', () => ({
  api: {
    login: vi.fn().mockResolvedValue({
      access_token: 'fake-token',
      token_type: 'bearer',
      expires_in_seconds: 900,
      user_id: '123',
      email: 'analyst@windiq.local',
      role: 'Analyst',
      csrf_token: 'fake-csrf',
    }),
    getCurrentUser: vi.fn().mockResolvedValue({
      user_id: '123',
      email: 'analyst@windiq.local',
      full_name: null,
      role: 'Analyst',
      is_active: true,
      permissions: ['accuracy:read', 'overview:read'],
    }),
    refreshSession: vi.fn().mockRejectedValue(new Error('No session')),
    onAuthChange: vi.fn().mockReturnValue(() => {}),
  },
}))

describe('QuickRoleSwitcher Component', () => {
  it('renders compact mode with all 3 demo roles', () => {
    render(
      <AuthProvider>
        <QuickRoleSwitcher variant="compact" />
      </AuthProvider>
    )

    expect(screen.getByText('Viewer')).toBeInTheDocument()
    expect(screen.getByText('Analyst')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('triggers login with Analyst credentials when clicking Analyst in compact mode', async () => {
    const onSwitched = vi.fn()
    render(
      <AuthProvider>
        <QuickRoleSwitcher variant="compact" onRoleSwitched={onSwitched} />
      </AuthProvider>
    )

    const analystBtn = screen.getByRole('button', { name: /Analyst/i })
    fireEvent.click(analystBtn)

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith({
        email: 'analyst@windiq.local',
        password: 'AnalystPass123!#',
      })
    })
  })

  it('renders card mode with role descriptions and capability tags', () => {
    render(
      <AuthProvider>
        <QuickRoleSwitcher variant="cards" />
      </AuthProvider>
    )

    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('Superuser')).toBeInTheDocument()
    expect(screen.getByText('Basic Read')).toBeInTheDocument()
    expect(screen.getByText('analyst@windiq.local')).toBeInTheDocument()
    expect(screen.getByText('admin@windiq.local')).toBeInTheDocument()
    expect(screen.getByText('viewer@windiq.local')).toBeInTheDocument()
    expect(screen.getByText('Multi-Horizon Curves')).toBeInTheDocument()
  })

  it('triggers login with Admin credentials when clicking Admin card', async () => {
    render(
      <AuthProvider>
        <QuickRoleSwitcher variant="cards" />
      </AuthProvider>
    )

    const adminEmail = screen.getByText('admin@windiq.local')
    const adminBtn = adminEmail.closest('button')!
    expect(adminBtn).toBeInTheDocument()
    fireEvent.click(adminBtn)

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith({
        email: 'admin@windiq.local',
        password: 'AdminPass123!#',
      })
    })
  })
})
