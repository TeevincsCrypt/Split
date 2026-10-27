import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAddress(addr: string): string {
  if (addr.length < 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function formatTimestamp(ts: number): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ts * 1000))
}

export function buildExplorerTx(hash: string): string {
  const { explorerBase } = ACTIVE_NETWORK
  return `${explorerBase}/tx/${hash}`
}

export function buildExplorerAddress(addr: string): string {
  const { explorerBase } = ACTIVE_NETWORK
  return `${explorerBase}/address/${addr}`
}

import { ACTIVE_NETWORK } from '@/config/networks'
