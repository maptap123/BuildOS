import { notFound, redirect } from 'next/navigation'
import { ownersAccess } from '@/lib/owners/access'
import { loadJobDetail, loadLiveCrew } from '@/lib/owners/data'
import { OwnersJobDetailClient, OwnersNoAccess } from '@/components/owners'

export const metadata = { title: 'Owners View — BuildOS' }
export const dynamic = 'force-dynamic'

export default async function OwnersJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const access = await ownersAccess()
  if (access === null) redirect('/login')
  if (access === false) return <OwnersNoAccess />

  const { jobId } = await params
  const [detail, crew] = await Promise.all([loadJobDetail(jobId), loadLiveCrew()])
  if (!detail) notFound()
  return <OwnersJobDetailClient detail={detail} initialCrew={crew.filter(s => s.jobId === jobId)} />
}
