export async function createCharacter(characterData: {
  name: string;
  race: string;
  characterClass: string;
  distributedPoints?: Record<string, number>;
  avatar?: string;
  creationTxHash?: string;
  nftMintTxHash?: string;
  nftTokenId?: string;
  nftTokenUri?: string;
}): Promise<any> {
  const response = await fetch('/api/character', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...characterData,
      distributedPoints: characterData.distributedPoints || {},
    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    let message = 'Failed to create character';
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      message = parsed?.error || message;
    } catch {
      // ignore non-JSON bodies
      if (raw.trim()) message = raw.trim();
    }
    throw new Error(message);
  }

  const raw = await response.text().catch(() => '');
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
