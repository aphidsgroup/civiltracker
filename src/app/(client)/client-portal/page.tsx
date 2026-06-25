import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'


export default async function ClientPortal() {
  const session = await auth()
  if (session?.user?.role !== 'CLIENT') redirect('/dashboard')

  const site = await prisma.site.findFirst({
    where: { clientId: session?.user?.id, deletedAt: null },
    include: {
      company: true,
      photos: {
        where: { approvedForClient: true },
        orderBy: { createdAt: 'desc' },
        take: 3
      }
    }
  })

  // If no site assigned, show empty state
  if (!site) {
    return (
      <div className="module" style={{ marginTop: '50px' }}>
        <div className="modic">
          <svg className="svg28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        </div>
        <div className="modt">No projects found</div>
        <div className="mods">You haven&apos;t been assigned to any active projects yet. Please contact your builder.</div>
      </div>
    )
  }

  const budget = Number(site.budget) || 0
  const spent = Number(site.spent) || 0
  const progress = site.progress || 0

  return (
    <>
      <div className="hero">
        <div className="hgrid">
          <div className="hmain">
            <div className="hkick">Your project</div>
            <div className="htitle">{site.name}</div>
            <div className="hloc">
              <svg className="svg16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>
              {site.location} · by {site.company?.name || 'Your Builder'}
            </div>
            <div className="hstats">
              <div className="hs">
                <div className="hsn">Day {Math.max(0, Math.floor((new Date().getTime() - new Date(site.startDate || new Date()).getTime()) / (1000 * 3600 * 24)))}</div>
                <div className="hsl">of project</div>
              </div>
              <div className="hs">
                <div className="hsn">{site.currentStage || 'Planning phase'}</div>
                <div className="hsl">Current phase</div>
              </div>
            </div>
            <div className="statuspill"><span className="gdot"></span>{site.status.replace('_', ' ')} · updated today</div>
          </div>
          <div className="ring">
            <div className="ringin">
              <div className="ringn">{progress}%</div>
              <div className="ringl">Complete</div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="cols">
        <div className="colL">
          <div className="card">
            <div className="chead">
              <div><div className="ctitle">Construction milestones</div><div className="csub">Track project progress</div></div>
            </div>
            <div className="cbody">
              <div className="ms">
                <div className="msline"></div>
                <div className="msdot md-done"><svg className="svg14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10"/></svg></div>
                <div className="msmain">
                  <div className="msrow"><div className="msname">Foundation & footing</div><div className="mschip mc-done">Done</div></div>
                  <div className="msmeta">Completed successfully</div>
                </div>
              </div>
              <div className="ms">
                <div className="msline"></div>
                <div className="msdot md-done"><svg className="svg14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10"/></svg></div>
                <div className="msmain">
                  <div className="msrow"><div className="msname">RCC structure</div><div className="mschip mc-done">Done</div></div>
                  <div className="msmeta">Completed successfully</div>
                </div>
              </div>
              <div className="ms">
                <div className="msline"></div>
                <div className="msdot md-active"></div>
                <div className="msmain">
                  <div className="msrow"><div className="msname">Masonry & block work</div><div className="mschip mc-active">In progress</div></div>
                  <div className="msmeta">Currently active phase</div>
                </div>
              </div>
              <div className="ms">
                <div className="msdot md-soon"></div>
                <div className="msmain">
                  <div className="msrow"><div className="msname">Finishing & Handover</div><div className="mschip mc-soon">Upcoming</div></div>
                  <div className="msmeta">Planned for later stages</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="chead">
              <div><div className="ctitle">Latest approved photos</div><div className="csub">Shared by your site team</div></div>
              <div className="clink">View all</div>
            </div>
            <div className="cbody">
              {site.photos.length > 0 ? (
                <div className="pgrid">
                  {site.photos.map(p => (
                    <div key={p.id} className="pcell">
                      <div className="pimg" style={{ backgroundImage: `url(${p.secureUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                        <div className="papprv"><svg className="svg14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10"/></svg>Approved</div>
                      </div>
                      <div className="pcap">
                        <div className="pcn">{p.caption || 'Site update'}</div>
                        <div className="pct2">{new Date(p.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="note"><svg className="svg16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>No approved photos available yet.</div>
              )}
            </div>
          </div>
        </div>
        
        <div className="colR">
          <div className="card">
            <div className="chead"><div className="ctitle">Payment summary</div></div>
            <div className="payhero">
              <div className="paybig">₹{(spent / 100000).toFixed(2)} L</div>
              <div className="paylbl">Paid of ₹{(budget / 100000).toFixed(2)} L contract</div>
              <div className="paybar"><div className="payfill" style={{ width: `${Math.min((spent / (budget || 1)) * 100, 100)}%` }}></div></div>
              <div className="payrow"><span className="mut">Contract value</span><span>₹{(budget / 100000).toFixed(2)} L</span></div>
              <div className="payrow"><span className="mut">Paid to date</span><span style={{ color: '#0f7a45' }}>₹{(spent / 100000).toFixed(2)} L</span></div>
              
              <div className="duebox">
                <div className="duetop">Next payment due</div>
                <div className="dueamt">₹0</div>
                <div className="duedate">No upcoming dues</div>
              </div>
              <div className="btnP">Pay now</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
