import { redirect } from 'next/navigation'
import MobileTabbar from '@/components/mobile/MobileTabbar'
import MobileHeader from '@/components/mobile/MobileHeader'
import { ChecklistPhotoNag } from '@/components/mobile/ChecklistPhotoNag'
import { resolveTenantPrincipal } from '@/lib/pages/tenant-page-access'

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  // Live tenant principal, never the JWT claims: a revoked, deactivated or suspended member
  // goes to /login, SUPER_ADMIN and CLIENT to their own homes. The layout renders in
  // parallel with its pages, so every page below still runs its own gate.
  const principal = await resolveTenantPrincipal()
  if (principal.status === 'denied') redirect(principal.redirectTo)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between max-w-[440px] mx-auto relative shadow-2xl overflow-x-hidden border-x border-slate-200/60 font-sans">
      <MobileHeader />
      <main className="flex-1 pb-28">
        {children}
        <ChecklistPhotoNag />
      </main>
      <MobileTabbar />
    </div>
  )
}
