'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ClientSearchCombobox } from '@/components/mf/client-search-combobox'
import { BusinessPreviewDialog } from '@/components/mf/business-preview-dialog'
import { toast } from 'sonner'

interface MFProduct {
  id: string
  name: string
  investmentType: string
}

interface Employee {
  id: string
  name: string
}

export default function RecordBusinessPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [products, setProducts] = useState<MFProduct[]>([])
  const [equityEmployees, setEquityEmployees] = useState<Employee[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Form state
  const [clientCode, setClientCode] = useState('')
  const [clientName, setClientName] = useState('')
  const [referredById, setReferredById] = useState<string>('')
  const [productName, setProductName] = useState('')
  const [subProduct, setSubProduct] = useState('')
  const [investmentType, setInvestmentType] = useState('')
  const [sipAmount, setSipAmount] = useState('')
  const [yearlyContribution, setYearlyContribution] = useState('')
  const [commissionPercent, setCommissionPercent] = useState('')

  // Load products and equity employees
  useEffect(() => {
    fetch('/api/mf-products')
      .then((r) => r.json())
      .then((d) => { if (d.success) setProducts(d.data) })

    fetch('/api/employees?department=EQUITY&isActive=true')
      .then((r) => r.json())
      .then((d) => { if (d.success) setEquityEmployees(d.data) })
  }, [])

  // When product changes, auto-set investment type
  const selectedProduct = products.find((p) => p.name === productName)
  useEffect(() => {
    if (selectedProduct) {
      if (selectedProduct.investmentType === 'Lump Sum') {
        setInvestmentType('Lump Sum')
      } else if (selectedProduct.investmentType === 'SIP') {
        setInvestmentType('SIP')
      } else {
        // "Lump Sum / SIP" - let user choose
        setInvestmentType('')
      }
    }
  }, [productName, selectedProduct])

  // Auto-calculate yearly from SIP
  useEffect(() => {
    if (investmentType === 'SIP' && sipAmount) {
      const monthly = parseFloat(sipAmount)
      if (!isNaN(monthly) && monthly > 0) {
        setYearlyContribution(String(monthly * 12))
      }
    }
  }, [sipAmount, investmentType])

  const commissionAmount = (() => {
    const yc = parseFloat(yearlyContribution) || 0
    const cp = parseFloat(commissionPercent) || 0
    return (yc * cp) / 100
  })()

  const canPreview = clientCode && clientName && productName && investmentType && yearlyContribution && commissionPercent

  const handlePreview = () => {
    if (!canPreview) return
    setPreviewOpen(true)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/mf-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientCode,
          clientName,
          referredById: referredById && referredById !== 'none' ? referredById : null,
          productName,
          subProduct: subProduct || null,
          investmentType,
          sipAmount: sipAmount ? parseFloat(sipAmount) : null,
          yearlyContribution: parseFloat(yearlyContribution),
          commissionPercent: parseFloat(commissionPercent),
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Business recorded successfully')
        router.push('/mf/business/log')
      } else {
        toast.error(data.error || 'Failed to record business')
      }
    } catch {
      toast.error('Failed to record business')
    } finally {
      setSubmitting(false)
      setPreviewOpen(false)
    }
  }

  const previewData = canPreview ? {
    clientCode,
    clientName,
    employeeName: session?.user?.name || '',
    referredByName: referredById && referredById !== 'none' ? equityEmployees.find((e) => e.id === referredById)?.name || null : null,
    productName,
    subProduct: subProduct || null,
    investmentType,
    sipAmount: sipAmount ? parseFloat(sipAmount) : null,
    yearlyContribution: parseFloat(yearlyContribution),
    commissionPercent: parseFloat(commissionPercent),
    commissionAmount,
  } : null

  // Determine if investment type is fixed or user-selectable
  const investmentTypeFixed = selectedProduct && (selectedProduct.investmentType === 'Lump Sum' || selectedProduct.investmentType === 'SIP')

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Record Business</h1>
        <p className="text-sm text-gray-500 mt-0.5">Record a new mutual fund business entry</p>
      </div>

      <Card className="max-w-2xl">
        <CardContent className="p-6 space-y-5">
          {/* Client Code */}
          <div className="space-y-1.5">
            <Label>Client Code *</Label>
            <ClientSearchCombobox
              value={clientCode}
              onSelect={(client) => {
                if (client) {
                  setClientCode(client.clientCode)
                  setClientName(client.name)
                } else {
                  setClientCode('')
                  setClientName('')
                }
              }}
            />
          </div>

          {/* Client Name (auto-filled) */}
          <div className="space-y-1.5">
            <Label>Client Name</Label>
            <Input value={clientName} readOnly className="bg-gray-50" />
          </div>

          {/* MF Employee Name (read-only from session) */}
          <div className="space-y-1.5">
            <Label>MF Employee Name</Label>
            <Input value={session?.user?.name || ''} readOnly className="bg-gray-50" />
          </div>

          {/* Referred By */}
          <div className="space-y-1.5">
            <Label>Referred By</Label>
            <Select value={referredById} onValueChange={setReferredById}>
              <SelectTrigger>
                <SelectValue placeholder="None (Own Business)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Own Business)</SelectItem>
                {equityEmployees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Product */}
          <div className="space-y-1.5">
            <Label>Product *</Label>
            <Select value={productName} onValueChange={setProductName}>
              <SelectTrigger>
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sub-Product */}
          <div className="space-y-1.5">
            <Label>Sub-Product</Label>
            <Input
              value={subProduct}
              onChange={(e) => setSubProduct(e.target.value)}
              placeholder="Optional sub-product name"
            />
          </div>

          {/* Investment Type */}
          <div className="space-y-1.5">
            <Label>Investment Type *</Label>
            {investmentTypeFixed ? (
              <Input value={investmentType} readOnly className="bg-gray-50" />
            ) : (
              <Select value={investmentType} onValueChange={setInvestmentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Lump Sum">Lump Sum</SelectItem>
                  <SelectItem value="SIP">SIP</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* SIP Amount (conditional) */}
          {investmentType === 'SIP' && (
            <div className="space-y-1.5">
              <Label>SIP Amount (Monthly) *</Label>
              <Input
                type="number"
                value={sipAmount}
                onChange={(e) => setSipAmount(e.target.value)}
                placeholder="Monthly SIP amount"
                min={0}
              />
            </div>
          )}

          {/* Yearly Contribution */}
          <div className="space-y-1.5">
            <Label>Yearly Contribution *</Label>
            <Input
              type="number"
              value={yearlyContribution}
              onChange={(e) => setYearlyContribution(e.target.value)}
              placeholder="Annual contribution amount"
              min={0}
              readOnly={investmentType === 'SIP'}
              className={investmentType === 'SIP' ? 'bg-gray-50' : ''}
            />
          </div>

          {/* Commission % */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Commission % *</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={commissionPercent}
                  onChange={(e) => setCommissionPercent(e.target.value)}
                  placeholder="0"
                  min={0}
                  max={100}
                  step={0.01}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Commission Amount</Label>
              <Input
                value={commissionAmount > 0 ? commissionAmount.toFixed(2) : ''}
                readOnly
                className="bg-gray-50"
                placeholder="Auto-calculated"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2">
            <Button onClick={handlePreview} disabled={!canPreview} className="w-full">
              Record Business
            </Button>
          </div>
        </CardContent>
      </Card>

      <BusinessPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        data={previewData}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    </div>
  )
}
