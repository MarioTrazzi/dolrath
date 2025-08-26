'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { signIn } from 'next-auth/react'
import { Eye, EyeOff, Mail, Lock, User, Chrome, Check, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { registerSchema, type RegisterFormData } from '@/lib/validations/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Checkbox } from '@/components/ui/Checkbox'
import { validatePasswordStrength } from '@/lib/utils'

interface RegisterFormProps {
  onModeChange: (mode: 'login') => void
}

export function RegisterForm({ onModeChange }: RegisterFormProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState<{ score: number; feedback: string[] }>({ score: 0, feedback: [] })
  
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setError
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema)
  })
  
  const password = watch('password', '')
  
  // Update password strength when password changes
  useEffect(() => {
    if (password) {
      setPasswordStrength(validatePasswordStrength(password))
    }
  }, [password])
  
  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true)
    
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
        }),
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        if (result.error === 'EMAIL_EXISTS') {
          setError('email', { message: 'Este email já está em uso' })
        } else {
          setError('root', { message: result.error || 'Erro ao criar conta' })
        }
      } else {
        // Auto login after successful registration
        const signInResult = await signIn('credentials', {
          email: data.email,
          password: data.password,
          redirect: false
        })
        
        if (signInResult?.error) {
          setError('root', { message: 'Conta criada, mas erro no login automático' })
        } else {
          window.location.href = '/dashboard'
        }
      }
    } catch (error) {
      setError('root', { message: 'Erro inesperado. Tente novamente.' })
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleGoogleLogin = () => {
    signIn('google', { callbackUrl: '/dashboard' })
  }
  
  const getStrengthColor = (score: number) => {
    if (score <= 2) return 'text-error'
    if (score <= 3) return 'text-warning'
    return 'text-success'
  }
  
  const getStrengthText = (score: number) => {
    if (score <= 2) return 'Fraca'
    if (score <= 3) return 'Média'
    return 'Forte'
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-card p-8"
    >
      {/* Header */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring' }}
          className="w-16 h-16 bg-gradient-to-r from-primary to-primary-dark rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <span className="text-2xl font-bold text-white">⚔️</span>
        </motion.div>
        <h1 className="text-3xl font-bold text-text-primary mb-2">
          Junte-se à Arena
        </h1>
        <p className="text-text-secondary">
          Crie sua conta e comece sua jornada
        </p>
      </div>
      
      {/* Google Login Button */}
      <Button
        type="button"
        variant="outline"
        className="w-full mb-6 h-12 text-base"
        onClick={handleGoogleLogin}
        disabled={isLoading}
      >
        <Chrome className="w-5 h-5 mr-3" />
        Continuar com Google
      </Button>
      
      {/* Divider */}
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/20" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-surface text-text-secondary">ou</span>
        </div>
      </div>
      
      {/* Register Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Name Field */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Nome completo
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-secondary" />
            <Input
              {...register('name')}
              type="text"
              placeholder="Seu nome completo"
              className="pl-10"
              error={!!errors.name}
            />
          </div>
          {errors.name && (
            <p className="mt-1 text-sm text-error">{errors.name.message}</p>
          )}
        </div>
        
        {/* Email Field */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-secondary" />
            <Input
              {...register('email')}
              type="email"
              placeholder="seu@email.com"
              className="pl-10"
              error={!!errors.email}
            />
          </div>
          {errors.email && (
            <p className="mt-1 text-sm text-error">{errors.email.message}</p>
          )}
        </div>
        
        {/* Password Field */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Senha
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-secondary" />
            <Input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              className="pl-10 pr-10"
              error={!!errors.password}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-sm text-error">{errors.password.message}</p>
          )}
          
          {/* Password Strength Indicator */}
          {password && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-text-secondary">Força da senha:</span>
                <span className={`text-sm font-medium ${getStrengthColor(passwordStrength.score)}`}>
                  {getStrengthText(passwordStrength.score)}
                </span>
              </div>
              <div className="w-full bg-background/50 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    passwordStrength.score <= 2 ? 'bg-error' :
                    passwordStrength.score <= 3 ? 'bg-warning' : 'bg-success'
                  }`}
                  style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                />
              </div>
              {passwordStrength.feedback.length > 0 && (
                <div className="mt-2 space-y-1">
                  {passwordStrength.feedback.map((feedback, index) => (
                    <div key={index} className="flex items-center text-xs text-text-secondary">
                      <X className="w-3 h-3 mr-1 text-error" />
                      {feedback}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Confirm Password Field */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Confirmar senha
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-secondary" />
            <Input
              {...register('confirmPassword')}
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="••••••••"
              className="pl-10 pr-10"
              error={!!errors.confirmPassword}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="mt-1 text-sm text-error">{errors.confirmPassword.message}</p>
          )}
        </div>
        
        {/* Terms and Conditions */}
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <Checkbox
              {...register('acceptTerms')}
              id="accept-terms"
              className="mt-1"
            />
            <label htmlFor="accept-terms" className="text-sm text-text-secondary leading-relaxed">
              Eu aceito os{' '}
              <a href="/terms" className="text-primary hover:text-primary-dark underline">
                Termos de Uso
              </a>{' '}
              e{' '}
              <a href="/privacy" className="text-primary hover:text-primary-dark underline">
                Política de Privacidade
              </a>
            </label>
          </div>
          {errors.acceptTerms && (
            <p className="text-sm text-error">{errors.acceptTerms.message}</p>
          )}
        </div>
        
        {/* Error Message */}
        {errors.root && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-error/10 border border-error/20 rounded-lg p-3"
          >
            <p className="text-sm text-error">{errors.root.message}</p>
          </motion.div>
        )}
        
        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full h-12 text-base"
          loading={isLoading}
          disabled={isLoading}
        >
          {isLoading ? 'Criando conta...' : 'Criar Conta'}
        </Button>
      </form>
      
      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-text-secondary">
          Já tem uma conta?{' '}
          <button
            onClick={() => onModeChange('login')}
            className="text-primary hover:text-primary-dark font-medium transition-colors"
          >
            Fazer login
          </button>
        </p>
      </div>
    </motion.div>
  )
} 