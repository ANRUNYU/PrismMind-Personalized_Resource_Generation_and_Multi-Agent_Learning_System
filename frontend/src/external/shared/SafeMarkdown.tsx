import { useMemo } from 'react'

import { renderMarkdown } from '@/utils/markdown'

export default function SafeMarkdown({ content, className = '' }: { content: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(content || ''), [content])
  return <div className={`markdown-body ${className}`.trim()} dangerouslySetInnerHTML={{ __html: html }} />
}
