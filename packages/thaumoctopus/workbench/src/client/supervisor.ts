/** Typed client for the local host supervisor's control API. */

export type HostSupervisorState = 'starting' | 'running' | 'stopped' | 'stopping'

export interface HostSupervisorStatus {
  readonly state: HostSupervisorState
  readonly pid?: number
  readonly restarts?: number
  readonly lastError?: string
  readonly profile?: string
}

export class HostSupervisorClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = (...arguments_) => fetch(...arguments_),
  ) {}

  async restart(): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl}/restart`, { method: 'POST' })
    if (!response.ok) {
      throw new Error(`The host supervisor rejected the restart request (${String(response.status)})`)
    }
  }

  async status(): Promise<HostSupervisorStatus> {
    const response = await this.fetchImpl(`${this.baseUrl}/host`)
    if (!response.ok) {
      throw new Error(`The host supervisor is unavailable (${String(response.status)})`)
    }
    return await response.json() as HostSupervisorStatus
  }
}

/** Default loopback address of the supervisor started by supervisor.mjs. */
export function supervisorBaseUrl(): string {
  return (process.env.DSH_CLIENT_THAUMOCTOPUS_SUPERVISOR_URL ?? 'http://127.0.0.1:18099').replace(/\/+$/, '')
}
