import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { MapPin, CheckCircle2, Clock, Check, AlertCircle, ImageIcon, CreditCard, ChevronRight, FolderX, Sparkles } from 'lucide-react'
import Link from 'next/link'

export default async function ClientPortal() {
  const session = await auth()
  if (session?.user?.role !== 'CLIENT') redirect('/dashboard')

  const clientRecord = await prisma.client.findFirst({
    where: { email: session?.user?.email }
  })

  const site = await prisma.site.findFirst({
    where: { companyId: clientRecord?.companyId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: {
      company: true,
      photos: {
        where: { approvedForClient: true },
        orderBy: { createdAt: 'desc' },
        take: 3
      },
      tasks: {
        orderBy: { createdAt: 'desc' },
        take: 5
      }
    }
  })

  // If no site assigned, show empty state
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

  const budget = Number(site.budget) || 0
  const spent = Number(site.spent) || 0
  const progress = site.progress || 0

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 pb-24 min-h-screen bg-gray-50">
      {/* Hero section */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-[#ea580c] text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 rounded-full bg-white/5 blur-3xl pointer-events-none"></div>
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
                  Day {Math.max(0, Math.floor((new Date().getTime() - new Date(site.startDate || new Date()).getTime()) / (1000 * 3600 * 24)))}
                </div>
                <div className="text-xs text-slate-400 font-medium">of project</div>
              </div>
              <div className="bg-white/5 p-3 rounded-2xl backdrop-blur-sm border border-white/5">
                <div className="text-lg md:text-xl font-bold text-amber-300 truncate">
                  {site.currentStage || 'Planning phase'}
                </div>
                <div className="text-xs text-slate-400 font-medium">Current phase</div>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 pt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="capitalize">{site.status.replace('_', ' ')} · updated today</span>
            </div>
          </div>

          <div className="flex justify-center md:justify-end">
            <div className="relative w-36 h-36 md:w-44 md:h-44 flex items-center justify-center rounded-full bg-gradient-to-tr from-amber-500/20 to-[#e85b0d]500/20 p-2 border border-white/10 shadow-inner">
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
              <p className="text-xs text-gray-500">Track project progress</p>
            </div>
            
            <div className="space-y-6 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-gray-100">
              {site.tasks.length === 0 ? (
                <div className="text-center text-gray-500 py-6 text-sm">No construction milestones tracked yet.</div>
              ) : (
                site.tasks.map(task => (
                  <div key={task.id} className="relative flex items-start gap-4 pl-1">
                    {task.status === 'COMPLETED' ? (
                      <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center shadow-sm relative z-10 flex-shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    ) : task.status === 'IN_PROGRESS' ? (
                      <div className="w-6 h-6 rounded-full bg-amber-500 border-4 border-amber-100 shadow-sm relative z-10 flex-shrink-0 mt-0.5 animate-pulse"></div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white shadow-sm relative z-10 flex-shrink-0 mt-0.5"></div>
                    )}
                    <div className={`flex-1 p-4 rounded-2xl border ${task.status === 'COMPLETED' ? 'bg-gray-50 border-gray-100' : task.status === 'IN_PROGRESS' ? 'bg-amber-50/60 border-amber-200/60 shadow-sm' : 'bg-white border-gray-100'}`}>
                      <div className="flex justify-between items-center flex-wrap gap-2 mb-1">
                        <span className="text-sm font-bold text-gray-900">{task.name}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${task.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : task.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-400' : 'bg-gray-100 text-gray-600'}`}>
                          {task.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className={`text-xs ${task.status === 'COMPLETED' ? 'text-gray-500' : task.status === 'IN_PROGRESS' ? 'text-amber-700/80 font-medium' : 'text-gray-400'}`}>
                        {task.description || (task.status === 'COMPLETED' ? 'Completed successfully' : task.status === 'IN_PROGRESS' ? 'Currently active phase' : 'Upcoming phase')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Approved Photos */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Latest approved photos</h2>
                <p className="text-xs text-gray-500">Shared by your site team</p>
              </div>
              <Link href="#" className="text-xs font-bold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1">
                <span>View all</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            
            <div>
              {site.photos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {site.photos.map(p => (
                    <div key={p.id} className="group rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50 flex flex-col">
                      <div 
                        className="h-40 w-full bg-cover bg-center relative group-hover:scale-105 transition-transform duration-300" 
                        style={{ backgroundImage: `url(${p.secureUrl})` }}
                      >
                        <div className="absolute top-2.5 left-2.5 bg-black/60 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1">
                          <Check className="w-3 h-3 text-green-400 stroke-[3]" />
                          <span>Approved</span>
                        </div>
                      </div>
                      <div className="p-3 bg-white flex-1 flex flex-col justify-between">
                        <div className="text-xs font-bold text-gray-800 line-clamp-1">{p.caption || 'Site update'}</div>
                        <div className="text-[10px] text-gray-400 mt-1">{new Date(p.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 flex flex-col items-center justify-center gap-2">
                  <ImageIcon className="w-8 h-8 text-gray-400" />
                  <span className="text-xs text-gray-500 font-medium">No approved photos available yet.</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="space-y-6">
          {/* Payment Summary */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Payment summary</h2>
            </div>
            
            <div className="space-y-5">
              <div>
                <div className="text-3xl font-black text-gray-900">₹{(spent / 100000).toFixed(2)} L</div>
                <div className="text-xs text-gray-500 font-medium mt-1">Paid of ₹{(budget / 100000).toFixed(2)} L contract</div>
              </div>

              <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden p-0.5">
                <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min((spent / (budget || 1)) * 100, 100)}%` }}></div>
              </div>

              <div className="space-y-2 pt-2 text-xs divide-y divide-gray-100">
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-500 font-medium">Contract value</span>
                  <span className="font-bold text-gray-900">₹{(budget / 100000).toFixed(2)} L</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-500 font-medium">Paid to date</span>
                  <span className="font-bold text-emerald-600">₹{(spent / 100000).toFixed(2)} L</span>
                </div>
              </div>
              
              <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-center space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Next payment due</div>
                <div className="text-2xl font-black text-amber-950">₹0</div>
                <div className="text-xs text-amber-700/80">No upcoming dues</div>
              </div>

              <button className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-black text-white font-bold rounded-xl text-sm shadow-md transition-colors flex items-center justify-center gap-2">
                <CreditCard className="w-4 h-4" />
                <span>Pay now</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
