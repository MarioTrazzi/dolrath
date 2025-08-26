'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { forgotPasswordSchema, type ForgotPasswordFormData } from '@/lib/validations/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface ForgotPasswordFormProps {
  onModeChange: (mode: 'login') => void
}

export function ForgotPasswordForm({ onModeChange }: ForgotPasswordFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema)
  })
  
  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true)
    
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email,
        }),
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        setError('root', { message: result.error || 'Erro ao enviar email de recuperação' })
      } else {
        setIsSuccess(true)
      }
    } catch (error) {
      setError('root', { message: 'Erro inesperado. Tente novamente.' })
    } finally {
      setIsLoading(false)
    }
  }
  
  if (isSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-card p-8 text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring' }}
          className="w-16 h-16 bg-success/20 border border-success/30 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <CheckCircle className="w-8 h-8 text-success" />
        </motion.div>
        
        <h1 className="text-2xl font-bold text-text-primary mb-4">
          Email enviado!
        </h1>
        
        <p className="text-text-secondary mb-6 leading-relaxed">
          Enviamos um link de recuperação para seu email. 
          Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
        </p>
        
        <div className="space-y-4">
          <Button
            onClick={() => onModeChange('login')}
            variant="outline"
            className="w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao login
          </Button>
          
          <p className="text-sm text-text-secondary">
            Não recebeu o email?{' '}
            <button
              onClick={() => setIsSuccess(false)}
              className="text-primary hover:text-primary-dark font-medium transition-colors"
            >
              Tentar novamente
            </button>
          </p>
        </div>
      </motion.div>
    )
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
          <span className="text-2xl font-bold text-white">🔐</span>
        </motion.div>
        <h1 className="text-3xl font-bold text-text-primary mb-2">
          Recuperar senha
        </h1>
        <p className="text-text-secondary">
          Digite seu email para receber um link de recuperação
        </p>
      </div>
      
      {/* Forgot Password Form */}
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
          {isLoading ? 'Enviando...' : 'Enviar link de recuperação'}
        </Button>
      </form>
      
      {/* Footer */}
      <div className="mt-8 text-center">
        <Button
          onClick={() => onModeChange('login')}
          variant="ghost"
          className="w-full"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar ao login
        </Button>
      </div>
    </motion.div>
  )
} 