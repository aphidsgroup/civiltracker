import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST /api/health/fix-templates
// Seeds the global master checklist template if missing, and deletes empty company templates.
// Protected by CRON_SECRET to prevent abuse.
export async function POST(request: Request) {
  const secret = request.headers.get('x-secret') ?? ''
  const session = await auth()
  const isSuperAdmin = session?.user?.role === 'SUPER_ADMIN'
  const cronSecret = process.env.CRON_SECRET
  const hasValidSecret = Boolean(cronSecret) && secret === cronSecret

  if (!isSuperAdmin && !hasValidSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, unknown> = {}

  // 1. Delete empty company templates (isGlobal=false with 0 stages)
  try {
    const all = await prisma.checklistTemplate.findMany({
      where: { isGlobal: false },
      include: { _count: { select: { stages: true } } }
    })
    const toDelete = all.filter(t => t._count.stages === 0)
    if (toDelete.length > 0) {
      await prisma.checklistTemplate.deleteMany({
        where: { id: { in: toDelete.map(t => t.id) } }
      })
      results.deletedEmpty = toDelete.map(t => ({ id: t.id, name: t.name }))
    } else {
      results.deletedEmpty = []
    }
  } catch (e) {
    results.deleteError = String(e)
  }

  // 2. Seed global template if missing
  try {
    const existing = await prisma.checklistTemplate.findFirst({ where: { isGlobal: true } })
    if (existing) {
      results.globalTemplate = { status: 'already_exists', id: existing.id, name: existing.name }
    } else {
      const template = await prisma.checklistTemplate.create({
        data: {
          name: 'TN Residential - Standard Checklist',
          description: 'Default master checklist for G+1/G+2 residential construction.',
          isGlobal: true,
          stages: {
            create: [
              { name: 'Stage A - Pre-construction & Documentation', order: 1, weight: 5, categories: { create: [{ name: 'Land & ownership documents', order: 1, tasks: { create: [{ name: 'Verify Title Deed / Sale Deed.', order: 1 },{ name: 'Verify Mother Deed (ownership history).', order: 2 },{ name: 'Obtain Encumbrance Certificate (EC).', order: 3 },{ name: 'Verify Patta/Khata and property tax status.', order: 4 },{ name: 'Store survey plan / plot map.', order: 5 }] } },{ name: 'Design & approvals', order: 2, tasks: { create: [{ name: 'Finalize architectural drawings (floor plans, elevations).', order: 1 },{ name: 'Finalize structural drawings and calculations.', order: 2 },{ name: 'Prepare MEP concept layouts (electrical, plumbing, drainage, RWH).', order: 3 },{ name: 'Obtain building plan sanction / planning permission.', order: 4 },{ name: 'Obtain commencement certificate (if applicable).', order: 5 },{ name: 'Execute work contracts with architect & contractor.', order: 6 },{ name: 'Obtain soil test report.', order: 7 }] } }] } },
              { name: 'Stage B - Site Preparation & Setup', order: 2, weight: 5, categories: { create: [{ name: 'Site survey & marking', order: 1, tasks: { create: [{ name: 'Complete level/topographical survey.', order: 1 },{ name: 'Mark building footprint and setbacks on ground.', order: 2 },{ name: 'Mark column grid lines and key reference points.', order: 3 }] } },{ name: 'Site clearance & temporary works', order: 2, tasks: { create: [{ name: 'Clear vegetation/existing structures and debris.', order: 1 },{ name: 'Install temporary fencing / compound for safety.', order: 2 },{ name: 'Setup site office and material storage sheds.', order: 3 },{ name: 'Arrange construction power and DB with earthing.', order: 4 },{ name: 'Arrange construction water source and storage.', order: 5 },{ name: 'Setup worker amenities (toilets, drinking water, shelter).', order: 6 }] } }] } },
              { name: 'Stage C - Foundation & Substructure', order: 3, weight: 15, categories: { create: [{ name: 'Foundation works', order: 1, tasks: { create: [{ name: 'Set out excavation lines and get engineer approval.', order: 1 },{ name: 'Complete excavation to design depth; dispose spoil.', order: 2 },{ name: 'Lay PCC (M15) levelling course.', order: 3 },{ name: 'Lay waterproofing membrane / DPC over PCC.', order: 4 },{ name: 'Place and bind foundation reinforcement as per drawing.', order: 5 },{ name: 'Cast foundation concrete (M25) and cure for 7 days.', order: 6 }] } },{ name: 'Plinth & underground structures', order: 2, tasks: { create: [{ name: 'Construct plinth walls / plinth beams as per drawing.', order: 1 },{ name: 'Lay underground drainage lines (UPVC, correct slope).', order: 2 },{ name: 'Lay underground water supply lines (CPVC).', order: 3 },{ name: 'Lay conduits for electrical earthing and underground cables.', order: 4 },{ name: 'Complete anti-termite treatment.', order: 5 },{ name: 'Backfill with approved material in layers and compact.', order: 6 },{ name: 'Construct sump / UGT as per drawing.', order: 7 },{ name: 'Lay plinth filling and compact to required level.', order: 8 }] } }] } },
              { name: 'Stage D - Superstructure (Columns, Walls, Slabs)', order: 4, weight: 25, categories: { create: [{ name: 'Structural frame', order: 1, tasks: { create: [{ name: 'Set out columns with correct alignment and cover blocks.', order: 1 },{ name: 'Cast columns with approved M25 concrete and cure.', order: 2 },{ name: 'Construct beams and tie-beam reinforcement as per drawing.', order: 3 }] } },{ name: 'Masonry & frames', order: 2, tasks: { create: [{ name: 'Lay brick/block masonry walls with proper bond and joints.', order: 1 },{ name: 'Fix door and window frames; check plumb and level.', order: 2 },{ name: 'Construct lintels over all openings.', order: 3 },{ name: 'Provide weep holes and ventilation bricks where needed.', order: 4 },{ name: 'Build parapet walls and sunshade slabs.', order: 5 }] } },{ name: 'Slab & stair works', order: 3, tasks: { create: [{ name: 'Erect shuttering and props; check level.', order: 1 },{ name: 'Place and bind slab reinforcement; install spacers.', order: 2 },{ name: 'Complete MEP conduit/sleeve embedment in slab.', order: 3 },{ name: 'Pour and vibrate slab concrete (M25); maintain thickness.', order: 4 },{ name: 'Cure slab for minimum 14 days (ponding or wet gunny).', order: 5 },{ name: 'Construct staircase with correct going, rise, and handrail provisions.', order: 6 }] } }] } },
              { name: 'Stage E - MEP Rough-in', order: 5, weight: 10, categories: { create: [{ name: 'Electrical rough-in', order: 1, tasks: { create: [{ name: 'Run conduits in walls/ceiling for all circuits as per layout.', order: 1 },{ name: 'Pull wires (phase, neutral, earth) with correct colour coding.', order: 2 },{ name: 'Embed electrical boxes (switch, socket, DB) flush with wall.', order: 3 },{ name: 'Install DB boards and label circuits; provide main switch.', order: 4 },{ name: 'Conduct continuity and insulation resistance test.', order: 5 },{ name: 'Provide separate earthing pits and connect to MEB.', order: 6 }] } },{ name: 'Plumbing rough-in', order: 2, tasks: { create: [{ name: 'Run CPVC supply lines; test hydraulic pressure (10 bar).', order: 1 },{ name: 'Run soil and waste UPVC stacks; ensure 1-2% slope.', order: 2 },{ name: 'Provide cleanout access points at bends.', order: 3 },{ name: 'Install traps for all floor drains and WC connections.', order: 4 },{ name: 'Core drill walls and slabs for pipe passages; seal after.', order: 5 },{ name: 'Conduct water flow and drainage test before closing walls.', order: 6 }] } },{ name: 'Tanks & pumps', order: 3, tasks: { create: [{ name: 'Install OHT (overhead tank) on terrace with inlet/outlet/overflow connections.', order: 1 },{ name: 'Install booster pump and connect to supply lines.', order: 2 },{ name: 'Connect UGT to pump and OHT with ball valves.', order: 3 }] } }] } },
              { name: 'Stage F - Internal Finishes', order: 6, weight: 20, categories: { create: [{ name: 'Plaster & putty', order: 1, tasks: { create: [{ name: 'Apply single/double coat plaster (12-20mm) with guides; cure 7 days.', order: 1 },{ name: 'Apply POP/gypsum putty on internal walls (2 coats); sand smooth.', order: 2 },{ name: 'Apply external plaster with waterproofing admixture.', order: 3 }] } },{ name: 'Joinery & windows', order: 2, tasks: { create: [{ name: 'Fix main door frame and shutter; install hardware.', order: 1 },{ name: 'Fix internal door shutters; hang and adjust; install hardware.', order: 2 },{ name: 'Fix aluminium/UPVC windows; apply sealant at perimeter.', order: 3 }] } },{ name: 'Flooring & tiling', order: 3, tasks: { create: [{ name: 'Lay CC/screed bed; level and cure before tiling.', order: 1 },{ name: 'Lay vitrified tiles with proper layout, spacing, and grouting.', order: 2 },{ name: 'Lay anti-skid tiles in wet areas, balconies, and staircases.', order: 3 },{ name: 'Apply waterproofing in bathrooms before wall tiling.', order: 4 },{ name: 'Fix wall tiles in toilets and kitchen with even joints.', order: 5 },{ name: 'Apply tile grout and clean; check for hollow tiles.', order: 6 }] } },{ name: 'Kitchen & bathrooms', order: 4, tasks: { create: [{ name: 'Fix CP fittings (taps, showers, flush valves) with proper sealing.', order: 1 },{ name: 'Install WC/wash basin/sink with P-trap and supply connections.', order: 2 },{ name: 'Fix kitchen platform and sink; seal joints.', order: 3 },{ name: 'Fix exhaust fans, accessories, and bathroom accessories.', order: 4 },{ name: 'Test all fixtures for leaks; check water pressure.', order: 5 }] } },{ name: 'Electrical second fix & paint', order: 5, tasks: { create: [{ name: 'Fix switches, sockets, plates, and MCBs; test all points.', order: 1 },{ name: 'Install light fixtures, fans, and ACs; test each.', order: 2 },{ name: 'Apply primer (1 coat) on all internal walls and ceiling.', order: 3 },{ name: 'Apply emulsion paint (2 finish coats) with colour as approved.', order: 4 },{ name: 'Apply enamel paint on doors, windows, grills, and MS work.', order: 5 }] } }] } },
              { name: 'Stage G - External Works & Elevation', order: 7, weight: 10, categories: { create: [{ name: 'Elevation & external finishes', order: 1, tasks: { create: [{ name: 'Apply exterior textured paint or stone cladding as per design.', order: 1 },{ name: 'Fix fascia, copings, and projections; seal all joints.', order: 2 }] } },{ name: 'Compound & hardscape', order: 2, tasks: { create: [{ name: 'Construct compound wall with gate; apply plaster and paint.', order: 1 },{ name: 'Lay paving for driveway and walkways with proper slope for drainage.', order: 2 },{ name: 'Construct car parking slab or paver block area.', order: 3 },{ name: 'Install external lighting points and garden outlets.', order: 4 }] } },{ name: 'Services & landscaping', order: 3, tasks: { create: [{ name: 'Provide rainwater harvesting (RWH) pit and connect to storm drains.', order: 1 },{ name: 'Install septic tank or connect to municipal sewage.', order: 2 },{ name: 'Connect permanent EB service; install energy meter and DB.', order: 3 },{ name: 'Connect permanent water supply connection from municipality.', order: 4 },{ name: 'Provide basic landscaping, top soil, and planting if required.', order: 5 },{ name: 'Install CCTV, intercom, or solar systems if in scope.', order: 6 }] } }] } },
              { name: 'Stage H - Quality Control & Inspections', order: 8, weight: 5, categories: { create: [{ name: 'Quality checks', order: 1, tasks: { create: [{ name: 'Conduct water leakage test on terrace (pond for 48 hrs).', order: 1 },{ name: 'Test all electrical circuits with load for 2 hours.', order: 2 },{ name: 'Check all plumbing for leaks under pressure.', order: 3 },{ name: 'Verify all tile hollow areas and repair.', order: 4 },{ name: 'Inspect all doors and windows for smooth operation.', order: 5 },{ name: 'Check paint finish for uniformity; touch-up where needed.', order: 6 },{ name: 'Verify all external drainage slopes are correct.', order: 7 }] } },{ name: 'Statutory inspections', order: 2, tasks: { create: [{ name: 'Schedule and pass municipal/CMDA inspection for occupancy.', order: 1 },{ name: 'Obtain EB final inspection clearance for permanent connection.', order: 2 }] } }] } },
              { name: 'Stage I - Handover & Documentation', order: 9, weight: 5, categories: { create: [{ name: 'Snagging & rectification', order: 1, tasks: { create: [{ name: 'Prepare and share snagging list with client.', order: 1 },{ name: 'Complete all snagging items and re-inspect.', order: 2 },{ name: 'Client confirms snagging list is closed.', order: 3 }] } },{ name: 'Cleaning & readiness', order: 2, tasks: { create: [{ name: 'Complete full construction clean (remove debris, cement drops).', order: 1 },{ name: 'Wipe down all surfaces, tiles, glass, and fixtures.', order: 2 },{ name: 'Ensure all utilities (water, power) are functional for handover.', order: 3 }] } },{ name: 'Handover documentation', order: 3, tasks: { create: [{ name: 'Compile approved drawings and structural documents.', order: 1 },{ name: 'Compile warranties, manuals, and material specs.', order: 2 },{ name: 'Obtain completion/occupancy certificates.', order: 3 },{ name: 'Confirm EB/water/sewage permanent connections.', order: 4 },{ name: 'Conduct joint walkthrough with client and explanation of systems.', order: 5 },{ name: 'Obtain client satisfaction sign-off.', order: 6 },{ name: 'Hand over keys and access devices.', order: 7 }] } }] } }
            ]
          }
        }
      })
      results.globalTemplate = { status: 'seeded', id: template.id, name: template.name }
    }
  } catch (e) {
    results.seedError = String(e)
  }

  return NextResponse.json(results)
}

// GET — report current template state for authenticated super admins only
export async function GET() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const templates = await prisma.checklistTemplate.findMany({
    include: { _count: { select: { stages: true } } }
  })
  return NextResponse.json({
    total: templates.length,
    templates: templates.map(t => ({
      id: t.id, name: t.name, isGlobal: t.isGlobal,
      companyId: t.companyId, stages: t._count.stages
    }))
  })
}
