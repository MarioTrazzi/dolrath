import { forwardRef } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, ...props }, ref) => {
    return (
      <label className="flex items-center space-x-2 cursor-pointer">
        <div className="relative">
          <input
            ref={ref}
            type="checkbox"
            className="sr-only"
            {...props}
          />
          <div
            className={cn(
              "w-5 h-5 border-2 rounded transition-all duration-200 flex items-center justify-center",
              "border-white/30 hover:border-primary",
              props.checked ? "bg-primary border-primary" : "bg-transparent",
              className
            )}
          >
            {props.checked && (
              <Check className="w-3 h-3 text-white" />
            )}
          </div>
        </div>
        {label && (
          <span className="text-sm text-text-secondary">{label}</span>
        )}
      </label>
    )
  }
)

Checkbox.displayName = 'Checkbox' 