import ClientHeader from '@/components/client/ClientHeader'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ct client-layout min-h-screen bg-slate-50 dark:bg-slate-950">
      <ClientHeader />
      {children}
    </div>
  )
}