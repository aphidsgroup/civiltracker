import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { FileText, FolderOpen } from 'lucide-react'

const CAT_COLOR: Record<string, string> = {
  CONTRACT: 'bg-[#fff7ed] text-[#e85b0d] border-blue-200',
  DRAWING: 'bg-purple-50 text-purple-700 border-purple-200',
  PERMIT: 'bg-amber-50 text-amber-700 border-amber-200',
  REPORT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  INVOICE: 'bg-rose-50 text-rose-700 border-rose-200',
  OTHER: 'bg-gray-100 text-gray-600 border-gray-200',
}

export default async function DocumentsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const docs = await prisma.document.findMany({
    where: { companyId },
    include: { site: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const byCategory = docs.reduce((acc, d) => {
    acc[d.category] = (acc[d.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Documents</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{docs.length}</div>
          </div>
          {Object.entries(byCategory).map(([cat, count]) => (
            <div key={cat} className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{cat}</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{count}</div>
            </div>
          ))}
        </div>

        {docs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center flex flex-col items-center justify-center">
            <div className="p-4 bg-[#fff7ed] text-[#fc6e20] rounded-full mb-4">
              <FolderOpen className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">No documents yet</h3>
            <p className="text-sm text-gray-500 max-w-sm">Upload contracts, drawings, permits, and reports to keep everything in one place.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/75">
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Site</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Version</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {docs.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#fff7ed] text-[#fc6e20] flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="font-medium text-sm text-gray-900">{d.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">{d.site?.name ?? 'Company-wide'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${CAT_COLOR[d.category] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {d.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">v{d.version ?? '1'}</td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {new Date(d.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
