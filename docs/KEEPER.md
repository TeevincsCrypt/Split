# Keeper bot — setup guide

The keeper bot runs on a GitHub Actions schedule (every 5 minutes) and executes any due scheduled payments on the `ScheduledSplit` contract. Payments happen **at or shortly after** the scheduled time — never before. GitHub's scheduled jobs are best-effort and can run a few minutes late.

> **Public repo warning:** Actions logs on public repositories are publicly visible.
> The workflow is written to never print secrets, private keys, RPC URLs, or API keys.
> Never add a `run` step that echoes those values.

---

## How it works

1. On each run the keeper reads `scheduleCount()` from the contract.
2. It calls `isDue(id)` for ids 1..count in batches of 10 concurrent reads. A failed read is reported to stderr (the run exits non-zero) rather than silently treated as "not due".
3. For each due schedule it **simulates** the `execute(id)` call first (rejects reverts without spending gas), then sends the real transaction, waits for the receipt, and checks `receipt.status`. A reverted receipt is a failure — it is logged and counted but does not block the remaining ids.
4. At most 100 executes per run (safety cap).
5. Exits 0 when nothing is due or all executes succeeded. Exits non-zero on any failure so GitHub marks the run as failed and sends a notification email.

---

## Step 1: Create a dedicated keeper wallet

Generate a fresh wallet for the keeper — **never reuse your personal or payer wallet**.

Using `cast` (Foundry):
```sh
cast wallet new
```

Copy the **private key** (hex, with or without `0x` prefix) and the **address**.

> The keeper wallet only needs a small amount of USDC for gas. On Arc Testnet, get USDC from the "Get test USDC" button in Arc Studio's sidebar. On mainnet, send a small amount (e.g. 0.50 USDC) from your own wallet — the keeper does not custody any funds, it only pays gas.

---

## Step 2: Fund the keeper wallet with USDC for gas

On **Arc Testnet:**
Use the Arc Studio sidebar → "Get test USDC" to drip test USDC to the keeper address.

On **Arc Mainnet:**
Send a small amount of USDC (0.10–1.00 USDC depending on expected frequency) to the keeper address. Top it up when the balance runs low. Each `execute` call costs roughly 250 000–1 300 000 gas (first call cold, subsequent payments cheaper).

---

## Step 3: Add secrets and variables

Go to your repo → **Settings** → **Secrets and variables** → **Actions**.

### Secrets (encrypted, never shown in logs)

| Secret name | Value |
|---|---|
| `KEEPER_PRIVATE_KEY` | The keeper wallet private key (hex, with or without `0x`). |
| `RPC_URL` | *(optional)* A custom RPC endpoint. Store as a **secret** (not a variable) because the URL may contain a provider API key. Leave unset to use the default Arc RPC. |

> Why `RPC_URL` as a secret? Many RPC providers embed an API key in the URL path or query string (e.g. `https://arc.infura.io/v3/YOUR_KEY`). A repo variable would be visible to anyone with read access; a secret is redacted in logs and only exposed to trusted workflows.

### Variables (visible to all workflow runs)

Under **Variables**, add:

| Variable name | Value |
|---|---|
| `SPLIT_NETWORK` | `testnet` or `mainnet` |
| `SCHEDULED_SPLIT_ADDRESS` | The deployed ScheduledSplit contract address, e.g. `0xf43192c85c5888c7b01fe7257efb80f6de2e17d6` |

---

## Step 4: Test with `workflow_dispatch`

1. Go to your repo → **Actions** → **Keeper** workflow.
2. Click **Run workflow**.
3. Select `dry_run = true` for a safe first test — the keeper will discover and simulate due payments but send no transactions.
4. Click **Run workflow** and watch the logs:
   ```
   [keeper] Network: testnet | Contract: 0xf43192... | DRY_RUN=true
   [keeper] scheduleCount: 0
   [keeper] No schedules exist. Nothing to do.
   ```
5. Once satisfied, run again with `dry_run = false` to allow real execution.

---

## GitHub Actions schedule: important caveats

### Runs only on the default branch

GitHub scheduled workflows only trigger on the repository's **default branch** (usually `main`). A workflow file on a feature branch will not run on a schedule.

### Automatic disabling after 60 days of inactivity

GitHub **automatically disables** scheduled workflows after 60 days with no repository activity (no commits, PRs, issues, etc.). When this happens:

1. You receive an email notification from GitHub.
2. Go to **Actions** → **Keeper** → click **Enable workflow** to re-enable it.
3. Consider adding a low-effort keep-alive (e.g. a monthly automated commit) if the contract will be active for a long time with no repo changes.

### Best-effort timing

GitHub schedules are not guaranteed to fire exactly on the cron expression. A 5-minute cron may run anywhere from 5–15 minutes late under load. This is fine for the keeper — `isDue()` returns true until the payment is executed, so a late run catches up automatically.

---

## Dry run mode

Set `DRY_RUN=true` in the environment (or choose `dry_run = true` in `workflow_dispatch`) to discover and simulate due payments without sending any transactions. Useful for:

- Testing the keeper setup before funds are at stake.
- Debugging a failing simulation.
- Auditing what the keeper would do on the next run.

---

## Troubleshooting

**"KEEPER_PRIVATE_KEY is not set"**
→ Check that the secret name exactly matches `KEEPER_PRIVATE_KEY` (case-sensitive).

**"SCHEDULED_SPLIT_ADDRESS is missing or invalid"**
→ Check the variable value is a valid `0x...` Ethereum address.

**"SPLIT_NETWORK must be 'testnet' or 'mainnet'"**
→ Check the `SPLIT_NETWORK` variable contains exactly `testnet` or `mainnet` (lowercase).

**"Chain ID mismatch"**
→ `SPLIT_NETWORK` and `RPC_URL` point to different chains. Verify they match.

**"Cannot read scheduleCount"**
→ The default Arc RPC may be unavailable. Set `RPC_URL` (as a secret) to an alternative endpoint.

**isDue read failures**
→ The run exits non-zero. Check the RPC endpoint is reachable and not rate-limiting.

**Execution failed / reverted**
→ Check the payment is actually due (`isDue(id)` returns true). The schedule may have been cancelled, already executed, or the block timestamp may not have advanced past the due time.

**Keeper wallet out of funds**
→ Fund it with more USDC. Check the address in the contract's `ScheduleCreated` events (the `payer` is the creator; the keeper is whoever calls `execute`).

---

## Security notes

- The keeper wallet holds **no user funds**. It only pays gas to execute payments to the fixed recipients already recorded in the contract.
- The contract is permissionless — `execute(id)` can only transfer the pre-committed amounts to the pre-committed recipients. The keeper cannot redirect funds.
- The private key is stored as a GitHub secret and is masked in all log output.
- The keeper script redacts any URL-like strings from error messages before logging, so a provider API key embedded in an RPC URL is never written to the log.
- Rotate the keeper key if it is ever exposed: generate a new wallet, update `KEEPER_PRIVATE_KEY`, and fund the new address.
- On public repositories all Actions logs are publicly visible. The workflow is written to never echo secrets or RPC URLs.
