import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { MapPin, Check, ImageIcon, CreditCard, ChevronRight, FolderX, Sparkles, AlertCircle, Clock } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ClientPortal() {
  const session = await auth()
  if (session?.user?.role !== 'CLIENT') redirect('/dashboard')

  // Find client record by email
  const clientRecord = await prisma.client.findFirst({
    where: { email: session?.user?.email },
    include: { invoices: { orderBy: { createdAt: 'desc' } } }
  })

  // Find the client's assigned site — prefer siteId if set, else fall back to companyId
  const site = await prisma.site.findFirst({
    where: clientRecord?.siteId
      ? { id: clientRecord.siteId, deletedAt: null }
      : { companyId: clientRecord?.companyId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: {
      company: true,
      photos: {
        where: { approvedForClient: true },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { task: true }
      }
    }
  })

  if (!site) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center mt-12">
        <div className="flex items-center justify-center w-16 h-16 mb-4 bg-gray-100 text-gray-500 rounded-2xl border border-gray-200 shadow-sm">
          <FolderX className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">No projects found</h2>
        <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
          You haven&apos;t been assigned to any active projects yet. Please contact your builder.
        </p>
      </div>
    )
  }

  // Calculate progress from checklist tasks
  const allTasks = await prisma.projectChecklistTask.findMany({
    where: { category: { stage: { checklist: { siteId: site.id } } } },
    orderBy: { updatedAt: 'desc' }
  })
  const totalTasksCount = allTasks.length
  const completedTasksCount = allTasks.filter(t => t.status === 'COMPLETED').length
  const progress = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : (site.progress || 0)
  const recentTasks = allTasks.slice(0, 5)

  // Fetch checklist with stages for dynamic phase calculation
  const checklist = await prisma.projectChecklist.findFirst({
    where: { siteId: site.id },
    include: {
      stages: {
        orderBy: { order: 'asc' },
        include: {
          categories: {
            include: {
              tasks: true
            }
          }
        }
      }
    }
  })

  // Calculate current phase
  let currentPhase = site.currentStage || 'Planning'
  if (checklist && checklist.stages.length > 0) {
    const activeStage = checklist.stages.find(s => 
      s.categories.some(c => c.tasks.some(t => t.status !== 'COMPLETED'))
    )
    if (activeStage) {
      currentPhase = activeStage.name
    } else {
      currentPhase = 'Completed'
    }
  }

  const budget = Number(site.budget) || 0
  const spent = Number(site.spent) || 0


  // Live payment data from invoices
  const invoices = clientRecord?.invoices ?? []
  const totalPaid = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + Number(i.amount), 0)
  const nextDueInvoice = invoices.find(i => i.status === 'DUE' || i.status === 'OVERDUE')
  const totalDue = invoices.filter(i => i.status !== 'PAID').reduce((s, i) => s + Number(i.amount), 0)

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 pb-24 min-h-screen bg-gray-50">
      {/* Hero section */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-[#ea580c] text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 rounded-full bg-white/5 blur-3xl pointer-events-none" />
        <form action={async () => {
          'use server'
          const { signOut } = await import('@/lib/auth')
          await signOut({ redirectTo: '/login' })
        }} className="absolute top-6 right-6 z-20">
          <button type="submit" className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md transition-all border border-white/10">
            Logout
          </button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center relative z-10">
          <div className="md:col-span-2 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold backdrop-blur-md border border-white/10">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Your project</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-white">{site.name}</h1>
            <div className="flex items-center gap-2 text-slate-300 text-xs md:text-sm">
              <MapPin className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>{site.location} · by <strong className="text-white font-semibold">{site.company?.name || 'Your Builder'}</strong></span>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/10 max-w-md">
              <div className="bg-white/5 p-3 rounded-2xl backdrop-blur-sm border border-white/5">
                <div className="text-lg md:text-xl font-bold text-white">
                  Day {Math.max(0, Math.floor((Date.now() - new Date(site.startDate || Date.now()).getTime()) / (1000 * 3600 * 24)))}
                </div>
                <div className="text-xs text-slate-400 font-medium">of project</div>
              </div>
              <div className="bg-white/5 p-3 rounded-2xl backdrop-blur-sm border border-white/5">
                {/* Current phase from live site.currentStage */}
                <div className="text-lg md:text-xl font-bold text-amber-300 truncate">
                  {currentPhase}
                </div>
                <div className="text-xs text-slate-400 font-medium">Current phase</div>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 pt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="capitalize">{site.status.replace(/_/g, ' ')}</span>
            </div>
          </div>

          <div className="flex justify-center md:justify-end">
            <div className="relative w-36 h-36 md:w-44 md:h-44 flex items-center justify-center rounded-full p-2 border border-white/10 shadow-inner bg-white/5">
              <div className="w-full h-full rounded-full bg-slate-900/90 flex flex-col items-center justify-center text-center backdrop-blur-md border border-white/5">
                <span className="text-3xl md:text-4xl font-black text-white">{progress}%</span>
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider mt-0.5">Complete</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Construction Milestones */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900">Construction milestones</h2>
              <p className="text-xs text-gray-500">{completedTasksCount} of {totalTasksCount} tasks completed</p>
            </div>
            <div className="space-y-4 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-gray-100">
              {recentTasks.length === 0 ? (
                <div className="text-center text-gray-500 py-6 text-sm">No construction milestones tracked yet.</div>
              ) : (
                recentTasks.map(task => (
                  <div key={task.id} className="relative flex items-start gap-4 pl-1">
                    {task.status === 'COMPLETED' ? (
                      <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center shadow-sm relative z-10 flex-shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    ) : task.status === 'IN_PROGRESS' ? (
                      <div className="w-6 h-6 rounded-full bg-amber-500 border-4 border-amber-100 shadow-sm relative z-10 flex-shrink-0 mt-0.5 animate-pulse" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white shadow-sm relative z-10 flex-shrink-0 mt-0.5" />
                    )}
                    <div className={`flex-1 p-4 rounded-2xl border ${task.status === 'COMPLETED' ? 'bg-gray-50 border-gray-100' : task.status === 'IN_PROGRESS' ? 'bg-amber-50/60 border-amber-200/60 shadow-sm' : 'bg-white border-gray-100'}`}>
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <span className="text-sm font-bold text-gray-900">{task.name}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${task.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : task.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                          {task.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Approved Site Photos */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Latest approved photos</h2>
                <p className="text-xs text-gray-500">Shared by your site team · {site.photos.length} photo{site.photos.length !== 1 ? 's' : ''}</p>
              </div>
              <Link href="/client-portal/photos" className="text-xs font-bold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1">
                <span>View all</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            {site.photos.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {site.photos.slice(0, 3).map(p => (
                  <div key={p.id} className="group rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50 flex flex-col">
                    <div
                      className="h-40 w-full bg-cover bg-center relative"
                      style={{ backgroundImage: `url(${p.secureUrl})` }}
                    >
                      <div className="absolute top-2.5 left-2.5 bg-black/60 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-400 stroke-[3]" />
                        <span>Approved</span>
                      </div>
                    </div>
                    <div className="p-3 bg-white flex-1">
                      {p.task ? (
                        <>
                          <div className="text-xs font-bold text-gray-800 line-clamp-1">{p.task.name}</div>
                          <div className="text-[10px] text-gray-400 mt-1">{new Date(p.createdAt).toLocaleDateString()} · Task completed</div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs font-bold text-gray-800 line-clamp-1">{p.caption || p.category || 'Site update'}</div>
                          <div className="text-[10px] text-gray-400 mt-1">{new Date(p.createdAt).toLocaleDateString()}</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 flex flex-col items-center justify-center gap-2">
                <ImageIcon className="w-8 h-8 text-gray-400" />
                <span className="text-xs text-gray-500 font-medium">No approved photos yet. Your site team will share updates soon.</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment Summary */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-5">
            <h2 className="text-lg font-bold text-gray-900">Payment summary</h2>

            <div>
              <div className="text-3xl font-black text-gray-900">₹{(totalPaid / 100000).toFixed(2)} L</div>
              <div className="text-xs text-gray-500 font-medium mt-1">Paid of ₹{(budget / 100000).toFixed(2)} L contract</div>
            </div>

            <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden p-0.5">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min((totalPaid / (budget || 1)) * 100, 100)}%` }}
              />
            </div>

            <div className="space-y-0 text-xs divide-y divide-gray-100">
              <div className="flex justify-between items-center py-2.5">
                <span className="text-gray-500 font-medium">Contract value</span>
                <span className="font-bold text-gray-900">₹{(budget / 100000).toFixed(2)} L</span>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <span className="text-gray-500 font-medium">Total paid</span>
                <span className="font-bold text-emerald-600">₹{(totalPaid / 100000).toFixed(2)} L</span>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <span className="text-gray-500 font-medium">Total outstanding</span>
                <span className={`font-bold ${totalDue > 0 ? 'text-rose-600' : 'text-gray-900'}`}>₹{(totalDue / 100000).toFixed(2)} L</span>
              </div>
            </div>

            {/* Next due invoice from admin */}
            {nextDueInvoice ? (
              <div className={`rounded-2xl p-4 text-center space-y-1.5 ${nextDueInvoice.status === 'OVERDUE' ? 'bg-rose-50 border border-rose-200' : 'bg-amber-50 border border-amber-200/80'}`}>
                <div className="flex items-center justify-center gap-1.5">
                  {nextDueInvoice.status === 'OVERDUE'
                    ? <AlertCircle className="w-4 h-4 text-rose-600" />
                    : <Clock className="w-4 h-4 text-amber-600" />
                  }
                  <div className={`text-[11px] font-bold uppercase tracking-wider ${nextDueInvoice.status === 'OVERDUE' ? 'text-rose-800' : 'text-amber-800'}`}>
                    {nextDueInvoice.status === 'OVERDUE' ? 'Payment Overdue!' : 'Next Payment Due'}
                  </div>
                </div>
                <div className={`text-2xl font-black ${nextDueInvoice.status === 'OVERDUE' ? 'text-rose-950' : 'text-amber-950'}`}>
                  ₹{Number(nextDueInvoice.amount).toLocaleString('en-IN')}
                </div>
                {nextDueInvoice.milestone && (
                  <div className={`text-xs font-semibold ${nextDueInvoice.status === 'OVERDUE' ? 'text-rose-700' : 'text-amber-700'}`}>
                    {nextDueInvoice.milestone}
                  </div>
                )}
                {nextDueInvoice.dueDate && (
                  <div className="text-[10px] text-gray-500">Due: {new Date(nextDueInvoice.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                )}
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-green-800">No Dues Pending</div>
                <div className="text-xs text-green-700">All payments are up to date</div>
              </div>
            )}

            <Link
              href="/client-portal/payments"
              className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm shadow-md transition-colors flex items-center justify-center gap-2 no-underline"
            >
              <CreditCard className="w-4 h-4" />
              <span>View all invoices</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
