import { ethers } from 'ethers';

/**
 * Polygon (mainnet + Amoy testnet) enforces a minimum priority fee on every
 * transaction (currently 25 gwei). MetaMask, however, defaults to ~1.5 gwei for
 * networks it doesn't have first-class fee oracle support for, so transactions
 * sent without explicit overrides get rejected by the RPC with:
 *
 *   "transaction gas price below minimum: gas tip cap 1500000000,
 *    minimum needed 25000000000"
 *
 * To avoid this we always compute EIP-1559 fee overrides from the node and clamp
 * the priority fee to a safe floor above the network minimum.
 */
// network minimum is 25 gwei; add headroom
const MIN_PRIORITY_FEE = ethers.parseUnits('30', 'gwei');

export async function getPolygonFeeOverrides(
  provider: ethers.Provider
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const minPriority = MIN_PRIORITY_FEE;

  const feeData = await provider.getFeeData();

  let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? minPriority;
  if (maxPriorityFeePerGas < minPriority) {
    maxPriorityFeePerGas = minPriority;
  }

  // Pull the current base fee from the latest block for an accurate ceiling.
  let baseFee = 0n;
  try {
    const block = await provider.getBlock('latest');
    baseFee = block?.baseFeePerGas ?? 0n;
  } catch {
    baseFee = 0n;
  }

  // maxFee must cover base fee + priority; double the base for headroom across
  // a few blocks of base-fee movement.
  let maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas;
  if (feeData.maxFeePerGas && feeData.maxFeePerGas > maxFeePerGas) {
    maxFeePerGas = feeData.maxFeePerGas;
  }
  if (maxFeePerGas < maxPriorityFeePerGas) {
    maxFeePerGas = maxPriorityFeePerGas;
  }

  return { maxFeePerGas, maxPriorityFeePerGas };
}
