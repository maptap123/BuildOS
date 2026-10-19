import { redirect } from 'next/navigation'
import { ownersAccess } from '@/lib/owners/access'
import { loadLiveCrew, loadPortfolio } from '@/lib/owners/data'
import { OwnersPortfolioClient, OwnersNoAccess } from '@/components/owners'

export const metadata = { title: 'Owners View — BuildOS' }
export const dynamic = 'force-dynamic'

export default async function OwnersPage() {
  const access = await ownersAccess()
  if (access === null) redirect('/login')
  if (access === false) return <OwnersNoAccess />

  const [portfolio, crew] = await Promise.all([loadPortfolio(), loadLiveCrew()])
  return <OwnersPortfolioClient portfolio={portfolio} initialCrew={crew} />
}
