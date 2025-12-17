export async function createCharacter(characterData: {
  name: string;
  race: string;
  characterClass: string;
  distributedPoints?: Record<string, number>;
  avatar?: string;
  creationTxHash?: string;
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
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to create character');
  }

  return response.json();
}
