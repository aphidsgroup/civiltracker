/**
 * Master Material Catalogue for Indian Residential & Commercial Construction
 * Hierarchical: Category -> Material -> Specification Variant -> Approved Brands
 * Provides auto-filled quantity units, pack sizes, local name aliases, and conversion notes.
 */

export interface SpecificationOption {
  label: string
  key: string
  options: string[]
}

export interface MaterialVariant {
  id: string
  name: string
  category: string
  categoryId: string
  aliases: string[]
  specificationFields: SpecificationOption[]
  defaultUnit: string
  allowedUnits: string[]
  isDecimalAllowed: boolean
  packSize?: string
  conversionNote?: string
  approvedBrands?: string[]
}

export interface MaterialCategory {
  id: string
  name: string
  iconName: string
  description: string
  materials: MaterialVariant[]
}

export const MATERIAL_CATALOGUE: MaterialCategory[] = [
  // 1. CEMENT, SAND, AGGREGATES AND CONCRETE
  {
    id: 'CEMENT_CONCRETE',
    name: '1. Cement, sand, aggregates & concrete',
    iconName: 'Building2',
    description: 'OPC/PPC cements, M-sand, P-sand, river sand, blue metal, RMC, and mortar',
    materials: [
      {
        id: 'opc-cement',
        name: 'OPC Cement',
        category: 'Cement, sand, aggregates & concrete',
        categoryId: 'CEMENT_CONCRETE',
        aliases: ['opc', 'ordinary portland cement', 'cement bag', '53 grade cement', '43 grade'],
        specificationFields: [
          { key: 'grade', label: 'Cement Grade', options: ['53 Grade (IS 269)', '43 Grade (IS 269)'] },
          { key: 'packSize', label: 'Pack Size', options: ['50 kg HDPE Bag'] },
        ],
        defaultUnit: 'Bags',
        allowedUnits: ['Bags', 'kg', 'Tonne'],
        isDecimalAllowed: false,
        packSize: '50 kg / bag',
        conversionNote: '1 Bag = 50 kg • 20 Bags = 1 Metric Tonne',
        approvedBrands: ['UltraTech', 'ACC', 'Dalmia', 'Chettinad', 'Ramco Supercrete', 'Bharathi', 'Zuari'],
      },
      {
        id: 'ppc-cement',
        name: 'PPC Cement',
        category: 'Cement, sand, aggregates & concrete',
        categoryId: 'CEMENT_CONCRETE',
        aliases: ['ppc', 'portland pozzolana cement', 'flyash cement'],
        specificationFields: [
          { key: 'product', label: 'Type / Standard', options: ['PPC Fly-ash based (IS 1489 Part 1)', 'PPC Calcined clay'] },
          { key: 'packSize', label: 'Pack Size', options: ['50 kg HDPE Bag'] },
        ],
        defaultUnit: 'Bags',
        allowedUnits: ['Bags', 'kg', 'Tonne'],
        isDecimalAllowed: false,
        packSize: '50 kg / bag',
        conversionNote: 'Manufacturers distinguish PPC from grade numbers (do not label as 53 grade)',
        approvedBrands: ['UltraTech Super', 'ACC Suraksha', 'Dalmia DSP', 'Birla A1', 'Ramco Supergrade'],
      },
      {
        id: 'psc-cement',
        name: 'PSC Cement',
        category: 'Cement, sand, aggregates & concrete',
        categoryId: 'CEMENT_CONCRETE',
        aliases: ['psc', 'slag cement', 'portland slag cement'],
        specificationFields: [
          { key: 'product', label: 'Type', options: ['Portland Slag Cement (IS 455)'] },
          { key: 'packSize', label: 'Pack Size', options: ['50 kg HDPE Bag'] },
        ],
        defaultUnit: 'Bags',
        allowedUnits: ['Bags', 'kg'],
        isDecimalAllowed: false,
        packSize: '50 kg / bag',
        approvedBrands: ['JSW Concreel', 'Dalmia', 'Tata Steel PSC'],
      },
      {
        id: 'white-cement',
        name: 'White Cement',
        category: 'Cement, sand, aggregates & concrete',
        categoryId: 'CEMENT_CONCRETE',
        aliases: ['white cement', 'vella cement', 'jk white'],
        specificationFields: [
          { key: 'packSize', label: 'Pack Weight', options: ['50 kg Bag', '25 kg Bag', '5 kg Pouch', '1 kg Pouch'] },
        ],
        defaultUnit: 'Bags',
        allowedUnits: ['Bags', 'kg'],
        isDecimalAllowed: true,
        approvedBrands: ['JK White', 'Birla White'],
      },
      {
        id: 'm-sand',
        name: 'M-Sand (Manufactured Sand)',
        category: 'Cement, sand, aggregates & concrete',
        categoryId: 'CEMENT_CONCRETE',
        aliases: ['m sand', 'msand', 'manufactured sand', 'crushed sand', 'concrete sand', 'jalli manal'],
        specificationFields: [
          { key: 'application', label: 'Application & Grading', options: ['Concrete Application (Zone II - IS 383)', 'Masonry & Blockwork (Zone III)'] },
        ],
        defaultUnit: 'cft',
        allowedUnits: ['cft', 'm³', 'Tonne', 'Unit (100 cft)'],
        isDecimalAllowed: true,
        conversionNote: '1 Chennai Unit = 100 cft (~2.83 m³). Density approx 1.6 tonne/m³.',
      },
      {
        id: 'p-sand',
        name: 'P-Sand (Plastering Sand)',
        category: 'Cement, sand, aggregates & concrete',
        categoryId: 'CEMENT_CONCRETE',
        aliases: ['p sand', 'psand', 'plastering sand', 'kurunai manal', 'fine sand'],
        specificationFields: [
          { key: 'grading', label: 'Grading / Sieve', options: ['Washed Fine Plastering Sand (Zone IV)', 'Double Washed Super Fine'] },
        ],
        defaultUnit: 'cft',
        allowedUnits: ['cft', 'm³', 'Tonne', 'Unit (100 cft)'],
        isDecimalAllowed: true,
        conversionNote: 'Specifically washed fine sand for wall & ceiling plastering.',
      },
      {
        id: 'river-sand',
        name: 'River Sand',
        category: 'Cement, sand, aggregates & concrete',
        categoryId: 'CEMENT_CONCRETE',
        aliases: ['river sand', 'aathumanal', 'natural sand', 'screened river sand'],
        specificationFields: [
          { key: 'source', label: 'Source & Grading', options: ['Govt Quarry Screened (Approved Source)', 'Unscreened Coarse River Sand'] },
        ],
        defaultUnit: 'cft',
        allowedUnits: ['cft', 'm³', 'Unit (100 cft)'],
        isDecimalAllowed: true,
        conversionNote: 'Explicit conversion: 1 Unit = 100 cft (~2.83 m³). Specify authorized permit / pass.',
      },
      {
        id: 'coarse-aggregate',
        name: 'Coarse Aggregate / Blue Metal',
        category: 'Cement, sand, aggregates & concrete',
        categoryId: 'CEMENT_CONCRETE',
        aliases: ['blue metal', 'jalli', 'jelly', 'kappu', 'aggregate', 'gravel metal', 'crushed stone'],
        specificationFields: [
          { key: 'size', label: 'Nominal Aggregate Size', options: ['20 mm (Standard RCC)', '12 mm (Lintels & Chajjas)', '40 mm (Mass PCC & Footing)', '10 mm (Chips / Fine RCC)', '6 mm (Baby Metal / Screed)'] },
        ],
        defaultUnit: 'cft',
        allowedUnits: ['cft', 'm³', 'Tonne', 'Unit (100 cft)'],
        isDecimalAllowed: true,
        conversionNote: '100 cft = 1 Unit. Bulk density typically 1.5 to 1.6 tonne/m³.',
      },
      {
        id: 'quarry-dust',
        name: 'Quarry Dust',
        category: 'Cement, sand, aggregates & concrete',
        categoryId: 'CEMENT_CONCRETE',
        aliases: ['crusher dust', 'quarry powder', 'dust'],
        specificationFields: [
          { key: 'use', label: 'Intended Use', options: ['Plinth / Paver Base Filling', 'Road Sub-base', 'PCC blend'] },
        ],
        defaultUnit: 'cft',
        allowedUnits: ['cft', 'm³', 'Tonne'],
        isDecimalAllowed: true,
      },
      {
        id: 'filling-earth',
        name: 'Filling Earth / Soil',
        category: 'Cement, sand, aggregates & concrete',
        categoryId: 'CEMENT_CONCRETE',
        aliases: ['filling earth', 'red soil', 'savudu', 'plinth filling soil'],
        specificationFields: [
          { key: 'soilType', label: 'Approved Soil Type', options: ['Approved Red Earth / Gravel Soil', 'Gravelly Morrum Soil', 'Pit Sand Filling'] },
        ],
        defaultUnit: 'cft',
        allowedUnits: ['cft', 'm³'],
        isDecimalAllowed: true,
        conversionNote: 'Ensure compaction factor of 1.25x for loose truckloads vs consolidated volume.',
      },
      {
        id: 'ready-mix-concrete',
        name: 'Ready-Mix Concrete (RMC)',
        category: 'Cement, sand, aggregates & concrete',
        categoryId: 'CEMENT_CONCRETE',
        aliases: ['rmc', 'ready mix', 'concrete pour', 'transit mixer concrete'],
        specificationFields: [
          { key: 'mixGrade', label: 'Mix Grade', options: ['M25 (Standard RCC Slab/Beam)', 'M30 (High Rise / Heavy Columns)', 'M20 (Standard Residential)', 'M15 (PCC / Flooring Bed)', 'M35 (Water Tank / Retaining Wall)', 'M40 (Design Mix)'] },
          { key: 'slump', label: 'Workability / Slump', options: ['120 ± 25 mm (Pumping)', '150 ± 25 mm (Dense Rebar Pumping)', '100 ± 25 mm (Chute Discharge)'] },
          { key: 'aggregateSize', label: 'Max Aggregate Size', options: ['20 mm down', '10 mm down'] },
          { key: 'pumping', label: 'Placement Method', options: ['Boom Pump Required', 'Static Line Pump Required', 'Direct Chute Pour'] },
        ],
        defaultUnit: 'm³',
        allowedUnits: ['m³'],
        isDecimalAllowed: true,
        conversionNote: 'Transit mixer batch size is usually 6 m³ or 7 m³ per trip.',
        approvedBrands: ['UltraTech RMC', 'ACC RMC', 'Prism Johnson RMC', 'RDC Concrete', 'Godrej RMC'],
      },
      {
        id: 'ready-mix-plaster',
        name: 'Ready-Mix Plaster',
        category: 'Cement, sand, aggregates & concrete',
        categoryId: 'CEMENT_CONCRETE',
        aliases: ['readymix plaster', 'premix plaster'],
        specificationFields: [
          { key: 'type', label: 'Type', options: ['Internal Plaster (40 kg Bag)', 'External Water-repellent Plaster (40 kg Bag)'] },
        ],
        defaultUnit: 'Bags',
        allowedUnits: ['Bags', 'kg'],
        isDecimalAllowed: false,
        packSize: '40 kg / bag',
        approvedBrands: ['UltraTech Readplast', 'ACC Plastmaster', 'Berger Prolite'],
      },
      {
        id: 'block-jointing-mortar',
        name: 'Block-Jointing Mortar',
        category: 'Cement, sand, aggregates & concrete',
        categoryId: 'CEMENT_CONCRETE',
        aliases: ['block adhesive', 'aac block adhesive', 'thin bed mortar'],
        specificationFields: [
          { key: 'pack', label: 'Pack Size', options: ['40 kg Bag', '50 kg Bag'] },
        ],
        defaultUnit: 'Bags',
        allowedUnits: ['Bags', 'kg'],
        isDecimalAllowed: false,
        packSize: '40 kg / bag',
        conversionNote: '1 Bag covers approx 100 to 120 sq.ft of 150mm (6") AAC blockwork.',
        approvedBrands: ['UltraTech Fixoblock', 'Magicrete Adhesive', 'Roff Blockfix', 'Fosroc'],
      },
    ],
  },

  // 2. REINFORCEMENT AND STRUCTURAL STEEL
  {
    id: 'STEEL_STRUCTURAL',
    name: '2. Reinforcement & structural steel',
    iconName: 'Boxes',
    description: 'TMT rebars, binding wire, cover blocks, mesh, rebar couplers, MS sections, beams, and plates',
    materials: [
      {
        id: 'tmt-rebar',
        name: 'TMT Reinforcement Bar',
        category: 'Reinforcement & structural steel',
        categoryId: 'STEEL_STRUCTURAL',
        aliases: ['tmt steel', 'tmt rebar', 'steel rod', 'kambi', 'iron rod', 'rebar', 'reinforcement'],
        specificationFields: [
          { key: 'grade', label: 'Steel Grade', options: ['Fe500D (Earthquake Resistant)', 'Fe550D (High Tensile)', 'Fe500', 'Fe550'] },
          { key: 'diameter', label: 'Bar Diameter', options: ['12 mm', '16 mm', '10 mm', '8 mm', '20 mm', '25 mm', '32 mm'] },
          { key: 'length', label: 'Length Specification', options: ['12 m Standard Length', 'Factory Cut & Bend'] },
        ],
        defaultUnit: 'kg',
        allowedUnits: ['kg', 'Tonne'],
        isDecimalAllowed: true,
        conversionNote: 'Std weight: 8mm=0.395 kg/m, 10mm=0.617 kg/m, 12mm=0.888 kg/m, 16mm=1.58 kg/m, 20mm=2.47 kg/m, 25mm=3.85 kg/m.',
        approvedBrands: ['Tata Tiscon 550SD', 'JSW Neosteel', 'SAIL TMT', 'Jindal Panther', 'Vizag Steel (RINL)', 'Kamdhenu'],
      },
      {
        id: 'binding-wire',
        name: 'Binding Wire',
        category: 'Reinforcement & structural steel',
        categoryId: 'STEEL_STRUCTURAL',
        aliases: ['kattu kambi', 'binding wire', 'tie wire', 'gi binding wire', 'annealed wire'],
        specificationFields: [
          { key: 'gauge', label: 'Wire Gauge / Diameter', options: ['18 Gauge (1.2 mm Annealed MS)', '20 Gauge (0.9 mm Annealed MS)', 'GI Coated 18 Gauge'] },
        ],
        defaultUnit: 'kg',
        allowedUnits: ['kg', 'Bundle (25 kg)'],
        isDecimalAllowed: true,
        conversionNote: 'Normally bundled in 25 kg coils. Approx 7–10 kg required per metric tonne of rebar.',
      },
      {
        id: 'cover-block',
        name: 'Concrete Cover Block',
        category: 'Reinforcement & structural steel',
        categoryId: 'STEEL_STRUCTURAL',
        aliases: ['cover block', 'spacer block', 'concrete biscuit', 'reinforcement cover'],
        specificationFields: [
          { key: 'coverSize', label: 'Clear Cover Depth', options: ['20 mm (Slab Cover)', '25 mm (Beam Cover)', '40 mm (Column Cover)', '50 mm (Footing Cover)', '75 mm (Pile / Raft Cover)'] },
          { key: 'materialType', label: 'Grade & Material', options: ['M30/M40 Grade High-Density Concrete', 'PVC Multi-Cover Chair'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos', 'Bag (100 Nos)'],
        isDecimalAllowed: false,
        conversionNote: 'Ensures clear concrete cover over reinforcement against corrosion and fire.',
      },
      {
        id: 'rebar-coupler',
        name: 'Rebar Coupler',
        category: 'Reinforcement & structural steel',
        categoryId: 'STEEL_STRUCTURAL',
        aliases: ['coupler', 'mechanical rebar coupler', 'rebar splice'],
        specificationFields: [
          { key: 'barSize', label: 'Bar Diameter', options: ['20 mm', '25 mm', '32 mm', '16 mm'] },
          { key: 'threadType', label: 'Threading', options: ['Standard Parallel Thread', 'Transition Coupler (e.g. 25-to-20 mm)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
      },
      {
        id: 'ms-angle',
        name: 'MS Angle',
        category: 'Reinforcement & structural steel',
        categoryId: 'STEEL_STRUCTURAL',
        aliases: ['l angle', 'ms angle', 'angle iron', 'steel angle'],
        specificationFields: [
          { key: 'dimensions', label: 'Leg Dimensions × Thickness', options: ['50 × 50 × 6 mm', '40 × 40 × 5 mm', '65 × 65 × 6 mm', '75 × 75 × 6 mm', '35 × 35 × 5 mm', '25 × 25 × 3 mm'] },
          { key: 'length', label: 'Length', options: ['6 m Commercial Length', '12 m Mill Length'] },
        ],
        defaultUnit: 'kg',
        allowedUnits: ['kg', 'Nos', 'Length'],
        isDecimalAllowed: true,
      },
      {
        id: 'ms-channel',
        name: 'MS Channel (ISMC)',
        category: 'Reinforcement & structural steel',
        categoryId: 'STEEL_STRUCTURAL',
        aliases: ['c channel', 'ismc', 'steel channel'],
        specificationFields: [
          { key: 'designation', label: 'Section Designation', options: ['ISMC 100 (100 × 50 mm)', 'ISMC 75 (75 × 40 mm)', 'ISMC 125 (125 × 65 mm)', 'ISMC 150 (150 × 75 mm)'] },
          { key: 'length', label: 'Length', options: ['6 m Commercial', '11.5–12 m Length'] },
        ],
        defaultUnit: 'kg',
        allowedUnits: ['kg', 'Length', 'Tonne'],
        isDecimalAllowed: true,
      },
      {
        id: 'ms-beam',
        name: 'MS Steel Beam (ISMB / Girder)',
        category: 'Reinforcement & structural steel',
        categoryId: 'STEEL_STRUCTURAL',
        aliases: ['i beam', 'ismb', 'h beam', 'steel girder'],
        specificationFields: [
          { key: 'designation', label: 'Section Designation', options: ['ISMB 150', 'ISMB 200', 'ISMB 250', 'ISMB 300', 'ISMB 100'] },
          { key: 'length', label: 'Length', options: ['12 m Standard', '6 m'] },
        ],
        defaultUnit: 'kg',
        allowedUnits: ['kg', 'Tonne', 'Length'],
        isDecimalAllowed: true,
      },
      {
        id: 'ms-pipe-hollow',
        name: 'MS Square / Rectangular Hollow Section (SHS/RHS)',
        category: 'Reinforcement & structural steel',
        categoryId: 'STEEL_STRUCTURAL',
        aliases: ['square pipe', 'rectangular pipe', 'shs', 'rhs', 'box pipe'],
        specificationFields: [
          { key: 'section', label: 'Section Dimensions × Thickness', options: ['50 × 50 × 2.0 mm', '40 × 40 × 2.0 mm', '80 × 40 × 2.5 mm', '100 × 50 × 3.0 mm', '25 × 25 × 1.6 mm'] },
          { key: 'length', label: 'Standard Length', options: ['6 m Length (20 ft)'] },
        ],
        defaultUnit: 'Length',
        allowedUnits: ['Length', 'kg', 'Nos'],
        isDecimalAllowed: false,
        approvedBrands: ['Tata Structura', 'Apollo Tubes (APL)', 'Jindal'],
      },
      {
        id: 'gi-roofing-sheet',
        name: 'GI / Color-Coated Roofing Sheet',
        category: 'Reinforcement & structural steel',
        categoryId: 'STEEL_STRUCTURAL',
        aliases: ['roofing sheet', 'profile sheet', 'tin sheet', 'asbestos replacement'],
        specificationFields: [
          { key: 'profile', label: 'Profile & Thickness', options: ['Trapezoidal 0.50 mm TCT (Color Coated)', 'Trapezoidal 0.45 mm TCT', 'Corrugated GI 0.50 mm'] },
          { key: 'length', label: 'Sheet Length', options: ['12 ft (3.66 m)', '10 ft (3.05 m)', '14 ft (4.27 m)', '16 ft (4.88 m)'] },
        ],
        defaultUnit: 'Sheet',
        allowedUnits: ['Sheet', 'm²'],
        isDecimalAllowed: false,
        approvedBrands: ['Tata Bluescope', 'JSW Colouron+', 'Essar'],
      },
    ],
  },

  // 3. BRICKS AND BLOCKS
  {
    id: 'BRICKS_BLOCKS',
    name: '3. Bricks & masonry blocks',
    iconName: 'Building',
    description: 'Clay bricks, fly-ash bricks, AAC blocks, concrete solid/hollow blocks, and paver blocks',
    materials: [
      {
        id: 'clay-brick',
        name: 'Country Clay Brick',
        category: 'Bricks & masonry blocks',
        categoryId: 'BRICKS_BLOCKS',
        aliases: ['red brick', 'sengal', 'clay brick', 'table moulded brick', 'wire cut brick'],
        specificationFields: [
          { key: 'type', label: 'Brick Type & Class', options: ['Standard Wire-cut (230 × 110 × 70 mm)', 'Table-moulded 1st Class (9" × 4.25" × 2.75")', 'Chamber Red Brick (Class 3.5)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos', 'Lorry (3000 Nos)', 'Lorry (4000 Nos)'],
        isDecimalAllowed: false,
        conversionNote: 'Actual dimensions: 230 × 110 × 70 mm. Approx 500 bricks per 100 cft of 9" masonry.',
      },
      {
        id: 'fly-ash-brick',
        name: 'Fly-Ash Brick',
        category: 'Bricks & masonry blocks',
        categoryId: 'BRICKS_BLOCKS',
        aliases: ['flyash brick', 'cement brick', 'fly ash'],
        specificationFields: [
          { key: 'strength', label: 'Dimensions & Strength', options: ['230 × 110 × 75 mm (Class 7.5)', '230 × 110 × 75 mm (Class 10)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
      },
      {
        id: 'aac-block',
        name: 'AAC Lightweight Block',
        category: 'Bricks & masonry blocks',
        categoryId: 'BRICKS_BLOCKS',
        aliases: ['aac block', 'siporex', 'aerated block', 'lightweight block'],
        specificationFields: [
          { key: 'size', label: 'Length × Height × Thickness', options: ['600 × 200 × 150 mm (6" Block - External Walls)', '600 × 200 × 100 mm (4" Block - Internal Partitions)', '600 × 200 × 200 mm (8" Block - Heavy Wall)'] },
          { key: 'density', label: 'Grade / Density', options: ['Grade 1 (550-650 kg/m³)', 'Grade 2'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos', 'm³'],
        isDecimalAllowed: false,
        conversionNote: 'For 600×200×150 mm block: 1 m³ = ~55.5 blocks. For 600×200×100 mm block: 1 m³ = ~83.3 blocks.',
        approvedBrands: ['Siporex', 'Magicrete', 'Aerocon', 'Biltech', 'Renaissance'],
      },
      {
        id: 'solid-concrete-block',
        name: 'Solid Concrete Block',
        category: 'Bricks & masonry blocks',
        categoryId: 'BRICKS_BLOCKS',
        aliases: ['solid block', 'cement solid block'],
        specificationFields: [
          { key: 'size', label: 'Dimensions', options: ['400 × 200 × 150 mm (6" Solid Block)', '400 × 200 × 100 mm (4" Solid Block)', '400 × 200 × 200 mm (8" Solid Block)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
      },
      {
        id: 'paver-block',
        name: 'Interlocking Paver Block',
        category: 'Bricks & masonry blocks',
        categoryId: 'BRICKS_BLOCKS',
        aliases: ['paver block', 'interlocking paver', 'parking tile', 'driveway block'],
        specificationFields: [
          { key: 'thickness', label: 'Thickness & Grade', options: ['60 mm (M30 - Light Vehicles/Parking)', '80 mm (M40 - Heavy Trucks/Driveway)', '100 mm (M50 - Industrial)'] },
          { key: 'shape', label: 'Shape & Pattern', options: ['Zig-Zag (Uni-paver)', 'I-Shape (Dumbbell)', 'Hexagonal'] },
          { key: 'color', label: 'Color', options: ['Grey Natural', 'Red / Terracotta', 'Yellow', 'Dual Tone'] },
        ],
        defaultUnit: 'sqft',
        allowedUnits: ['sqft', 'm²', 'Nos'],
        isDecimalAllowed: true,
        conversionNote: 'Approx 3.6 to 4 pieces per sq.ft depending on shape.',
      },
    ],
  },

  // 4. SHUTTERING AND CURING MATERIALS
  {
    id: 'SHUTTERING_CURING',
    name: '4. Shuttering & curing materials',
    iconName: 'Layers',
    description: 'Plywood, timber battens, steel plates, adjustable props, scaffolding, tie rods, and curing aids',
    materials: [
      {
        id: 'shuttering-plywood',
        name: 'Film-Faced Shuttering Plywood',
        category: 'Shuttering & curing materials',
        categoryId: 'SHUTTERING_CURING',
        aliases: ['shuttering ply', 'film face ply', 'centering sheet', 'plywood sheet'],
        specificationFields: [
          { key: 'thickness', label: 'Thickness & Density', options: ['12 mm (30 kg / 34 kg Mirror Finish)', '18 mm (Heavy Duty Slab & Wall)'] },
          { key: 'dimensions', label: 'Sheet Dimensions', options: ['8 × 4 ft (2440 × 1220 mm)'] },
        ],
        defaultUnit: 'Sheet',
        allowedUnits: ['Sheet'],
        isDecimalAllowed: false,
        conversionNote: '1 Sheet = 32 sq.ft. Reuse lifespan depends on careful oiling & edge sealing.',
        approvedBrands: ['Century Ply Film-face', 'Greenply', 'Kitply', 'Action Tesa'],
      },
      {
        id: 'timber-runner',
        name: 'Timber Runner / Wood Batten',
        category: 'Shuttering & curing materials',
        categoryId: 'SHUTTERING_CURING',
        aliases: ['silver wood', 'runner', 'centering wood', 'batten', 'wood reeper'],
        specificationFields: [
          { key: 'species', label: 'Species & Quality', options: ['Silver Wood (Standard Centering)', 'Pine Wood', 'Country Hardwood'] },
          { key: 'crossSection', label: 'Cross Section × Length', options: ['2" × 3" × 10 ft', '2" × 3" × 8 ft', '3" × 4" × 10 ft (Heavy Runner)', '1.5" × 2" × 8 ft (Reeper)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos', 'cft'],
        isDecimalAllowed: false,
      },
      {
        id: 'adjustable-prop',
        name: 'Adjustable Steel Prop (Jack)',
        category: 'Shuttering & curing materials',
        categoryId: 'SHUTTERING_CURING',
        aliases: ['prop jack', 'centering prop', 'iron jack', 'telescopic prop'],
        specificationFields: [
          { key: 'height', label: 'Height Extension Range', options: ['2.0 m – 3.6 m (Standard Floor)', '3.0 m – 4.5 m (High Ceiling)', '1.5 m – 2.5 m (Short)'] },
          { key: 'type', label: 'Inventory Type', options: ['Rental Item (Track Returns)', 'Company Owned Consumable'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
      },
      {
        id: 'steel-shuttering-plate',
        name: 'Steel Shuttering Plate',
        category: 'Shuttering & curing materials',
        categoryId: 'SHUTTERING_CURING',
        aliases: ['shuttering sheet', 'iron plate', 'centering plate'],
        specificationFields: [
          { key: 'dimensions', label: 'Dimensions', options: ['900 × 600 mm (3 × 2 ft)', '1200 × 600 mm (4 × 2 ft)', '900 × 300 mm (Column plate)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos', 'sqft'],
        isDecimalAllowed: false,
      },
      {
        id: 'shuttering-oil',
        name: 'Shuttering Mould Release Oil',
        category: 'Shuttering & curing materials',
        categoryId: 'SHUTTERING_CURING',
        aliases: ['shuttering oil', 'mould release agent', 'centering oil'],
        specificationFields: [
          { key: 'pack', label: 'Pack Size', options: ['200 L Barrel', '20 L Can', '50 L Drum'] },
        ],
        defaultUnit: 'L',
        allowedUnits: ['L', 'Barrel (200L)'],
        isDecimalAllowed: true,
        approvedBrands: ['Fosroc Reebol', 'Dr. Fixit Mould Release', 'Sika Separol'],
      },
      {
        id: 'curing-cloth-hessian',
        name: 'Hessian / Jute Curing Cloth',
        category: 'Shuttering & curing materials',
        categoryId: 'SHUTTERING_CURING',
        aliases: ['hessian cloth', 'gunny bag cloth', 'jute curing cloth', 'curing roll'],
        specificationFields: [
          { key: 'width', label: 'Width & Roll Size', options: ['1 m Width × 50 m Roll', '1.2 m Width × 50 m Roll'] },
        ],
        defaultUnit: 'Roll',
        allowedUnits: ['Roll', 'm²'],
        isDecimalAllowed: false,
      },
      {
        id: 'polythene-sheet',
        name: 'Polythene Curing / Moisture Sheet',
        category: 'Shuttering & curing materials',
        categoryId: 'SHUTTERING_CURING',
        aliases: ['plastic sheet', 'ldpe sheet', 'tarpaulin thin', 'vapor barrier'],
        specificationFields: [
          { key: 'thickness', label: 'Micron Thickness', options: ['200 Micron (Heavy Duty)', '150 Micron (Standard)', '250 Micron (Raft Barrier)'] },
        ],
        defaultUnit: 'Roll',
        allowedUnits: ['Roll', 'kg', 'm²'],
        isDecimalAllowed: false,
      },
    ],
  },

  // 5. WATERPROOFING AND CHEMICALS
  {
    id: 'CHEMICALS_WATERPROOFING',
    name: '5. Waterproofing & construction chemicals',
    iconName: 'Droplet',
    description: 'Admixtures, coatings, PU membranes, non-shrink grouts, repair mortars, tile adhesives & grouts',
    materials: [
      {
        id: 'integral-waterproofing-admixture',
        name: 'Integral Liquid Waterproofing Admixture',
        category: 'Waterproofing & construction chemicals',
        categoryId: 'CHEMICALS_WATERPROOFING',
        aliases: ['dr fixit', '101 lw', 'waterproofing chemical', 'admixture'],
        specificationFields: [
          { key: 'dosage', label: 'Specification & Pack', options: ['20 L Can (200 ml per 50 kg cement bag)', '5 L Can', '1 L Bottle', '200 L Drum'] },
        ],
        defaultUnit: 'L',
        allowedUnits: ['L'],
        isDecimalAllowed: true,
        conversionNote: 'Standard dosage: 200 ml per 50 kg bag of cement for RCC & plastering.',
        approvedBrands: ['Dr. Fixit 101 LW+', 'Fosroc Conplast WL', 'Sika Plastocrete Plus'],
      },
      {
        id: 'cementitious-waterproof-coating',
        name: '2-Component Cementitious Waterproofing',
        category: 'Waterproofing & construction chemicals',
        categoryId: 'CHEMICALS_WATERPROOFING',
        aliases: ['2k waterproofing', 'brush topping', 'toilet waterproofing', 'sunken slab coating'],
        specificationFields: [
          { key: 'pack', label: 'Kit Net Weight', options: ['15 kg Kit (10kg Powder + 5kg Polymer)', '30 kg Commercial Kit'] },
        ],
        defaultUnit: 'Kit',
        allowedUnits: ['Kit', 'kg'],
        isDecimalAllowed: false,
        conversionNote: 'Used in sunken slabs, podiums, and water tanks in 2 coats with mesh.',
        approvedBrands: ['Dr. Fixit Fastflex', 'Fosroc Brushbond', 'SikaTop Seal-107'],
      },
      {
        id: 'non-shrink-grout',
        name: 'High-Strength Non-Shrink Grout',
        category: 'Waterproofing & construction chemicals',
        categoryId: 'CHEMICALS_WATERPROOFING',
        aliases: ['gp2', 'non shrink grout', 'column base grout', 'precision grout'],
        specificationFields: [
          { key: 'grade', label: 'Product Grade & Pack', options: ['Free-flow Precision Grout (25 kg Bag - Compressive strength > 60 MPa)'] },
        ],
        defaultUnit: 'Bag',
        allowedUnits: ['Bag', 'kg'],
        isDecimalAllowed: false,
        packSize: '25 kg / bag',
        approvedBrands: ['Fosroc Conbextra GP2', 'SikaGrout-214', 'Dr. Fixit MasterGrout'],
      },
      {
        id: 'tile-adhesive',
        name: 'Tile Adhesive Mortar',
        category: 'Waterproofing & construction chemicals',
        categoryId: 'CHEMICALS_WATERPROOFING',
        aliases: ['tile adhesive', 'tile chemical', 'vitrified tile glue', 'granite adhesive'],
        specificationFields: [
          { key: 'grade', label: 'Adhesive Class & Substrate', options: ['Type 2 (IS 15477 - Vitrified floor/wall interior)', 'Type 3 / C2TE (Heavy Granite/Exterior/Tile-on-Tile)', 'Type 1 (Ceramic Wall Tile)'] },
          { key: 'pack', label: 'Pack Weight', options: ['20 kg Bag'] },
        ],
        defaultUnit: 'Bag',
        allowedUnits: ['Bag', 'kg'],
        isDecimalAllowed: false,
        packSize: '20 kg / bag',
        conversionNote: 'Coverage: approx 40 to 50 sq.ft per 20 kg bag with a 6mm notch trowel.',
        approvedBrands: ['Roff New Construction Tile Adhesive', 'Laticrete 111 / 252', 'Weber Saint-Gobain', 'Dr. Fixit Fevimate TL'],
      },
      {
        id: 'tile-grout',
        name: 'Tile Joint Grout',
        category: 'Waterproofing & construction chemicals',
        categoryId: 'CHEMICALS_WATERPROOFING',
        aliases: ['tile grout', 'epoxy grout', 'cement tile grout'],
        specificationFields: [
          { key: 'type', label: 'Grout Chemistry & Pack', options: ['Epoxy 3-Part Stainfree Grout (1 kg Kit)', 'Epoxy Grout (5 kg Commercial Kit)', 'Polymerized Cementitious Grout (1 kg Pouch)'] },
          { key: 'color', label: 'Color Shade', options: ['White / Ivory', 'Light Grey', 'Dark Grey', 'Beige / Cream'] },
        ],
        defaultUnit: 'Kit',
        allowedUnits: ['Kit', 'kg'],
        isDecimalAllowed: false,
        approvedBrands: ['Laticrete SpectraLOCK', 'Roff Rainbow Tile Mate', 'Weber Joint Epoxy'],
      },
    ],
  },

  // 6. PLUMBING AND DRAINAGE
  {
    id: 'PLUMBING_DRAINAGE',
    name: '6. Plumbing, pipes & drainage fittings',
    iconName: 'Wrench',
    description: 'CPVC, uPVC, SWR, underground drainage pipes, elbows, tees, valves, and water tanks',
    materials: [
      {
        id: 'cpvc-pipe',
        name: 'CPVC Hot & Cold Water Supply Pipe',
        category: 'Plumbing, pipes & drainage fittings',
        categoryId: 'PLUMBING_DRAINAGE',
        aliases: ['cpvc pipe', 'hot water pipe', 'water supply pipe'],
        specificationFields: [
          { key: 'size', label: 'Nominal Size & SDR', options: ['20 mm (¾" SDR 11)', '25 mm (1" SDR 11)', '32 mm (1¼" SDR 11)', '40 mm (1½" SDR 11)', '50 mm (2" SDR 11)', '15 mm (½" SDR 11)'] },
          { key: 'length', label: 'Pipe Length', options: ['3 m Length (10 ft)', '5 m Length'] },
        ],
        defaultUnit: 'Length',
        allowedUnits: ['Length', 'm'],
        isDecimalAllowed: false,
        approvedBrands: ['Astral CPVC Pro', 'Ashirvad FlowGuard Plus', 'Supreme Lifeline', 'Finolex'],
      },
      {
        id: 'cpvc-elbow',
        name: 'CPVC Pipe Elbow (90° / 45°)',
        category: 'Plumbing, pipes & drainage fittings',
        categoryId: 'PLUMBING_DRAINAGE',
        aliases: ['cpvc elbow', 'elbow 90', 'elbow 45', 'bend cpvc'],
        specificationFields: [
          { key: 'size', label: 'Size', options: ['20 mm (¾")', '25 mm (1")', '32 mm (1¼")', '40 mm (1½")', '50 mm (2")', '15 mm (½")'] },
          { key: 'angle', label: 'Angle', options: ['90° Standard Elbow', '45° Elbow'] },
          { key: 'brass', label: 'Type', options: ['Plain Solvent Weld', 'Brass Threaded Female Elbow (½" thread for taps)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
        approvedBrands: ['Astral', 'Ashirvad', 'Supreme'],
      },
      {
        id: 'cpvc-tee',
        name: 'CPVC Pipe Tee',
        category: 'Plumbing, pipes & drainage fittings',
        categoryId: 'PLUMBING_DRAINAGE',
        aliases: ['cpvc tee', 'equal tee', 'reducing tee', 'brass tee'],
        specificationFields: [
          { key: 'size', label: 'Size', options: ['20 mm (¾") Equal', '25 mm (1") Equal', '25 × 20 mm Reducing', '32 × 25 mm Reducing', '20 mm Brass Threaded Tee'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
        approvedBrands: ['Astral', 'Ashirvad', 'Supreme'],
      },
      {
        id: 'pvc-swr-pipe',
        name: 'PVC SWR Drainage Pipe (Soil & Waste)',
        category: 'Plumbing, pipes & drainage fittings',
        categoryId: 'PLUMBING_DRAINAGE',
        aliases: ['swr pipe', 'drainage pipe', 'pvc waste pipe', 'sewer pipe', '110mm pipe', '75mm pipe'],
        specificationFields: [
          { key: 'diameter', label: 'Diameter & Type', options: ['110 mm (4" Type B - Soil/Toilet Waste)', '75 mm (3" Type A - Rainwater & Kitchen)', '160 mm (6" Soil Header Pipe)'] },
          { key: 'joint', label: 'Joint Type & Length', options: ['3 m Length (Ringfit / Rubber Ring)', '3 m Length (Solvent Weld Socket)'] },
        ],
        defaultUnit: 'Length',
        allowedUnits: ['Length', 'm'],
        isDecimalAllowed: false,
        approvedBrands: ['Astral Silencio', 'Supreme Drainite', 'Ashirvad SWR', 'Finolex'],
      },
      {
        id: 'ball-valve',
        name: 'Full-Bore Ball Valve / Concealed Stop Cock',
        category: 'Plumbing, pipes & drainage fittings',
        categoryId: 'PLUMBING_DRAINAGE',
        aliases: ['ball valve', 'control valve', 'main valve', 'water shutoff valve'],
        specificationFields: [
          { key: 'size', label: 'Valve Size & Material', options: ['25 mm (1" CPVC Ball Valve)', '32 mm (1¼" CPVC Ball Valve)', '40 mm (1½" CPVC Ball Valve)', '50 mm (2" CPVC Main Line Valve)', '20 mm (¾" Brass Concealed Valve)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
        approvedBrands: ['Astral', 'Ashirvad', 'Zoloto', 'Leader'],
      },
      {
        id: 'overhead-water-tank',
        name: 'Overhead Plastic Water Tank',
        category: 'Plumbing, pipes & drainage fittings',
        categoryId: 'PLUMBING_DRAINAGE',
        aliases: ['sintex tank', 'water tank', 'overhead tank', 'syntax'],
        specificationFields: [
          { key: 'capacity', label: 'Capacity & Layers', options: ['1000 Litres (4 Layer Anti-bacterial UV)', '1500 Litres (4 Layer)', '2000 Litres (4 Layer)', '500 Litres (3 Layer)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
        approvedBrands: ['Sintex Pure', 'Supreme Silo', 'Vectus', 'Ashirvad'],
      },
      {
        id: 'solvent-cement',
        name: 'Solvent Cement',
        category: 'Plumbing, pipes & drainage fittings',
        categoryId: 'PLUMBING_DRAINAGE',
        aliases: ['solvent', 'pipe gum', 'cpvc glue', 'pvc adhesive'],
        specificationFields: [
          { key: 'type', label: 'System & Volume', options: ['CPVC Heavy-Duty Orange/Clear (500 ml Tin)', 'CPVC Heavy-Duty (250 ml Tin)', 'uPVC / SWR Clear Solvent (500 ml Tin)'] },
        ],
        defaultUnit: 'Tin',
        allowedUnits: ['Tin', 'Nos'],
        isDecimalAllowed: false,
        approvedBrands: ['Astral Weld-On', 'Supreme', 'Ashirvad'],
      },
    ],
  },

  // 7. ELECTRICAL MATERIALS
  {
    id: 'ELECTRICAL',
    name: '7. Electrical conduit, wires & switchgear',
    iconName: 'Zap',
    description: 'Building wires, power cables, PVC conduits, modular switches, MCBs, DBs, and earthing',
    materials: [
      {
        id: 'copper-building-wire',
        name: 'FR / FRLS Copper Building Wire',
        category: 'Electrical conduit, wires & switchgear',
        categoryId: 'ELECTRICAL',
        aliases: ['wire coil', 'copper wire', 'house wire', '1.5 sqmm wire', '2.5 sqmm wire', 'polycab wire'],
        specificationFields: [
          { key: 'crossSection', label: 'Conductor Size', options: ['1.5 sq mm (Lighting & Fan Circuits)', '2.5 sq mm (Power Outlets & Geysers)', '4.0 sq mm (AC & Kitchen Power)', '1.0 sq mm (Inverter / Earthing / Low current)', '6.0 sq mm (Main Sub-feeder)', '10.0 sq mm (Main Incomer)'] },
          { key: 'color', label: 'Insulation Color', options: ['Red (Phase)', 'Black (Neutral)', 'Green (Earth)', 'Blue (Phase 2)', 'Yellow (Phase 3)'] },
          { key: 'pack', label: 'Length Specification', options: ['90 m Standard Coil'] },
        ],
        defaultUnit: 'Coil',
        allowedUnits: ['Coil', 'm'],
        isDecimalAllowed: false,
        packSize: '90 m / coil',
        approvedBrands: ['Havells LifeLine Plus', 'Polycab Green Wire', 'Finolex FRLS', 'RR Kabel'],
      },
      {
        id: 'pvc-electrical-conduit',
        name: 'Rigid PVC Electrical Conduit Pipe',
        category: 'Electrical conduit, wires & switchgear',
        categoryId: 'ELECTRICAL',
        aliases: ['conduit pipe', 'pvc electrical pipe', 'conduit 25mm', '20mm pipe'],
        specificationFields: [
          { key: 'size', label: 'Diameter & Duty Class', options: ['25 mm (1" Heavy Duty - Slab Casting Concealed)', '20 mm (¾" Medium Duty - Wall Chasing)', '32 mm (1¼" Heavy Feeder Conduit)'] },
          { key: 'length', label: 'Pipe Length', options: ['3 m Length (10 ft)'] },
        ],
        defaultUnit: 'Length',
        allowedUnits: ['Length', 'Bundle (25 pcs)'],
        isDecimalAllowed: false,
        approvedBrands: ['VIP', 'Precision', 'Finolex', 'Sudhakar'],
      },
      {
        id: 'modular-switch',
        name: 'Modular Switch & Socket',
        category: 'Electrical conduit, wires & switchgear',
        categoryId: 'ELECTRICAL',
        aliases: ['modular switch', 'plug point', '16a socket', '6a switch', 'switch plate'],
        specificationFields: [
          { key: 'rating', label: 'Component & Rating', options: ['6A 1-Way Modular Switch (1M)', '16A Power Switch with Indicator (1M)', '6/16A Combined Shuttered Socket (2M)', 'Fan Speed Step Regulator (1M)', '25A AC Starter / DP Switch (2M)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
        approvedBrands: ['Legrand Arteor / Mylinc', 'Schneider Opale / Livia', 'Anchor Roma', 'Havells Fabio'],
      },
      {
        id: 'mcb-switchgear',
        name: 'Miniature Circuit Breaker (MCB)',
        category: 'Electrical conduit, wires & switchgear',
        categoryId: 'ELECTRICAL',
        aliases: ['mcb', 'breaker', 'single pole mcb', 'tpn mcb', 'circuit breaker'],
        specificationFields: [
          { key: 'rating', label: 'Current Rating & Curve', options: ['C16 SP 10kA (Power circuits)', 'C10 SP 10kA (Lighting circuits)', 'C20 SP 10kA (Air conditioners)', 'C32 DP 10kA (Main residential DP)', 'C40 TPN 10kA (3-Phase Incomer)', 'C63 4P 10kA'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
        approvedBrands: ['Schneider Acti9', 'Legrand DX3', 'Hager', 'Havells'],
      },
      {
        id: 'rccb-elcb',
        name: 'Residual Current Circuit Breaker (RCCB / ELCB)',
        category: 'Electrical conduit, wires & switchgear',
        categoryId: 'ELECTRICAL',
        aliases: ['rccb', 'elcb', 'shock protector', 'earth leakage breaker'],
        specificationFields: [
          { key: 'rating', label: 'Poles & Sensitivity', options: ['40A 2P 30mA (Human Safety - Residential)', '63A 4P 30mA (3-Phase Safety)', '40A 2P 100mA (Fire Protection)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
        approvedBrands: ['Schneider', 'Legrand', 'Hager'],
      },
      {
        id: 'chemical-earthing-electrode',
        name: 'Chemical Earthing Pipe & Compound',
        category: 'Electrical conduit, wires & switchgear',
        categoryId: 'ELECTRICAL',
        aliases: ['earthing rod', 'chemical earthing', 'earthing pipe', 'earthing compound'],
        specificationFields: [
          { key: 'type', label: 'Electrode Specification', options: ['Copper Bonded 17.2 mm × 3.0 m (250 micron coating)', 'GI Pipe-in-Pipe Electrode 50 mm × 3.0 m', 'Backfill Compound (BFC 25 kg Bag)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos', 'Bag'],
        isDecimalAllowed: false,
      },
    ],
  },

  // 8. FLOORING, FINISHES AND PAINTING
  {
    id: 'FINISHES_PAINTING',
    name: '8. Flooring, wall tiles, putty & paint',
    iconName: 'Paintbrush',
    description: 'Vitrified tiles, granite slabs, wall putty, primers, interior/exterior emulsions, and enamels',
    materials: [
      {
        id: 'floor-tile',
        name: 'Vitrified Floor Tile',
        category: 'Flooring, wall tiles, putty & paint',
        categoryId: 'FINISHES_PAINTING',
        aliases: ['floor tiles', 'vitrified tiles', 'gvt tile', '2x2 tiles', '4x2 tiles', 'granite tile'],
        specificationFields: [
          { key: 'size', label: 'Tile Dimensions', options: ['600 × 600 mm (2 × 2 ft GVT)', '1200 × 600 mm (4 × 2 ft PGVT)', '800 × 800 mm (Double Charge)', '300 × 300 mm (Anti-Skid Bathroom)'] },
          { key: 'finish', label: 'Surface Finish', options: ['Polished Glazed (Glossy)', 'Matte / Satin Finish', 'Carving / Rustic Anti-Skid'] },
        ],
        defaultUnit: 'Box',
        allowedUnits: ['Box', 'sqft', 'm²'],
        isDecimalAllowed: false,
        conversionNote: '600×600 mm: 1 Box = 4 tiles (15.5 sq.ft). 1200×600 mm: 1 Box = 2 tiles (15.5 sq.ft).',
        approvedBrands: ['Kajaria', 'Somany', 'Simpolo', 'Nitco', 'Johnson'],
      },
      {
        id: 'wall-tile',
        name: 'Glazed Ceramic Wall Tile',
        category: 'Flooring, wall tiles, putty & paint',
        categoryId: 'FINISHES_PAINTING',
        aliases: ['wall tiles', 'bathroom tiles', 'kitchen dado tiles', 'ceramic tiles'],
        specificationFields: [
          { key: 'size', label: 'Dimensions', options: ['300 × 450 mm (12 × 18 inch)', '300 × 600 mm (12 × 24 inch)', '300 × 300 mm'] },
          { key: 'finish', label: 'Finish', options: ['Glossy Kitchen/Bathroom Wall', 'Matte Finish'] },
        ],
        defaultUnit: 'Box',
        allowedUnits: ['Box', 'sqft'],
        isDecimalAllowed: false,
        packSize: '6 to 8 pcs / box',
        approvedBrands: ['Kajaria', 'Somany', 'Johnson'],
      },
      {
        id: 'granite-slab',
        name: 'Polished Granite Stone Slab',
        category: 'Flooring, wall tiles, putty & paint',
        categoryId: 'FINISHES_PAINTING',
        aliases: ['granite', 'black galaxy', 'kitchen countertop', 'granite slab', 'staircase stone'],
        specificationFields: [
          { key: 'variety', label: 'Granite Variety & Thickness', options: ['Jet Black / Telephone Black (18 mm Pre-polished)', 'Black Galaxy (18 mm with gold specks)', 'Tan Brown / Steel Grey (18 mm)', 'Kashmir White / Tan (18 mm)'] },
          { key: 'application', label: 'Application', options: ['Kitchen Counter Top (Moulded Edge)', 'Staircase Steps & Risers', 'Window Sill / Door Jamb Capping'] },
        ],
        defaultUnit: 'sqft',
        allowedUnits: ['sqft', 'm²'],
        isDecimalAllowed: true,
      },
      {
        id: 'wall-putty',
        name: 'White Cement Wall Putty',
        category: 'Flooring, wall tiles, putty & paint',
        categoryId: 'FINISHES_PAINTING',
        aliases: ['putty', 'birla putty', 'jk wallmax', 'wall putty bag'],
        specificationFields: [
          { key: 'pack', label: 'Pack Weight', options: ['40 kg Bag', '20 kg Bag', '5 kg Bag'] },
          { key: 'type', label: 'Polymer Type', options: ['Water-Resistant White Cement Base', 'Acrylic Putty'] },
        ],
        defaultUnit: 'Bag',
        allowedUnits: ['Bag', 'kg'],
        isDecimalAllowed: false,
        packSize: '40 kg / bag',
        conversionNote: '1 kg covers approx 10 to 14 sq.ft in 2 coats over plastered walls.',
        approvedBrands: ['Birla White WallSeal', 'JK WallMaxx', 'Asian Paints TruCare Putty'],
      },
      {
        id: 'wall-primer',
        name: 'Interior / Exterior Wall Primer',
        category: 'Flooring, wall tiles, putty & paint',
        categoryId: 'FINISHES_PAINTING',
        aliases: ['primer', 'wall primer', 'exterior primer', 'primer 20l'],
        specificationFields: [
          { key: 'type', label: 'Surface Type', options: ['Interior Water-Based Wall Primer', 'Exterior Weather-Proof Primer', 'Red Oxide Metal Primer'] },
          { key: 'volume', label: 'Pack Volume', options: ['20 Litre Drum', '10 Litre Bucket', '4 Litre Can', '1 Litre Can'] },
        ],
        defaultUnit: 'L',
        allowedUnits: ['L', 'Bucket (20L)'],
        isDecimalAllowed: true,
        approvedBrands: ['Asian Paints Decoprime', 'Berger BP Primer', 'Nerolac'],
      },
      {
        id: 'interior-emulsion',
        name: 'Interior Wall Emulsion Paint',
        category: 'Flooring, wall tiles, putty & paint',
        categoryId: 'FINISHES_PAINTING',
        aliases: ['interior paint', 'royale paint', 'tractor emulsion', 'wall colour'],
        specificationFields: [
          { key: 'productGrade', label: 'Quality Range', options: ['Luxury High-Sheen (Royale Luxury / Silk)', 'Premium Smooth Emulsion (Apcolite / Easy Clean)', 'Economy Standard Emulsion (Tractor Emulsion)'] },
          { key: 'pack', label: 'Pack Volume', options: ['20 Litres', '10 Litres', '4 Litres', '1 Litre'] },
        ],
        defaultUnit: 'L',
        allowedUnits: ['L'],
        isDecimalAllowed: true,
        approvedBrands: ['Asian Paints Royale', 'Berger Silk', 'Dulux Velvet Touch'],
      },
      {
        id: 'exterior-emulsion',
        name: 'Exterior Weatherproof Emulsion',
        category: 'Flooring, wall tiles, putty & paint',
        categoryId: 'FINISHES_PAINTING',
        aliases: ['exterior paint', 'apex paint', 'weatherproof paint', 'outdoor paint'],
        specificationFields: [
          { key: 'productGrade', label: 'Product Range', options: ['High-Performance Dirt-Resistant (Apex Ultima Protek)', 'Standard Weatherproof (Apex Emulsion)', 'Economy Ace Exterior'] },
          { key: 'pack', label: 'Pack Volume', options: ['20 Litres', '10 Litres', '4 Litres'] },
        ],
        defaultUnit: 'L',
        allowedUnits: ['L'],
        isDecimalAllowed: true,
        approvedBrands: ['Asian Paints Apex Ultima', 'Berger WeatherCoat Anti-Dust', 'Dulux Weathershield'],
      },
    ],
  },

  // 9. DOORS, WINDOWS, INTERIORS AND SANITARY FITTINGS
  {
    id: 'DOORS_WINDOWS_SANITARY',
    name: '9. Doors, windows, plywood & sanitaryware',
    iconName: 'DoorOpen',
    description: 'Door frames, shutters, uPVC windows, commercial/waterproof plywood, WCs, basins, and CP taps',
    materials: [
      {
        id: 'door-frame',
        name: 'Solid Wood / WPC Door Frame',
        category: 'Doors, windows, plywood & sanitaryware',
        categoryId: 'DOORS_WINDOWS_SANITARY',
        aliases: ['door frame', 'nilavu', 'door chaukhat', 'teak frame'],
        specificationFields: [
          { key: 'material', label: 'Frame Material', options: ['Teak Wood (1st Quality Burma / CP)', 'Sal Wood (4" × 2.5")', 'WPC Polymer Waterproof Frame (4" × 2.5")', 'Country Hardwood'] },
          { key: 'openingSize', label: 'Clear Opening Dimensions', options: ['Main Door: 3.5 × 7.0 ft (1050 × 2100 mm)', 'Bedroom: 3.0 × 7.0 ft (900 × 2100 mm)', 'Toilet: 2.5 × 7.0 ft (750 × 2100 mm)'] },
        ],
        defaultUnit: 'Set',
        allowedUnits: ['Set', 'Nos'],
        isDecimalAllowed: false,
      },
      {
        id: 'door-shutter',
        name: 'Flush Door Shutter',
        category: 'Doors, windows, plywood & sanitaryware',
        categoryId: 'DOORS_WINDOWS_SANITARY',
        aliases: ['flush door', 'door leaf', 'waterproof door', 'membrane door'],
        specificationFields: [
          { key: 'core', label: 'Thickness & Grade', options: ['30 mm Waterproof BWP Flush Door', '35 mm Solid Core Flush Door', '30 mm Commercial MR Flush Door'] },
          { key: 'size', label: 'Dimensions', options: ['3.0 × 7.0 ft (900 × 2100 mm)', '3.25 × 7.0 ft (975 × 2100 mm)', '2.5 × 7.0 ft (750 × 2100 mm - Bathroom)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
        approvedBrands: ['Century Doors', 'Greenply', 'Merino', 'Kutty Flush Doors'],
      },
      {
        id: 'commercial-plywood',
        name: 'Plywood Sheet (MR / BWR / BWP Marine)',
        category: 'Doors, windows, plywood & sanitaryware',
        categoryId: 'DOORS_WINDOWS_SANITARY',
        aliases: ['plywood', 'marine ply', 'bwp ply', 'commercial ply', '18mm ply'],
        specificationFields: [
          { key: 'grade', label: 'Bonding Grade', options: ['BWP 710 Marine Grade (Boiling Water Proof)', 'BWR Grade (Boiling Water Resistant - Kitchen)', 'MR Grade (Commercial Moisture Resistant - Wardrobes)'] },
          { key: 'thickness', label: 'Thickness', options: ['18 mm', '12 mm', '16 mm', '6 mm', '9 mm'] },
          { key: 'dimensions', label: 'Sheet Size', options: ['8 × 4 ft (2440 × 1220 mm)'] },
        ],
        defaultUnit: 'Sheet',
        allowedUnits: ['Sheet', 'sqft'],
        isDecimalAllowed: false,
        conversionNote: '1 Sheet = 32 sq.ft.',
        approvedBrands: ['CenturyPly Club Prime', 'Green Club Platinum', 'Austin Plywood', 'Kitply'],
      },
      {
        id: 'water-closet-ewc',
        name: 'European Water Closet (EWC / Toilet)',
        category: 'Doors, windows, plywood & sanitaryware',
        categoryId: 'DOORS_WINDOWS_SANITARY',
        aliases: ['ewc', 'commode', 'toilet bowl', 'western toilet', 'wall hung ewc'],
        specificationFields: [
          { key: 'type', label: 'Mounting & Flushing', options: ['Wall-Hung with Soft Close Seat (Blind installation)', 'Floor-Mounted Rimless Single-Piece EWC (S-Trap 220mm)', 'Two-Piece Coupled Closet (P-Trap)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos', 'Set'],
        isDecimalAllowed: false,
        approvedBrands: ['Jaquar', 'Hindware', 'Kohler', 'Cera', 'Parryware'],
      },
      {
        id: 'wash-basin',
        name: 'Ceramic Wash Basin',
        category: 'Doors, windows, plywood & sanitaryware',
        categoryId: 'DOORS_WINDOWS_SANITARY',
        aliases: ['basin', 'sink wash', 'counter basin', 'hand wash basin'],
        specificationFields: [
          { key: 'type', label: 'Basin Style', options: ['Table-Top Counter Basin (Rectangular 550 × 400 mm)', 'Under-Counter Oval Basin', 'Wall-Hung Basin with Full Pedestal'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
        approvedBrands: ['Jaquar', 'Kohler', 'Hindware', 'Cera'],
      },
      {
        id: 'cp-bathroom-faucets',
        name: 'Chrome Plated Bathroom Taps & Mixer',
        category: 'Doors, windows, plywood & sanitaryware',
        categoryId: 'DOORS_WINDOWS_SANITARY',
        aliases: ['taps', 'mixer', 'wall mixer', 'diverter', 'shower tap'],
        specificationFields: [
          { key: 'fittingType', label: 'Fitting Type', options: ['Single Lever Concealed Diverter (High Flow 3-Inlet)', 'Wall Mixer 3-in-1 with Provision for Overhead Shower', 'Pillar Tap (Quarter Turn for Wash Basin)', 'Bib Tap with Wall Flange (Two-Way for Health Faucet)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos', 'Set'],
        isDecimalAllowed: false,
        approvedBrands: ['Jaquar Alive / Florentine', 'Grohe', 'Kohler', 'Cera'],
      },
    ],
  },

  // 10. CONSUMABLES AND SAFETY
  {
    id: 'CONSUMABLES_SAFETY',
    name: '10. Site consumables & safety equipment',
    iconName: 'ShieldAlert',
    description: 'Abrasive discs, welding rods, safety helmets, safety shoes, harnesses, nets, and tarpaulin',
    materials: [
      {
        id: 'cutting-grinding-disc',
        name: 'Abrasive Cutting / Grinding Wheel',
        category: 'Site consumables & safety equipment',
        categoryId: 'CONSUMABLES_SAFETY',
        aliases: ['cutting blade', 'grinding disc', 'metal cutting wheel', '4 inch blade'],
        specificationFields: [
          { key: 'purpose', label: 'Wheel Purpose & Size', options: ['4" Metal / Rebar Cutting Wheel (107 × 1.2 mm)', '4" Marble & Concrete Diamond Blade', '4" Metal Grinding Disc (6 mm thick)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos', 'Box (25 Nos)', 'Box (50 Nos)'],
        isDecimalAllowed: false,
        approvedBrands: ['Bosch', 'Norton', 'DeWalt', 'Elephant'],
      },
      {
        id: 'welding-electrode',
        name: 'Mild Steel Welding Electrode',
        category: 'Site consumables & safety equipment',
        categoryId: 'CONSUMABLES_SAFETY',
        aliases: ['welding rod', 'electrodes', 'welding stick', '6013 rod'],
        specificationFields: [
          { key: 'size', label: 'Diameter & AWS Class', options: ['3.15 mm (AWS E6013 - Heavy Structural)', '2.5 mm (AWS E6013 - Sheet & Light Fab)', '4.0 mm Heavy Duty'] },
          { key: 'pack', label: 'Pack Weight', options: ['5 kg Box (Approx 90 pcs)', '20 kg Master Carton'] },
        ],
        defaultUnit: 'Pack',
        allowedUnits: ['Pack', 'kg'],
        isDecimalAllowed: false,
        approvedBrands: ['ESAB', 'Ador Welding', 'D&H Secheron'],
      },
      {
        id: 'safety-helmet',
        name: 'Industrial Safety Helmet (Hard Hat)',
        category: 'Site consumables & safety equipment',
        categoryId: 'CONSUMABLES_SAFETY',
        aliases: ['safety helmet', 'hard hat', 'site cap', 'helmet'],
        specificationFields: [
          { key: 'standard', label: 'Standard & Ratchet', options: ['IS 2925 ISI Marked with Ratchet Adjustment'] },
          { key: 'color', label: 'Color Code', options: ['White (Engineers & Supervisors)', 'Yellow (Labour & General Workers)', 'Blue (Electricians & Carpenters)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
        approvedBrands: ['Karam', 'Udyogi', '3M'],
      },
      {
        id: 'safety-shoes',
        name: 'Safety Shoes with Steel Toe',
        category: 'Site consumables & safety equipment',
        categoryId: 'CONSUMABLES_SAFETY',
        aliases: ['safety shoes', 'steel toe boots', 'site shoes'],
        specificationFields: [
          { key: 'shoeSize', label: 'Shoe Size', options: ['Size 7 (UK/India)', 'Size 8 (UK/India)', 'Size 9 (UK/India)', 'Size 6 (UK/India)', 'Size 10 (UK/India)'] },
          { key: 'features', label: 'Protection Rating', options: ['ISI Steel Toe Cap (200J Impact Resistant, Antistatic PU Sole)'] },
        ],
        defaultUnit: 'Pair',
        allowedUnits: ['Pair'],
        isDecimalAllowed: false,
        approvedBrands: ['Bata Industrials', 'Karam', 'Liberty Warrior', 'Tiger'],
      },
      {
        id: 'safety-harness',
        name: 'Full Body Fall Arrest Safety Harness',
        category: 'Site consumables & safety equipment',
        categoryId: 'CONSUMABLES_SAFETY',
        aliases: ['safety belt', 'safety harness', 'fall arrest', 'scaffolding belt'],
        specificationFields: [
          { key: 'type', label: 'Specification', options: ['Full Body Harness with Dual Lanyard & Energy Absorber (IS 3521)'] },
        ],
        defaultUnit: 'Set',
        allowedUnits: ['Set', 'Nos'],
        isDecimalAllowed: false,
        approvedBrands: ['Karam PN 56', '3M', 'Udyogi'],
      },
      {
        id: 'safety-net',
        name: 'Perimeter / Debris Safety Net',
        category: 'Site consumables & safety equipment',
        categoryId: 'CONSUMABLES_SAFETY',
        aliases: ['safety net', 'catch net', 'green net', 'debris net'],
        specificationFields: [
          { key: 'dimensions', label: 'Net Dimensions & Mesh', options: ['10 × 5 m Fall Arrest Net (IS 5175 - 100mm border + 25mm overlay)', '3 × 50 m Green Scaffolding Debris Net (75% Shade)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos', 'm²'],
        isDecimalAllowed: false,
        approvedBrands: ['Karam', 'Garware'],
      },
      {
        id: 'tarpaulin',
        name: 'Heavy-Duty Waterproof Tarpaulin',
        category: 'Site consumables & safety equipment',
        categoryId: 'CONSUMABLES_SAFETY',
        aliases: ['tarpaulin', 'tharpal', 'cement cover plastic', 'waterproof cover'],
        specificationFields: [
          { key: 'size', label: 'Dimensions & GSM', options: ['24 × 18 ft (200 GSM Heavy Duty Cross-Laminated)', '18 × 12 ft (200 GSM)', '30 × 24 ft (250 GSM Extra Heavy Cement Shield)', '15 × 12 ft (150 GSM)'] },
        ],
        defaultUnit: 'Nos',
        allowedUnits: ['Nos'],
        isDecimalAllowed: false,
        approvedBrands: ['Silpaulin (Supreme)', 'Tufpaulin'],
      },
    ],
  },
]

/**
 * Searches the master catalogue by keyword or alias (including local terms e.g. "blue metal", "jalli", "kambi", "msand")
 */
export function searchCatalogueMaterials(query: string, categoryFilter?: string): MaterialVariant[] {
  const cleanQ = query.trim().toLowerCase()
  const results: MaterialVariant[] = []

  for (const cat of MATERIAL_CATALOGUE) {
    if (categoryFilter && categoryFilter !== 'ALL' && cat.id !== categoryFilter) {
      continue
    }

    for (const mat of cat.materials) {
      if (!cleanQ) {
        results.push(mat)
        continue
      }

      const matchName = mat.name.toLowerCase().includes(cleanQ)
      const matchCat = mat.category.toLowerCase().includes(cleanQ)
      const matchAlias = mat.aliases.some((a) => a.includes(cleanQ) || cleanQ.includes(a))
      const matchSpecs = mat.specificationFields.some((f) =>
        f.options.some((opt) => opt.toLowerCase().includes(cleanQ))
      )

      if (matchName || matchCat || matchAlias || matchSpecs) {
        results.push(mat)
      }
    }
  }

  return results
}

/**
 * Helper to get a material by its unique ID
 */
export function getMaterialById(materialId: string): MaterialVariant | undefined {
  for (const cat of MATERIAL_CATALOGUE) {
    const found = cat.materials.find((m) => m.id === materialId)
    if (found) return found
  }
  return undefined
}
