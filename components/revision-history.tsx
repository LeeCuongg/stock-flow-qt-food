'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, History } from 'lucide-react'
import { toast } from 'sonner'

interface Revision {
  id: string
  revision_number: number
  reason: string | null
  old_data: Record<string, unknown>
  new_data: Record<string, unknown>
  changed_by: string | null
  changed_at: string
}

interface RevisionHistoryProps {
  documentType: 'STOCK_IN' | 'SALE'
  documentId: string
}

export function RevisionHistory({ documentType, documentId }: RevisionHistoryProps) {
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('document_revisions')
      .select('*')
      .eq('document_type', documentType)
      .eq('document_id', documentId)
      .order('revision_number', { ascending: false })
    if (error) toast.error('Lỗi tải lịch sử chỉnh sửa')
    else setRevisions(data || [])
    setLoading(false)
  }, [documentType, documentId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-center py-8 text-muted-foreground">Đang tải...</div>

  if (revisions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <History className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">Chưa có lịch sử chỉnh sửa</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {revisions.map((rev) => (
        <Card key={rev.id}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Badge variant="secondary">v{rev.revision_number}</Badge>
                {rev.reason || 'Chỉnh sửa'}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {new Date(rev.changed_at).toLocaleString('vi-VN')}
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0 space-y-2">
            <JsonCollapsible label="Dữ liệu cũ" data={rev.old_data} />
            <JsonCollapsible label="Dữ liệu mới" data={rev.new_data} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function JsonCollapsible({ label, data }: { label: string; data: Record<string, unknown> }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        <ChevronDown className="h-3 w-3 transition-transform [[data-state=open]>&]:rotate-180" />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-60">
          {JSON.stringify(data, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}
