import { requireRole } from '@/lib/auth';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { 
  Building2, 
  MapPin, 
  Users, 
  HardHat, 
  ShieldCheck, 
  Activity,
  Calendar,
  Settings
} from 'lucide-react';

export default async function CompanyDetailsPage({ params }: { params: { id: string } }) {
  await requireRole(Role.SUPER_ADMIN);
  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: {
      sites: true,
      members: { include: { user: true } },
    }
  });

  if (!company) redirect('/super-admin/dashboard');

  return (
    <div className="min-h-screen p-6 sm:p-10 lg:p-12 bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-8 rounded-3xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/60 dark:border-slate-800 shadow-xl shadow-blue-900/5">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl shadow-lg shadow-blue-500/30 text-white">
              <Building2 className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-300">
                {company.name}
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${company.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {company.status}
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                  {company.slug}
                </span>
              </div>
            </div>
          </div>
          <button className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 shadow-lg transition-all">
            <Settings className="w-4 h-4" /> Edit Company
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-6 rounded-3xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/80 dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-none hover:-translate-y-1 transition-transform">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-500 font-semibold text-sm">Active Plan</span>
              <ShieldCheck className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-white">{company.plan}</div>
          </div>
          <div className="p-6 rounded-3xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/80 dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-none hover:-translate-y-1 transition-transform">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-500 font-semibold text-sm">Total Sites</span>
              <HardHat className="w-5 h-5 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-white">{company.sites.length} <span className="text-sm font-normal text-slate-400">/ {company.siteLimit} limit</span></div>
          </div>
          <div className="p-6 rounded-3xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/80 dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-none hover:-translate-y-1 transition-transform">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-500 font-semibold text-sm">Users</span>
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-white">{company.members.length} <span className="text-sm font-normal text-slate-400">/ {company.userLimit} limit</span></div>
          </div>
          <div className="p-6 rounded-3xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/80 dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-none hover:-translate-y-1 transition-transform">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-500 font-semibold text-sm">Created</span>
              <Calendar className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-white">{new Date(company.createdAt).toLocaleDateString()}</div>
          </div>
        </div>

        {/* Content Tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Sites List */}
          <div className="p-8 rounded-3xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/80 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-none">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800 dark:text-white">
              <HardHat className="w-5 h-5 text-amber-500" /> Construction Sites
            </h2>
            <div className="space-y-4">
              {company.sites.map(site => (
                <div key={site.id} className="p-4 rounded-2xl bg-white/50 border border-slate-100 hover:border-slate-300 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-800">{site.name}</h3>
                      <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" /> {site.location}
                      </p>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded bg-slate-100 text-slate-600">{site.status}</span>
                  </div>
                </div>
              ))}
              {company.sites.length === 0 && (
                <div className="text-center p-8 text-slate-400 font-medium">No sites created yet.</div>
              )}
            </div>
          </div>

          {/* Users List */}
          <div className="p-8 rounded-3xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/80 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-none">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800 dark:text-white">
              <Users className="w-5 h-5 text-blue-500" /> Team Members
            </h2>
            <div className="space-y-4">
              {company.members.map(member => (
                <div key={member.id} className="p-4 rounded-2xl bg-white/50 border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 flex items-center justify-center text-indigo-700 font-bold">
                      {member.user.name?.[0]}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">{member.user.name}</h3>
                      <p className="text-xs text-slate-500">{member.user.email}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
          
        </div>

      </div>
    </div>
  );
}
