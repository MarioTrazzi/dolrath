'use client'

import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

export default function AuthErrorPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const getErrorMessage = (error: string | null) => {
    switch (error) {
      case 'Configuration':
        return 'Erro de configuração do servidor'
      case 'AccessDenied':
        return 'Acesso negado'
      case 'Verification':
        return 'Link de verificação expirado ou inválido'
      case 'Default':
      default:
        return 'Ocorreu um erro inesperado'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-accent flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-card p-8 max-w-md w-full text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring' }}
          className="w-16 h-16 bg-error/20 border border-error/30 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <AlertTriangle className="w-8 h-8 text-error" />
        </motion.div>
        
        <h1 className="text-2xl font-bold text-text-primary mb-4">
          Erro de Autenticação
        </h1>
        
        <p className="text-text-secondary mb-6">
          {getErrorMessage(error)}
        </p>
        
        <div className="space-y-4">
          <Link href="/auth/login">
            <Button className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Login
            </Button>
          </Link>
          
          <Link href="/">
            <Button variant="outline" className="w-full">
              Ir para Home
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  )
} 