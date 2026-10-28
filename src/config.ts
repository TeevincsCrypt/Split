/**
 * wagmi configuration — built from the active network only.
 * Arc Mainnet is defined via defineChain from onchain-facts (not from wagmi/chains,
 * which does not include it). Arc Testnet comes from viem/chains.
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig, fallback, unstable_connector } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { requireChain } from './onchain-facts'
import { ACTIVE_NETWORK } from './config/networks'

// Arc Mainnet is not in viem/chains — define it from onchain-facts
const arcMainnetFacts = requireChain(5042)
export const arcMainnet = defineChain({
  id: arcMainnetFacts.chainId,
  name: arcMainnetFacts.name,
  nativeCurrency: {
    name: 'USDC',
    symbol: arcMainnetFacts.nativeCurrency.symbol,
    decimals: arcMainnetFacts.nativeCurrency.decimals,
  },
  rpcUrls: {
    default: { http: arcMainnetFacts.rpcUrls as [string, ...string[]] },
  },
  blockExplorers: {
    default: { name: arcMainnetFacts.name, url: arcMainnetFacts.explorerBase },
  },
})

// Which Arc chain is active
const networkEnv: string = (import.meta.env.VITE_SPLIT_NETWORK as string | undefined) ?? 'testnet'
export const activeArcChain = networkEnv === 'mainnet' ? arcMainnet : arcTestnet

// Use the effective RPC URL from networks.ts (honours VITE_SPLIT_RPC_URL override and proxy)
const effectiveRpcUrl = ACTIVE_NETWORK.rpcUrl

// Register for trace labelling
registerChain(activeArcChain.id, effectiveRpcUrl)

export const config = createConfig({
  chains: [activeArcChain],
  connectors: [injected()],
  transports: {
    // Try each public endpoint in order, then the connected wallet's own RPC.
    [activeArcChain.id]: fallback([
      ...ACTIVE_NETWORK.rpcUrls.map((url) => http(url, { timeout: 10_000, retryCount: 1 })),
      unstable_connector(injected),
    ]),
  },
})
