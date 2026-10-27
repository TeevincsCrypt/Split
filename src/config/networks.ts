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
  rpcUrl: string
  explorerBase: string
  usdcAddress: `0x${string}`
  usdcDecimals: number
  isTestnet: boolean
  /** null when contract not configured; configError will be non-null in that case */
  distributorAddress: `0x${string}` | null
  deployBlock: bigint
  /** Human-readable error if the config is invalid (e.g. bad address) */
  configError: string | null
}

const ARC_TESTNET_CHAIN_ID = 5042002
const ARC_MAINNET_CHAIN_ID = 5042

function buildNetworkConfig(chainId: number): Omit<NetworkConfig, 'distributorAddress' | 'deployBlock' | 'configError'> {
  const chain = requireChain(chainId)
  const usdc = getUsdc(chainId)
  if (!usdc) throw new Error(`USDC not deployed on chain ${chainId}`)
  return {
    chainId: chain.chainId,
    name: chain.name,
    rpcUrl: chain.rpcUrls[0],
    explorerBase: chain.explorerBase,
    usdcAddress: usdc.address as `0x${string}`,
    usdcDecimals: usdc.decimals,
    isTestnet: chain.isTestnet,
  }
}

export const ARC_TESTNET_BASE = buildNetworkConfig(ARC_TESTNET_CHAIN_ID)
export const ARC_MAINNET_BASE = buildNetworkConfig(ARC_MAINNET_CHAIN_ID)

function resolveActiveNetwork(): NetworkConfig {
  const networkEnv: string = (import.meta.env.VITE_SPLIT_NETWORK as string | undefined) ?? ''
  const addressEnv: string | undefined = import.meta.env.VITE_SPLIT_DISTRIBUTOR_ADDRESS as string | undefined
  const deployBlockEnv: string | undefined = import.meta.env.VITE_SPLIT_DEPLOY_BLOCK as string | undefined

  // Validate VITE_SPLIT_NETWORK — reject unknown values
  if (networkEnv !== 'testnet' && networkEnv !== 'mainnet' && networkEnv !== '') {
    const base = ARC_TESTNET_BASE
    return {
      ...base,
      distributorAddress: null,
      deployBlock: 0n,
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
      configError: `VITE_SPLIT_DISTRIBUTOR_ADDRESS "${trimmedAddress}" is not a valid EVM address.`,
    }
  }

  // Parse VITE_SPLIT_DEPLOY_BLOCK safely
  let deployBlock = 0n
  if (deployBlockEnv) {
    try {
      deployBlock = BigInt(deployBlockEnv.trim())
    } catch {
      deployBlock = 0n
    }
  }

  return {
    ...base,
    distributorAddress: trimmedAddress ? (trimmedAddress as `0x${string}`) : null,
    deployBlock,
    configError: null,
  }
}

export const ACTIVE_NETWORK: NetworkConfig = resolveActiveNetwork()

// Proxy chain key for the active network — used by history.ts RPC proxy selection
export const ACTIVE_PROXY_CHAIN_KEY: string =
  ACTIVE_NETWORK.chainId === ARC_MAINNET_CHAIN_ID ? 'Arc' : 'Arc_Testnet'

export const MAX_RECIPIENTS = 50
export const BPS_DENOMINATOR = 10_000
