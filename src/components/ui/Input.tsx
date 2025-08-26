import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full h-12 px-4 bg-background/50 border rounded-lg text-text-primary placeholder:text-text-secondary transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
          error ? "border-error focus:ring-error/50 focus:border-error" : "border-white/20 hover:border-white/30",
          className
        )}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input' 