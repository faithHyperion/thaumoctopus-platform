/** Typed client for the Thaumoctopus Control Plane. */

export interface ControlPlaneUser {
  readonly id: number
  readonly email: string
  readonly plan: string
  readonly role: string
  readonly status: string
}

export interface CatalogItem {
  readonly pluginId: string
  readonly packageName: string
  readonly displayName: string
  readonly description: string
  readonly icon: string
  readonly version: string
  readonly channel: string
  readonly minDsh: string
  readonly categories: readonly string[]
  readonly plans: readonly string[]
  readonly state: string
  readonly releaseNotes: string
}

export interface InstallGrant {
  readonly pluginId: string
  readonly packageName: string
  readonly version: string
  readonly registryUrl: string
  readonly token: string
  readonly expiresAt: string
  readonly expiresIn: number
}

interface Session {
  readonly accessToken: string
  readonly refreshToken: string
  readonly user: ControlPlaneUser
}

interface ErrorResponse {
  readonly error?: { readonly message?: string }
}

const SESSION_KEY = 'thaumoctopus.workbench.session'

export class ControlPlaneClient {
  private session: Session | undefined

  constructor(
    private readonly baseUrl: string,
    private readonly storage: Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> | undefined
      = typeof sessionStorage === 'undefined' ? undefined : sessionStorage,
    private readonly fetchImpl: typeof fetch = (...arguments_) => fetch(...arguments_),
  ) {
    try {
      const raw = this.storage?.getItem(SESSION_KEY)
      if (raw !== undefined && raw !== null) this.session = JSON.parse(raw) as Session
    } catch {
      this.session = undefined
      this.storage?.removeItem(SESSION_KEY)
    }
  }

  currentUser(): ControlPlaneUser | undefined {
    return this.session?.user
  }

  hasSession(): boolean {
    return this.session !== undefined
  }

  async login(email: string, password: string): Promise<ControlPlaneUser> {
    const next = await this.request<Session>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false)
    this.saveSession(next)
    return next.user
  }

  async logout(): Promise<void> {
    const refreshToken = this.session?.refreshToken
    if (refreshToken !== undefined) {
      await this.request('/v1/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined)
    }
    this.clearSession()
  }

  async catalog(): Promise<readonly CatalogItem[]> {
    const answer = await this.request<{ readonly items?: readonly CatalogItem[] }>('/v1/workbench/catalog')
    return answer.items ?? []
  }

  async installGrant(pluginId: string, version: string): Promise<InstallGrant> {
    return this.request<InstallGrant>('/v1/registry/install-grants', {
      method: 'POST',
      body: JSON.stringify({ pluginId, version }),
    })
  }

  private async request<T>(path: string, init: RequestInit = {}, refreshOnUnauthorized = true): Promise<T> {
    const response = await this.fetchImpl(this.baseUrl + path, {
      ...init,
      headers: {
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(this.session === undefined ? {} : { Authorization: `Bearer ${this.session.accessToken}` }),
        ...(init.headers ?? {}),
      },
    })
    if (response.status === 401 && refreshOnUnauthorized && this.session !== undefined) {
      await this.refresh()
      return this.request<T>(path, init, false)
    }

    const payload = await response.json().catch(() => null) as (T & ErrorResponse) | null
    if (!response.ok) throw new Error(payload?.error?.message ?? 'Control Plane request failed')
    return payload as T
  }

  private async refresh(): Promise<void> {
    const refreshToken = this.session?.refreshToken
    if (refreshToken === undefined) {
      this.clearSession()
      throw new Error('The Workbench session has expired')
    }
    const next = await this.request<Session>('/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }, false)
    this.saveSession(next)
  }

  private saveSession(session: Session): void {
    this.session = session
    try {
      this.storage?.setItem(SESSION_KEY, JSON.stringify(session))
    } catch {
      // A private-mode storage failure keeps the session alive for this page only.
    }
  }

  private clearSession(): void {
    this.session = undefined
    try {
      this.storage?.removeItem(SESSION_KEY)
    } catch {
      // Nothing else can be done when storage is unavailable.
    }
  }
}
