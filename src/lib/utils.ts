import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { CharacterRace, BaseStats, FinalStats } from '../types/character';

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

export function calculateFinalStats(race: CharacterRace, distributedPoints: BaseStats): FinalStats {
  const base = race.baseStats;
  const racial = race.bonusStats;
  const distributed = distributedPoints;
  
  const final: FinalStats = {
    str: base.str + (racial.str || 0) + distributed.str,
    agi: base.agi + (racial.agi || 0) + distributed.agi,
    int: base.int + (racial.int || 0) + distributed.int,
    res: base.res + (racial.res || 0) + distributed.res,
    hp: 0, // Will be calculated
    mp: 0, // Will be calculated
    crit: 0, // Will be calculated
    speed: 0, // Will be calculated
  };
  
  // Calcular atributos derivados
  final.hp = base.hp + (racial.hp || 0) + (final.str * 3) + (final.res * 2);
  final.mp = base.mp + (racial.mp || 0) + (final.int * 4) + (final.agi * 1);
  final.crit = base.crit + (final.agi * 0.2);
  final.speed = base.speed + (final.agi * 0.5);
  
  return final;
}