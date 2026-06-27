'use client'

import { motion } from 'framer-motion'
import { LoginForm } from '@/components/auth/LoginForm'
import { GamePreview } from '@/components/auth/GamePreview'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-accent flex">
      {/* Left Side - Game Preview */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        <GamePreview />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-background/50" />
      </div>

      {/* Right Side - Auth */}
      <div className="flex-1 lg:max-w-md xl:max-w-lg flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <LoginForm />
          </motion.div>
        </div>
      </div>
    </div>
  )
}
