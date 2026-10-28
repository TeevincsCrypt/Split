/**
 * Shared "Release now" transaction for ScheduledSplit.execute(id).
 * Simulates first, sends with the active Arc chain (viem's chain-mismatch guard on),
 * waits for the receipt and treats a reverted receipt as a failure.
 */
import type { PublicClient, WalletClient } from 'viem'
import { activeArcChain } from '@/config'
import { SCHEDULED_SPLIT_ABI } from '@/abi/ScheduledSplit'
import { decodeScheduleError } from '@/components/create/StepScheduleCreate'

export type ExecuteResult =
  | { ok: true; hash: `0x${string}`; blockNumber: bigint }
  | { ok: false; error: string; hash?: `0x${string}` }

export async function executeSchedule(opts: {
  walletClient: WalletClient
  publicClient: PublicClient
  account: `0x${string}`
  contractAddress: `0x${string}`
  id: bigint
  onSubmitted?: (hash: `0x${string}`) => void
}): Promise<ExecuteResult> {
  const { walletClient, publicClient, account, contractAddress, id, onSubmitted } = opts
  try {
    await publicClient.simulateContract({
      address: contractAddress,
      abi: SCHEDULED_SPLIT_ABI,
      functionName: 'execute',
      args: [id],
      account,
    })
  } catch (err) {
    return { ok: false, error: decodeScheduleError(err) }
  }

  let hash: `0x${string}`
  try {
    hash = await walletClient.writeContract({
      address: contractAddress,
      abi: SCHEDULED_SPLIT_ABI,
      functionName: 'execute',
      args: [id],
      account,
      chain: activeArcChain,
    })
  } catch (err) {
    return { ok: false, error: decodeScheduleError(err) }
  }
  onSubmitted?.(hash)

  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 })
    if (receipt.status !== 'success') {
      return { ok: false, hash, error: 'Transaction reverted onchain. Check the explorer for details.' }
    }
    return { ok: true, hash, blockNumber: receipt.blockNumber }
  } catch {
    return { ok: false, hash, error: 'Submitted, not yet confirmed. Check the explorer before trying again.' }
  }
}
