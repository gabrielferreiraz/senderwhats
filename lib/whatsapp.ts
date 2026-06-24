const BASE_URL = process.env.WHATSAPP_API_URL ?? "http://localhost:8080"
const API_KEY = process.env.API_KEY ?? ""

function authHeader(): Record<string, string> {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeader(), ...init?.headers },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WhatsApp API ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export type InstanceStatus = {
  userId: string
  instanceId: string
  status: "ready" | "not_ready"
  state: string | null
  authenticated: boolean
  lastError: string | null
}

export type QRResponse = {
  userId: string
  instanceId: string
  qrCode: string
}

export type SendResult = {
  success: boolean
  messageId: string
  message: string
  whatsappMessageId: string
  userId: string
  instanceId: string
}

export type InstanceInsight = {
  userId: string
  instanceId: string
  createdAt: string
  ready: boolean
  number: string | null
  totalApiCalls: number
  sentMessages: number
  receivedMessages: number
  authenticated: boolean
  state: string | null
  queueLength: number
  cachedLogs: number
}

export type ActiveInstance = {
  userId: string
  instanceId: string
  number: string | null
  ready: boolean
  authenticated: boolean
  state: string | null
  queueLength: number
}

export const whatsapp = {
  createInstance: (userId: string) =>
    request<{ message: string; userId: string; instanceId: string }>(
      `/instance/create/${userId}`
    ),

  getStatus: (userId: string) =>
    request<InstanceStatus>(`/instance/status/${userId}`),

  getQR: (userId: string) => request<QRResponse>(`/instance/qr/${userId}`),

  disconnect: (userId: string) =>
    request<{ message: string; userId: string; instanceId: string }>(
      `/instance/disconnect/${userId}`,
      { method: "POST" }
    ),

  deleteInstance: (userId: string) =>
    request<{ message: string; userId: string }>(
      `/instance/${userId}`,
      { method: "DELETE" }
    ),

  sendText: (userId: string, number: string, message: string) =>
    request<SendResult>(`/message/send-text/${userId}`, {
      method: "POST",
      body: JSON.stringify({ number, message }),
    }),

  getInsights: () =>
    request<{ total: number; insights: InstanceInsight[] }>(`/instance/insights`),

  getInsight: (userId: string) =>
    request<InstanceInsight>(`/instance/insights/${userId}`),

  getActiveInstances: () =>
    request<{ total: number; instances: ActiveInstance[] }>(`/instance/active`),

  pauseAI: (userId: string, number: string) =>
    request(`/ia/pause/${userId}`, {
      method: "POST",
      body: JSON.stringify({ number }),
    }),

  resumeAI: (userId: string, number: string) =>
    request(`/ia/resume/${userId}`, {
      method: "POST",
      body: JSON.stringify({ number }),
    }),
}
