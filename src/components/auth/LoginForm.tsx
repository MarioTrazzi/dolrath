'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { signIn } from 'next-auth/react'
import { Eye, EyeOff, Mail, Lock, Chrome } from 'lucide-react'
import { motion } from 'framer-motion'
import { loginSchema, type LoginFormData } from '@/lib/validations/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Checkbox } from '@/components/ui/Checkbox'

interface LoginFormProps {
  onModeChange: (mode: 'register' | 'forgot') => void
}

export function LoginForm({ onModeChange }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema)
  })
  
  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false
      })
      
      if (result?.error) {
        setError('root', { message: 'Credenciais inválidas' })
      } else {
        window.location.href = '/dashboard'
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
          Bem-vindo ao Dolrath
        </h1>
        <p className="text-text-secondary">
          Entre na arena e prove seu valor
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
      
      {/* Login Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
        </div>
        
        {/* Remember Me & Forgot Password */}
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Checkbox
              {...register('rememberMe')}
              id="remember-me"
              className="mr-2"
            />
            <label htmlFor="remember-me" className="text-sm text-text-secondary">
              Lembrar de mim
            </label>
          </div>
          <button
            type="button"
            onClick={() => onModeChange('forgot')}
            className="text-sm text-primary hover:text-primary-dark transition-colors"
          >
            Esqueceu a senha?
          </button>
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
          {isLoading ? 'Entrando...' : 'Entrar na Arena'}
        </Button>
      </form>
      
      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-text-secondary">
          Novo no Dolrath?{' '}
          <button
            onClick={() => onModeChange('register')}
            className="text-primary hover:text-primary-dark font-medium transition-colors"
          >
            Criar conta
          </button>
        </p>
      </div>
    </motion.div>
  )
} 