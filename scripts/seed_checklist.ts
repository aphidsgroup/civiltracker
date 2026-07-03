import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding Checklist Template...')

  // Idempotent — skip if global template already exists
  const existing = await prisma.checklistTemplate.findFirst({ where: { isGlobal: true } })
  if (existing) {
    console.log('Global template already exists:', existing.id, '—', existing.name)
    return
  }

  const template = await prisma.checklistTemplate.create({
    data: {
      name: 'TN Residential - Standard Checklist',
      description: 'Default master checklist for G+1/G+2 residential construction.',
      isGlobal: true,
      stages: {
        create: [
          {
            name: 'Stage A - Pre-construction & Documentation',
            order: 1,
            weight: 5,
            categories: {
              create: [
                {
                  name: 'Land & ownership documents',
                  order: 1,
                  tasks: {
                    create: [
                      { name: 'Verify Title Deed / Sale Deed.', order: 1 },
                      { name: 'Verify Mother Deed (ownership history).', order: 2 },
                      { name: 'Obtain Encumbrance Certificate (EC).', order: 3 },
                      { name: 'Verify Patta/Khata and property tax status.', order: 4 },
                      { name: 'Store survey plan / plot map.', order: 5 },
                    ]
                  }
                },
                {
                  name: 'Design & approvals',
                  order: 2,
                  tasks: {
                    create: [
                      { name: 'Finalize architectural drawings (floor plans, elevations).', order: 1 },
                      { name: 'Finalize structural drawings and calculations.', order: 2 },
                      { name: 'Prepare MEP concept layouts (electrical, plumbing, drainage, RWH).', order: 3 },
                      { name: 'Obtain building plan sanction / planning permission.', order: 4 },
                      { name: 'Obtain commencement certificate (if applicable).', order: 5 },
                      { name: 'Execute work contracts with architect & contractor.', order: 6 },
                      { name: 'Obtain soil test report.', order: 7 },
                    ]
                  }
                }
              ]
            }
          },
          {
            name: 'Stage B - Site Preparation & Setup',
            order: 2,
            weight: 5,
            categories: {
              create: [
                {
                  name: 'Site survey & marking',
                  order: 1,
                  tasks: {
                    create: [
                      { name: 'Complete level/topographical survey.', order: 1 },
                      { name: 'Mark building footprint and setbacks on ground.', order: 2 },
                      { name: 'Mark column grid lines and key reference points.', order: 3 },
                    ]
                  }
                },
                {
                  name: 'Site clearance & temporary works',
                  order: 2,
                  tasks: {
                    create: [
                      { name: 'Clear vegetation/existing structures and debris.', order: 1 },
                      { name: 'Install temporary fencing / compound for safety.', order: 2 },
                      { name: 'Setup site office and material storage sheds.', order: 3 },
                      { name: 'Arrange construction power and DB with earthing.', order: 4 },
                      { name: 'Arrange construction water source and storage.', order: 5 },
                      { name: 'Setup worker amenities (toilets, drinking water, shelter).', order: 6 },
                    ]
                  }
                }
              ]
            }
          },
          {
            name: 'Stage C - Foundation & Substructure',
            order: 3,
            weight: 15,
            categories: {
              create: [
                {
                  name: 'Foundation works',
                  order: 1,
                  tasks: {
                    create: [
                      { name: 'Excavate footings/strip/raft foundations to design depth.', order: 1 },
                      { name: 'Provide dewatering / shoring where required.', order: 2 },
                      { name: 'Lay PCC for foundations with correct thickness and level.', order: 3 },
                      { name: 'Fix reinforcement for footings as per BBS.', order: 4 },
                      { name: 'Fix shuttering for footings with proper supports.', order: 5 },
                      { name: 'Cast RCC footings; record concrete tests and curing.', order: 6 },
                    ]
                  }
                },
                {
                  name: 'Plinth & underground structures',
                  order: 2,
                  tasks: {
                    create: [
                      { name: 'Cast column pedestals/starters to plinth level.', order: 1 },
                      { name: 'Construct UG sump tank with RCC/brick and waterproofing.', order: 2 },
                      { name: 'Construct septic tank / sewage collection tank.', order: 3 },
                      { name: 'Lay main sewage lines and inspection chambers.', order: 4 },
                      { name: 'Backfill around foundations and inside plinth with compaction.', order: 5 },
                      { name: 'Cast plinth beams tying columns.', order: 6 },
                      { name: 'Fill and compact inside plinth with soil + 40mm metal.', order: 7 },
                      { name: 'Obtain plinth level inspection/approval.', order: 8 },
                    ]
                  }
                }
              ]
            }
          },
          {
            name: 'Stage D - Superstructure (Columns, Walls, Slabs)',
            order: 4,
            weight: 25,
            categories: {
              create: [
                {
                  name: 'Structural frame',
                  order: 1,
                  tasks: {
                    create: [
                      { name: 'Raise RCC columns to roof level (per floor) with proper cover and curing.', order: 1 },
                      { name: 'Cast beams as per structural drawings.', order: 2 },
                      { name: 'Setup centering/shuttering for beams and slabs.', order: 3 },
                    ]
                  }
                },
                {
                  name: 'Masonry & frames',
                  order: 2,
                  tasks: {
                    create: [
                      { name: 'Build walls from plinth to sill level.', order: 1 },
                      { name: 'Build walls up to window base and fix window frames.', order: 2 },
                      { name: 'Build walls up to lintel level; cast lintel beams.', order: 3 },
                      { name: 'Build walls from lintel to beam bottom, including parapets.', order: 4 },
                      { name: 'Fix door frames at specified positions.', order: 5 },
                    ]
                  }
                },
                {
                  name: 'Slab & stair works',
                  order: 3,
                  tasks: {
                    create: [
                      { name: 'Lay slab reinforcement with chairs/spacers.', order: 1 },
                      { name: 'Install electrical conduits and boxes in slab.', order: 2 },
                      { name: 'Cast roof slab with proper compaction.', order: 3 },
                      { name: 'Cure slab (water ponding) for required duration.', order: 4 },
                      { name: 'Remove centering and inspect slab for defects.', order: 5 },
                      { name: 'Cast staircase flights and landings.', order: 6 },
                    ]
                  }
                }
              ]
            }
          },
          {
            name: 'Stage E - MEP Rough-in',
            order: 5,
            weight: 10,
            categories: {
              create: [
                {
                  name: 'Electrical rough-in',
                  order: 1,
                  tasks: {
                    create: [
                      { name: 'Mark electrical points per detailed layout.', order: 1 },
                      { name: 'Chase walls for conduits and boxes.', order: 2 },
                      { name: 'Install conduits, junction boxes, and switch boxes.', order: 3 },
                      { name: 'Plan and install earthing and lightning protection.', order: 4 },
                      { name: 'Provide provisions for cable/internet/TV points.', order: 5 },
                      { name: 'Install DB location, MCBs/ELCBs (as per design).', order: 6 },
                    ]
                  }
                },
                {
                  name: 'Plumbing rough-in',
                  order: 2,
                  tasks: {
                    create: [
                      { name: 'Lay cold/hot water supply lines to all fixtures.', order: 1 },
                      { name: 'Lay drainage and sewage lines with proper slope.', order: 2 },
                      { name: 'Provide rainwater harvesting connections.', order: 3 },
                      { name: 'Provide AC drain lines and sleeves for units.', order: 4 },
                      { name: 'Pressure-test water lines and rectify leaks.', order: 5 },
                      { name: 'Test drainage flows and venting.', order: 6 },
                    ]
                  }
                },
                {
                  name: 'Tanks & pumps',
                  order: 3,
                  tasks: {
                    create: [
                      { name: 'Install sump plumbing connections.', order: 1 },
                      { name: 'Plan overhead tank inlets/outlets/overflows.', order: 2 },
                      { name: 'Plan pump room layout and connections.', order: 3 },
                    ]
                  }
                }
              ]
            }
          },
          {
            name: 'Stage F - Internal Finishes',
            order: 6,
            weight: 20,
            categories: {
              create: [
                {
                  name: 'Plaster & putty',
                  order: 1,
                  tasks: {
                    create: [
                      { name: 'Plaster internal walls and ceilings.', order: 1 },
                      { name: 'Plaster external walls.', order: 2 },
                      { name: 'Apply wall putty/skim coats.', order: 3 },
                    ]
                  }
                },
                {
                  name: 'Joinery & windows',
                  order: 2,
                  tasks: {
                    create: [
                      { name: 'Install window shutters and hardware.', order: 1 },
                      { name: 'Install internal door shutters and locks.', order: 2 },
                      { name: 'Install main door lockset and accessories.', order: 3 },
                    ]
                  }
                },
                {
                  name: 'Flooring & tiling',
                  order: 3,
                  tasks: {
                    create: [
                      { name: 'Lay floor tiles/granite/marble in rooms.', order: 1 },
                      { name: 'Lay anti-skid tiles in bathrooms and kitchen.', order: 2 },
                      { name: 'Provide skirting and thresholds.', order: 3 },
                      { name: 'Tile kitchen dado/back splash.', order: 4 },
                      { name: 'Tile bathroom walls to required heights.', order: 5 },
                      { name: 'Check for hollow tiles and rectify.', order: 6 },
                    ]
                  }
                },
                {
                  name: 'Kitchen & bathrooms',
                  order: 4,
                  tasks: {
                    create: [
                      { name: 'Install kitchen platform and sink.', order: 1 },
                      { name: 'Install kitchen base/storage units (if in scope).', order: 2 },
                      { name: 'Install sanitary fixtures (WC, basins, showers).', order: 3 },
                      { name: 'Install CP fittings and accessories.', order: 4 },
                      { name: 'Waterproof bathroom floors and walls.', order: 5 },
                    ]
                  }
                },
                {
                  name: 'Electrical second fix & paint',
                  order: 5,
                  tasks: {
                    create: [
                      { name: 'Pull wiring through conduits.', order: 1 },
                      { name: 'Install switches, sockets, lights, fans.', order: 2 },
                      { name: 'Test all circuits and earthing.', order: 3 },
                      { name: 'Apply primer and interior wall/ceiling paints.', order: 4 },
                      { name: 'Paint wood/metal surfaces.', order: 5 },
                    ]
                  }
                }
              ]
            }
          },
          {
            name: 'Stage G - External Works & Elevation',
            order: 7,
            weight: 10,
            categories: {
              create: [
                {
                  name: 'Elevation & external finishes',
                  order: 1,
                  tasks: {
                    create: [
                      { name: 'Execute elevation cladding/texture elements.', order: 1 },
                      { name: 'Complete external wall painting with weather-proof system.', order: 2 },
                    ]
                  }
                },
                {
                  name: 'Compound & hardscape',
                  order: 2,
                  tasks: {
                    create: [
                      { name: 'Build compound wall and gate columns.', order: 1 },
                      { name: 'Fabricate and install main gate and grills.', order: 2 },
                      { name: 'Lay driveway/parking pavers or concrete with proper slopes.', order: 3 },
                      { name: 'Construct external steps/staircase if applicable.', order: 4 },
                    ]
                  }
                },
                {
                  name: 'Services & landscaping',
                  order: 3,
                  tasks: {
                    create: [
                      { name: 'Install overhead tank and connect plumbing.', order: 1 },
                      { name: 'Install pump set and control panel.', order: 2 },
                      { name: 'Provide external storm water drainage.', order: 3 },
                      { name: 'Execute basic landscaping/planting.', order: 4 },
                      { name: 'Install external lights (gate/garden/facade).', order: 5 },
                      { name: 'Provide EB service wire and meter board.', order: 6 },
                    ]
                  }
                }
              ]
            }
          },
          {
            name: 'Stage H - Quality Control & Inspections',
            order: 8,
            weight: 5,
            categories: {
              create: [
                {
                  name: 'Quality checks',
                  order: 1,
                  tasks: {
                    create: [
                      { name: 'Record concrete quality tests (slump, cubes).', order: 1 },
                      { name: 'Inspect masonry alignment and joints.', order: 2 },
                      { name: 'Inspect plaster quality and thickness.', order: 3 },
                      { name: 'Verify waterproofing with ponding tests.', order: 4 },
                      { name: 'Verify electrical safety and earthing.', order: 5 },
                      { name: 'Verify plumbing performance (pressure and flow).', order: 6 },
                      { name: 'Conduct safety inspections for scaffolding/PPE/housekeeping.', order: 7 },
                    ]
                  }
                },
                {
                  name: 'Statutory inspections',
                  order: 2,
                  tasks: {
                    create: [
                      { name: 'Record authority inspections at plinth and slabs.', order: 1 },
                      { name: 'Arrange completion/occupancy inspection as per local norms.', order: 2 },
                    ]
                  }
                }
              ]
            }
          },
          {
            name: 'Stage I - Handover & Documentation',
            order: 9,
            weight: 5,
            categories: {
              create: [
                {
                  name: 'Snagging & rectification',
                  order: 1,
                  tasks: {
                    create: [
                      { name: 'Prepare full snag list (civil/MEP/finishes).', order: 1 },
                      { name: 'Complete snag rectifications.', order: 2 },
                      { name: 'Re-inspect critical areas (leaks, cracks, operations).', order: 3 },
                    ]
                  }
                },
                {
                  name: 'Cleaning & readiness',
                  order: 2,
                  tasks: {
                    create: [
                      { name: 'Deep clean interiors (floors, fixtures, surfaces).', order: 1 },
                      { name: 'Clean external areas (driveway, compound, roof).', order: 2 },
                      { name: 'Confirm site is safe and ready for occupation.', order: 3 },
                    ]
                  }
                },
                {
                  name: 'Handover documentation',
                  order: 3,
                  tasks: {
                    create: [
                      { name: 'Compile approved drawings and structural documents.', order: 1 },
                      { name: 'Compile warranties, manuals, and material specs.', order: 2 },
                      { name: 'Obtain completion/occupancy certificates.', order: 3 },
                      { name: 'Confirm EB/water/sewage permanent connections.', order: 4 },
                      { name: 'Conduct joint walkthrough with client and explanation of systems.', order: 5 },
                      { name: 'Obtain client satisfaction sign-off.', order: 6 },
                      { name: 'Hand over keys and access devices.', order: 7 },
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    }
  })

  console.log('Successfully created global Checklist Template:', template.id)

  // Also clean up any empty (0-stage) company templates that may have been created accidentally
  const allCompany = await prisma.checklistTemplate.findMany({
    where: { isGlobal: false },
    include: { _count: { select: { stages: true } } }
  })
  const toDelete = allCompany.filter(t => t._count.stages === 0)
  if (toDelete.length > 0) {
    await prisma.checklistTemplate.deleteMany({ where: { id: { in: toDelete.map(t => t.id) } } })
    console.log(`Cleaned up ${toDelete.length} empty company templates.`)
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
