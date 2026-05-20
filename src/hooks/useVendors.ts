'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Vendor, VendorType } from '@/types'

export function useVendors(vendorType?: VendorType) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = vendorType ? `?vendor_type=${vendorType}` : ''
      const res = await fetch(`/api/vendors${params}`)
      if (!res.ok) throw new Error('Failed to load vendors')
      setVendors(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [vendorType])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { vendors, loading, error, refresh }
}
