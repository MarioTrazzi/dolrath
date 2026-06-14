import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function validatePasswordStrength(password: string): {
  score: number
  feedback: string[]
} {
  const feedback: string[] = []
  let score = 0

  if (password.length >= 8) {
    score += 1
  } else {
    feedback.push('Pelo menos 8 caracteres')
  }

  if (/[a-z]/.test(password)) {
    score += 1
  } else {
    feedback.push('Pelo menos uma letra minúscula')
  }

  if (/[A-Z]/.test(password)) {
    score += 1
  } else {
    feedback.push('Pelo menos uma letra maiúscula')
  }

  if (/\d/.test(password)) {
    score += 1
  } else {
    feedback.push('Pelo menos um número')
  }

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    score += 1
  } else {
    feedback.push('Pelo menos um caractere especial')
  }

  return { score, feedback }
}

// NOTE: O cálculo de atributos da criação vive em `@/lib/characterStats`
// (computeCreationStats), que espelha exatamente a lógica do servidor
// em src/app/api/character/route.ts. A antiga calculateFinalStats usava
// uma base de dados/fórmulas divergentes (characterCreationData) e foi
// removida para evitar mostrar números que não condizem com a realidade.