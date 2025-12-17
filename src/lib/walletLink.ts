export function buildWalletLinkMessage(params: {
  userId: string
  nonce: string
}): string {
  // Keep this message stable: the server will re-build it during verification.
  // Avoid including host/domain unless you persist it alongside the nonce.
  return [
    'Dolrath — Vincular carteira',
    '',
    `User ID: ${params.userId}`,
    `Nonce: ${params.nonce}`,
    '',
    'Ao assinar, você prova que controla esta carteira e autoriza vinculá-la à sua conta Dolrath.'
  ].join('\n')
}
