/**
 * Network configuration for Split.
 * All chain facts come from @/onchain-facts — never hardcoded here.
 * Validates all env vars at startup and surfaces config errors clearly.
 */
import { isAddress } from 'viem'
import { requireChain, getUsdc } from '@/onchain-facts'

export interface NetworkConfig {
  chainId: number
  name: string
  /** Short display name for compact UI elements */
  shortName?: string
  /** Effective RPC URL: VITE_SPLIT_RPC_URL override → proxy → onchain-facts default */
  rpcUrl: string
  /** Ordered RPC endpoints tried by the fallback transport; rpcUrls[0] === rpcUrl */
  rpcUrls: string[]
  explorerBase: string
  usdcAddress: `0x${string}`
  usdcDecimals: number
  isTestnet: boolean
  /** null when contract not configured; configError will be non-null in that case */
  distributorAddress: `0x${string}` | null
  deployBlock: bigint
  /** ScheduledSplit contract address — null when not configured (feature is hidden) */
  scheduledSplitAddress: `0x${string}` | null
  /** Block at which ScheduledSplit was deployed (getLogs fromBlock) */
  scheduledSplitDeployBlock: bigint
  /** Human-readable error if the config is invalid (e.g. bad address) */
  configError: string | null
}

const ARC_TESTNET_CHAIN_ID = 5042002
const ARC_MAINNET_CHAIN_ID = 5042

/**
 * Extra public endpoints tried after the registry default. Arc's docs have listed
 * rpc.testnet.arc.network, while viem and Arc Studio list rpc.testnet.arc.io; trying
 * both keeps reads working whichever one a browser can reach.
 */
const EXTRA_PUBLIC_RPCS: Record<number, string[]> = {
  // Ordered by measured reliability (scripts/rpc-probe.ts). rpc.testnet.arc.network
  // rejected every call from CI, so it is last.
  [ARC_TESTNET_CHAIN_ID]: [
    'https://rpc.blockdaemon.testnet.arc.io',
    'https://rpc.quicknode.testnet.arc.io',
    'https://rpc.drpc.testnet.arc.io',
    'https://rpc.testnet.arc.network',
  ],
  [ARC_MAINNET_CHAIN_ID]: [
    'https://rpc.blockdaemon.mainnet.arc.io',
    'https://rpc.quicknode.mainnet.arc.io',
    'https://rpc.drpc.mainnet.arc.io',
  ],
}

export { logSourcesFor } from './logSources'

function withFallbacks(primary: string, chainId: number): string[] {
  return [...new Set([primary, ...(EXTRA_PUBLIC_RPCS[chainId] ?? [])])]
}

function buildNetworkConfig(chainId: number): Omit<NetworkConfig, 'distributorAddress' | 'deployBlock' | 'configError'> {
  const chain = requireChain(chainId)
  const usdc = getUsdc(chainId)
  if (!usdc) throw new Error(`USDC not deployed on chain ${chainId}`)
  return {
    chainId: chain.chainId,
    name: chain.name,
    shortName: chain.isTestnet ? 'Arc Testnet' : 'Arc',
    rpcUrl: chain.rpcUrls[0],
    rpcUrls: withFallbacks(chain.rpcUrls[0], chain.chainId),
    explorerBase: chain.explorerBase,
    usdcAddress: usdc.address as `0x${string}`,
    usdcDecimals: usdc.decimals,
    isTestnet: chain.isTestnet,
    scheduledSplitAddress: null,
    scheduledSplitDeployBlock: 0n,
  }
}

export const ARC_TESTNET_BASE = buildNetworkConfig(ARC_TESTNET_CHAIN_ID)
export const ARC_MAINNET_BASE = buildNetworkConfig(ARC_MAINNET_CHAIN_ID)

/**
 * Resolve the effective RPC URL for the active network.
 * Priority: VITE_SPLIT_RPC_URL (custom override) > Arc Studio RPC proxy > onchain-facts default.
 * Returns { url, configError } — configError is set when VITE_SPLIT_RPC_URL is present but invalid.
 */
function resolveRpcUrl(defaultUrl: string, defaults: string[]): { url: string; urls: string[]; configError: string | null } {
  const proxyBase: string = (import.meta.env.VITE_RPC_PROXY_BASE_URL as string | undefined) ?? ''
  const proxyToken: string = (import.meta.env.VITE_RPC_PROXY_TOKEN as string | undefined) ?? ''
  const proxyChainsRaw: string = (import.meta.env.VITE_RPC_PROXY_CHAINS as string | undefined) ?? ''

  // Custom override takes precedence — must be an https URL
  const customRpc: string = (import.meta.env.VITE_SPLIT_RPC_URL as string | undefined)?.trim() ?? ''
  if (customRpc) {
    if (!customRpc.startsWith('https://')) {
      return {
        url: defaultUrl,
        urls: defaults,
        configError: `VITE_SPLIT_RPC_URL "${customRpc}" must be an https URL.`,
      }
    }
    return { url: customRpc, urls: [...new Set([customRpc, ...defaults])], configError: null }
  }

  // Arc Studio proxy (server-side env — only present inside Arc Studio)
  const proxyChainKey = defaultUrl.includes('testnet') || defaultUrl.includes('5042002') ? 'Arc_Testnet' : 'Arc'
  const proxyChains = proxyChainsRaw.split(',').map((s) => s.trim())
  if (proxyBase && proxyChains.includes(proxyChainKey) && proxyToken) {
    const proxied = `${proxyBase}/api/rpc/${proxyChainKey}?_rpc_token=${proxyToken}`
    return { url: proxied, urls: [proxied], configError: null }
  }

  return { url: defaultUrl, urls: defaults, configError: null }
}

function parseSafeBlock(raw: string | undefined): bigint {
  if (!raw) return 0n
  try { return BigInt(raw.trim()) } catch { return 0n }
}

function resolveActiveNetwork(): NetworkConfig {
  const networkEnv: string = (import.meta.env.VITE_SPLIT_NETWORK as string | undefined) ?? ''
  const addressEnv: string | undefined = import.meta.env.VITE_SPLIT_DISTRIBUTOR_ADDRESS as string | undefined
  const deployBlockEnv: string | undefined = import.meta.env.VITE_SPLIT_DEPLOY_BLOCK as string | undefined
  const scheduledAddrEnv: string | undefined = import.meta.env.VITE_SCHEDULED_SPLIT_ADDRESS as string | undefined
  const scheduledBlockEnv: string | undefined = import.meta.env.VITE_SCHEDULED_SPLIT_DEPLOY_BLOCK as string | undefined

  // Validate VITE_SPLIT_NETWORK — reject unknown values
  if (networkEnv !== 'testnet' && networkEnv !== 'mainnet' && networkEnv !== '') {
    const base = ARC_TESTNET_BASE
    return {
      ...base,
      distributorAddress: null,
      deployBlock: 0n,
      scheduledSplitAddress: null,
      scheduledSplitDeployBlock: 0n,
      configError: `Unknown VITE_SPLIT_NETWORK value "${networkEnv}". Must be "testnet" or "mainnet".`,
    }
  }

  const base = networkEnv === 'mainnet' ? ARC_MAINNET_BASE : ARC_TESTNET_BASE

  // Validate VITE_SPLIT_DISTRIBUTOR_ADDRESS
  const trimmedAddress = addressEnv?.trim() ?? ''
  if (trimmedAddress && !isAddress(trimmedAddress)) {
    return {
      ...base,
      distributorAddress: null,
      deployBlock: 0n,
      scheduledSplitAddress: null,
      scheduledSplitDeployBlock: 0n,
      configError: `VITE_SPLIT_DISTRIBUTOR_ADDRESS "${trimmedAddress}" is not a valid EVM address.`,
    }
  }

  // Validate VITE_SCHEDULED_SPLIT_ADDRESS (optional — feature hidden when absent)
  const trimmedSchedAddr = scheduledAddrEnv?.trim() ?? ''
  if (trimmedSchedAddr && !isAddress(trimmedSchedAddr)) {
    return {
      ...base,
      distributorAddress: trimmedAddress ? (trimmedAddress as `0x${string}`) : null,
      deployBlock: parseSafeBlock(deployBlockEnv),
      scheduledSplitAddress: null,
      scheduledSplitDeployBlock: 0n,
      configError: `VITE_SCHEDULED_SPLIT_ADDRESS "${trimmedSchedAddr}" is not a valid EVM address.`,
    }
  }

  // Resolve effective RPC URL (custom override > proxy > default)
  const { url: rpcUrl, urls: rpcUrls, configError: rpcError } = resolveRpcUrl(base.rpcUrl, base.rpcUrls)
  if (rpcError) {
    return {
      ...base,
      rpcUrl,
      rpcUrls,
      distributorAddress: null,
      deployBlock: 0n,
      scheduledSplitAddress: null,
      scheduledSplitDeployBlock: 0n,
      configError: rpcError,
    }
  }

  return {
    ...base,
    rpcUrl,
    rpcUrls,
    distributorAddress: trimmedAddress ? (trimmedAddress as `0x${string}`) : null,
    deployBlock: parseSafeBlock(deployBlockEnv),
    scheduledSplitAddress: trimmedSchedAddr ? (trimmedSchedAddr as `0x${string}`) : null,
    scheduledSplitDeployBlock: parseSafeBlock(scheduledBlockEnv),
    configError: null,
  }
}

export const ACTIVE_NETWORK: NetworkConfig = resolveActiveNetwork()

// Proxy chain key for the active network — used by history.ts RPC proxy selection
export const ACTIVE_PROXY_CHAIN_KEY: string =
  ACTIVE_NETWORK.chainId === ARC_MAINNET_CHAIN_ID ? 'Arc' : 'Arc_Testnet'

export const MAX_RECIPIENTS = 50
export const BPS_DENOMINATOR = 10_000
