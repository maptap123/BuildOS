import { notFound } from 'next/navigation'
import { JobTemplateEditor } from '@/components/templates/JobTemplateEditor'
import { ActivityTemplateEditor, DocumentTemplateEditor } from '@/components/templates/SimpleEditors'

// Permissions are enforced by /api/templates/* (the editors only ever talk to it).
export default async function TemplateEditorPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params
  if (kind === 'job') return <JobTemplateEditor id={id} />
  if (kind === 'activity') return <ActivityTemplateEditor id={id} />
  if (kind === 'document') return <DocumentTemplateEditor id={id} />
  notFound()
}
