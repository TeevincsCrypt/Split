/**
 * Network configuration for Split.
 * All chain facts come from @/onchain-facts — never hardcoded here.
 */
import { requireChain, getUsdc } from '@/onchain-facts'

export interface NetworkConfig {
  chainId: number
  name: string
  rpcUrl: string
  explorerBase: string
  usdcAddress: `0x${string}`
  usdcDecimals: number
  isTestnet: boolean
  distributorAddress: `0x${string}` | null
  deployBlock: bigint
}

const ARC_TESTNET_CHAIN_ID = 5042002
const ARC_MAINNET_CHAIN_ID = 5042

function buildNetworkConfig(chainId: number): NetworkConfig {
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
    distributorAddress: null,
    deployBlock: 0n,
  }
}

export const ARC_TESTNET_CONFIG: NetworkConfig = {
  ...buildNetworkConfig(ARC_TESTNET_CHAIN_ID),
}

export const ARC_MAINNET_CONFIG: NetworkConfig = {
  ...buildNetworkConfig(ARC_MAINNET_CHAIN_ID),
}

function resolveActiveNetwork(): NetworkConfig {
  const networkEnv: string = (import.meta.env.VITE_SPLIT_NETWORK as string | undefined) ?? 'testnet'
  const addressEnv: string | undefined = import.meta.env.VITE_SPLIT_DISTRIBUTOR_ADDRESS as string | undefined
  const deployBlockEnv: string | undefined = import.meta.env.VITE_SPLIT_DEPLOY_BLOCK as string | undefined

  const base = networkEnv === 'mainnet' ? { ...ARC_MAINNET_CONFIG } : { ...ARC_TESTNET_CONFIG }

  base.distributorAddress = (addressEnv?.trim() as `0x${string}`) || null
  base.deployBlock = deployBlockEnv ? BigInt(deployBlockEnv) : 0n

  return base
}

export const ACTIVE_NETWORK: NetworkConfig = resolveActiveNetwork()

export const MAX_RECIPIENTS = 50
export const BPS_DENOMINATOR = 10_000
