'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LoginForm } from '@/components/auth/LoginForm'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { GamePreview } from '@/components/auth/GamePreview'

type AuthMode = 'login' | 'register' | 'forgot'

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-accent flex">
      {/* Left Side - Game Preview */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        <GamePreview />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-background/50" />
      </div>
      
      {/* Right Side - Auth Forms */}
      <div className="flex-1 lg:max-w-md xl:max-w-lg flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {mode === 'login' && <LoginForm onModeChange={setMode} />}
              {mode === 'register' && <RegisterForm onModeChange={setMode} />}
              {mode === 'forgot' && <ForgotPasswordForm onModeChange={setMode} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
} 