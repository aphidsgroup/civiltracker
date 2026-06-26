import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import AttendanceMarker from '@/components/mobile/AttendanceMarker'
import { Users } from 'lucide-react'

export default async function AttendancePage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const labour = await prisma.labour.findMany({
    where: { companyId, isActive: true },
    include: {
      attendance: { where: { date: today }, take: 1 },
      site: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
    take: 50,
  })

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto bg-gray-50 min-h-screen">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
          <Users className="w-5 h-5" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">Attendance</h1>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border border-gray-200 bg-white text-gray-600 ml-auto shadow-sm">
          {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
        </span>
      </div>
      <div className="mb-4 text-xs text-gray-500 font-medium pl-1">
        {labour.length} workers on roster
      </div>
      <AttendanceMarker labour={labour.map(l => ({ id: l.id, name: l.name, trade: l.trade, siteName: l.site.name, attendance: l.attendance[0] ?? null }))} />
    </div>
  )
}
