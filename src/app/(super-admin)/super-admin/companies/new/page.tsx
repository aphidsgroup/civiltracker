import { requireRole } from '@/lib/auth/permissions';
import { Role } from '@prisma/client';
import { createCompany } from '@/actions/companies';
import { 
  Building2, 
  Mail, 
  Phone, 
  MapPin, 
  FileText, 
  Crown, 
  Users, 
  HardHat, 
  Database, 
  User, 
  Lock, 
  CheckCircle2, 
  ShieldCheck 
} from 'lucide-react';

export default async function NewCompanyPage() {
  await requireRole(Role.SUPER_ADMIN);

  return (
    <div className="min-h-screen p-6 sm:p-10 lg:p-12 bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-8 rounded-3xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/60 dark:border-slate-800 shadow-xl shadow-blue-900/5">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl shadow-lg shadow-blue-500/30 text-white">
              <Building2 className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-300">
                Register New Company
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">
                Set up a new organization, define limits, and configure modules.
              </p>
            </div>
          </div>
        </div>

        {/* Main Form */}
        <form action={createCompany} className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Company Details Card */}
            <div className="p-8 rounded-3xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/80 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-none hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <Building2 className="w-6 h-6 text-blue-500" />
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Company Details</h2>
              </div>
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    Company Name
                  </label>
                  <input type="text" name="name" required className="w-full px-4 py-3 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400" placeholder="Acme Builders Inc." />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400" /> Email
                    </label>
                    <input type="email" name="email" required className="w-full px-4 py-3 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="contact@acme.com" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400" /> Phone
                    </label>
                    <input type="tel" name="phone" className="w-full px-4 py-3 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="+1 (555) 000-0000" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" /> GST / Tax ID
                  </label>
                  <input type="text" name="gst" className="w-full px-4 py-3 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="GSTIN..." />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400" /> Address
                  </label>
                  <textarea name="address" rows={3} className="w-full px-4 py-3 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none" placeholder="123 Construction Avenue..."></textarea>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {/* Owner Details Card */}
              <div className="p-8 rounded-3xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/80 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-none hover:shadow-2xl transition-all duration-300">
                <div className="flex items-center gap-3 mb-6">
                  <ShieldCheck className="w-6 h-6 text-emerald-500" />
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Owner Credentials</h2>
                </div>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" /> Full Name
                    </label>
                    <input type="text" name="ownerName" required className="w-full px-4 py-3 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all" placeholder="Jane Doe" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400" /> Owner Email
                    </label>
                    <input type="email" name="ownerEmail" required className="w-full px-4 py-3 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all" placeholder="jane@acme.com" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-slate-400" /> Temporary Password
                    </label>
                    <input type="password" name="ownerPassword" required className="w-full px-4 py-3 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all" placeholder="••••••••" />
                  </div>
                </div>
              </div>

              {/* Limits Card */}
              <div className="p-8 rounded-3xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/80 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-none hover:shadow-2xl transition-all duration-300">
                <div className="flex items-center gap-3 mb-6">
                  <Crown className="w-6 h-6 text-amber-500" />
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Plan & Limits</h2>
                </div>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Subscription Plan</label>
                    <select name="plan" className="w-full px-4 py-3 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-amber-500 outline-none transition-all appearance-none cursor-pointer">
                      <option value="TRIAL">TRIAL</option>
                      <option value="STARTER">STARTER</option>
                      <option value="GROWTH">GROWTH</option>
                      <option value="ENTERPRISE">ENTERPRISE</option>
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <Users className="w-3 h-3" /> Users
                      </label>
                      <input type="number" name="userLimit" defaultValue={10} className="w-full px-3 py-2 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <HardHat className="w-3 h-3" /> Sites
                      </label>
                      <input type="number" name="siteLimit" defaultValue={3} className="w-full px-3 py-2 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <Database className="w-3 h-3" /> Storage (MB)
                      </label>
                      <input type="number" name="storageLimit" defaultValue={1024} className="w-full px-3 py-2 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Modules Card */}
          <div className="p-8 rounded-3xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/80 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-none hover:shadow-2xl transition-all duration-300">
            <div className="flex items-center gap-3 mb-6">
              <CheckCircle2 className="w-6 h-6 text-indigo-500" />
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Enabled Modules</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
              {[
                'SITES', 'APPROVALS', 'REPORTS', 'EXPENSES', 'BILLS', 
                'LABOUR', 'MATERIALS', 'DPR', 'TASKS', 'DOCUMENTS'
              ].map((module) => (
                <label key={module} className="relative flex items-center justify-between p-4 rounded-2xl bg-white/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {module}
                  </span>
                  <div className="relative inline-flex items-center">
                    <input type="checkbox" name={`module_${module}`} value="true" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Submit Actions */}
          <div className="flex justify-end gap-4">
            <button type="button" className="px-6 py-3 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all">
              Cancel
            </button>
            <button type="submit" className="px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-0.5 transition-all active:translate-y-0">
              Create Company
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
