'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>

/** Password field with a show/hide toggle — big enough to hit with a thumb on a phone. */
export function PasswordInput(props: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className="w-full border border-border rounded-lg pl-3.5 pr-11 py-2.5 text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent"
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center justify-center w-11 text-gray-400 hover:text-navy-900"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}
