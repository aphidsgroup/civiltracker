export interface EquipmentCategory {
  id: string
  name: string
  icon: string
  description: string
  popularItems: {
    name: string
    defaultBrand?: string
    defaultUnit?: string
    suggestedCodePrefix?: string
  }[]
}

export const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  {
    id: 'concrete',
    name: 'Concrete & Mortar Equipment',
    icon: '🏗️',
    description: 'Mixers, vibrators, pumps, and testing moulds',
    popularItems: [
      { name: 'Concrete Mixer 10/7 Diesel / Electric', defaultBrand: 'Universal / Safari', defaultUnit: 'Nos', suggestedCodePrefix: 'CM' },
      { name: 'Concrete Needle Vibrator (2 HP / Petrol)', defaultBrand: 'Greaves / Honda', defaultUnit: 'Nos', suggestedCodePrefix: 'NV' },
      { name: 'Needle Vibrator Pin (40 mm / 60 mm)', defaultBrand: 'Safari', defaultUnit: 'Nos', suggestedCodePrefix: 'VP' },
      { name: 'Screed Board Vibrator (Surface)', defaultBrand: 'Kalyan', defaultUnit: 'Nos', suggestedCodePrefix: 'SV' },
      { name: 'Cube Moulds 150x150x150 mm (Set of 6)', defaultBrand: 'Standard', defaultUnit: 'Sets', suggestedCodePrefix: 'CBM' },
      { name: 'Slump Test Cone with Tamping Rod', defaultBrand: 'Standard', defaultUnit: 'Sets', suggestedCodePrefix: 'SLP' },
    ],
  },
  {
    id: 'steel',
    name: 'Bar Bending & Steel Tools',
    icon: '⚙️',
    description: 'Rebar cutting, bending, and tying machines',
    popularItems: [
      { name: 'Rebar Bar Bending Machine (GW40 / 32mm)', defaultBrand: 'Jaymac / Spartan', defaultUnit: 'Nos', suggestedCodePrefix: 'BBM' },
      { name: 'Rebar Cutting Machine (GQ40 / 32mm)', defaultBrand: 'Jaymac / Safari', defaultUnit: 'Nos', suggestedCodePrefix: 'BCM' },
      { name: 'Automatic Rebar Tying Machine', defaultBrand: 'Max / Koya', defaultUnit: 'Nos', suggestedCodePrefix: 'RTM' },
      { name: 'Manual Bar Bending Lever Pipe Set', defaultBrand: 'Heavy Duty', defaultUnit: 'Sets', suggestedCodePrefix: 'MLP' },
    ],
  },
  {
    id: 'power_tools',
    name: 'Power Tools & Demolition',
    icon: '⚡',
    description: 'Drills, breakers, grinders, and cutters',
    popularItems: [
      { name: 'Rotary Hammer Drill (GBH 2-26 / SDS Plus)', defaultBrand: 'Bosch / Makita', defaultUnit: 'Nos', suggestedCodePrefix: 'HD' },
      { name: 'Demolition Breaker / Jackhammer 11kg (GSH 11 E)', defaultBrand: 'Bosch / Dewalt', defaultUnit: 'Nos', suggestedCodePrefix: 'DH' },
      { name: 'Heavy Demolition Breaker 16kg-30kg', defaultBrand: 'Bosch / Hitachi', defaultUnit: 'Nos', suggestedCodePrefix: 'HDB' },
      { name: 'Angle Grinder 4-inch / 5-inch (GWS 600)', defaultBrand: 'Bosch / Stanley', defaultUnit: 'Nos', suggestedCodePrefix: 'AG' },
      { name: 'Heavy Angle Grinder 7-inch / 9-inch', defaultBrand: 'Makita / Bosch', defaultUnit: 'Nos', suggestedCodePrefix: 'HAG' },
      { name: 'Marble / Tile Cutter (110 mm)', defaultBrand: 'Bosch / Makita', defaultUnit: 'Nos', suggestedCodePrefix: 'TC' },
      { name: 'Core Drilling Machine with Stand', defaultBrand: 'Hilti / Dongcheng', defaultUnit: 'Nos', suggestedCodePrefix: 'CD' },
      { name: 'Circular Wood Saw 7-inch', defaultBrand: 'Dewalt / Bosch', defaultUnit: 'Nos', suggestedCodePrefix: 'CS' },
    ],
  },
  {
    id: 'surveying',
    name: 'Surveying & Measurement',
    icon: '📐',
    description: 'Total stations, auto levels, and laser meters',
    popularItems: [
      { name: 'Total Station with Tripod & Prism', defaultBrand: 'Leica / Topcon / Trimble', defaultUnit: 'Sets', suggestedCodePrefix: 'TS' },
      { name: 'Digital Auto Level (Dumpy Level) with Staff', defaultBrand: 'Sokkia / Bosch / Leica', defaultUnit: 'Sets', suggestedCodePrefix: 'AL' },
      { name: 'Laser Distance Meter (GLM 50 / 100m)', defaultBrand: 'Bosch / Leica Disto', defaultUnit: 'Nos', suggestedCodePrefix: 'LDM' },
      { name: 'Cross Line Laser Level with Tripod', defaultBrand: 'Bosch GLL 3-80', defaultUnit: 'Sets', suggestedCodePrefix: 'LL' },
      { name: 'Fiberglass / Steel Measuring Tape 50m / 30m', defaultBrand: 'Freemans', defaultUnit: 'Nos', suggestedCodePrefix: 'MT' },
    ],
  },
  {
    id: 'electrical_generators',
    name: 'Generators & Electrical Gear',
    icon: '🔌',
    description: 'Diesel generators, dewatering pumps, and lighting',
    popularItems: [
      { name: 'Diesel Generator Silent (15 kVA / 25 kVA)', defaultBrand: 'Kirloskar / Mahindra', defaultUnit: 'Nos', suggestedCodePrefix: 'DG' },
      { name: 'Portable Petrol/Gas Generator (3.5 kVA - 5 kVA)', defaultBrand: 'Honda / Greaves', defaultUnit: 'Nos', suggestedCodePrefix: 'PG' },
      { name: 'Submersible Dewatering Mud Pump 2 HP / 3 HP', defaultBrand: 'CRI / Kirloskar / Crompton', defaultUnit: 'Nos', suggestedCodePrefix: 'DP' },
      { name: 'High-Mast Site Flood Lights (LED 200W x 4)', defaultBrand: 'Bajaj / Philips', defaultUnit: 'Sets', suggestedCodePrefix: 'FL' },
      { name: 'Site Power Distribution Board with ELCB', defaultBrand: 'Schneider / L&T', defaultUnit: 'Nos', suggestedCodePrefix: 'PDB' },
    ],
  },
  {
    id: 'scaffolding_shuttering',
    name: 'Shuttering & Scaffolding Sets',
    icon: '🪜',
    description: 'Cuplock, props, steel plates, and staging pipes',
    popularItems: [
      { name: 'Adjustable Telescopic MS Props (2m - 3.7m)', defaultBrand: 'Standard Steel', defaultUnit: 'Nos', suggestedCodePrefix: 'PRP' },
      { name: 'Cuplock Scaffolding Standards & Ledgers', defaultBrand: 'Universal / Buildwell', defaultUnit: 'Sets', suggestedCodePrefix: 'CUP' },
      { name: 'MS Shuttering Plates (900x600 mm)', defaultBrand: 'Heavy Gauge', defaultUnit: 'Nos', suggestedCodePrefix: 'STP' },
      { name: 'H-Frame Scaffolding Set with Bracing', defaultBrand: 'Standard', defaultUnit: 'Sets', suggestedCodePrefix: 'HFR' },
      { name: 'Scaffolding Perforated Steel Walkway Planks', defaultBrand: 'Safety Grade', defaultUnit: 'Nos', suggestedCodePrefix: 'WPL' },
    ],
  },
  {
    id: 'lifting',
    name: 'Lifting & Material Handling',
    icon: '🏗️',
    description: 'Monkey hoists, winches, cranes, and barrows',
    popularItems: [
      { name: 'Mini Crane / Monkey Hoist (500 kg / 30m wire)', defaultBrand: 'Safari / Sigma', defaultUnit: 'Nos', suggestedCodePrefix: 'MC' },
      { name: 'Material Builder Hoist (1 Ton)', defaultBrand: 'Universal', defaultUnit: 'Nos', suggestedCodePrefix: 'BH' },
      { name: 'Heavy Duty Pneumatic Wheelbarrows', defaultBrand: 'Standard Steel', defaultUnit: 'Nos', suggestedCodePrefix: 'WB' },
      { name: 'Hand Pallet Truck (2.5 Ton)', defaultBrand: 'Godrej / Nilkamal', defaultUnit: 'Nos', suggestedCodePrefix: 'PT' },
    ],
  },
  {
    id: 'heavy_machinery',
    name: 'Heavy Machinery & Earthmoving',
    icon: '🚜',
    description: 'Excavators, loaders, tractors, and rollers',
    popularItems: [
      { name: 'Backhoe Loader (3DX / 4DX)', defaultBrand: 'JCB / CAT', defaultUnit: 'Nos', suggestedCodePrefix: 'JCB' },
      { name: 'Mini Excavator (3 Ton / 5 Ton)', defaultBrand: 'Kobelco / Tata Hitachi', defaultUnit: 'Nos', suggestedCodePrefix: 'EXC' },
      { name: 'Vibratory Soil Compactor / Roller', defaultBrand: 'L&T / Case', defaultUnit: 'Nos', suggestedCodePrefix: 'ROL' },
      { name: 'Tractor with Tipping Trailer', defaultBrand: 'Mahindra / John Deere', defaultUnit: 'Nos', suggestedCodePrefix: 'TRC' },
    ],
  },
  {
    id: 'welding_fabrication',
    name: 'Welding & Workshop Tools',
    icon: '🔥',
    description: 'Arc welders, gas cutters, and workshop tools',
    popularItems: [
      { name: 'IGBT Inverter Arc Welding Machine (250A / 300A)', defaultBrand: 'Esab / Dongcheng', defaultUnit: 'Nos', suggestedCodePrefix: 'WM' },
      { name: 'Oxy-Acetylene / LPG Gas Cutting Torch Set', defaultBrand: 'Esab / Victor', defaultUnit: 'Sets', suggestedCodePrefix: 'GCT' },
      { name: 'Magnetic Drill Machine', defaultBrand: 'BDS / Dongcheng', defaultUnit: 'Nos', suggestedCodePrefix: 'MD' },
      { name: 'Heavy Duty Bench Vice & Workshop Table', defaultBrand: 'Steel Forge', defaultUnit: 'Nos', suggestedCodePrefix: 'BV' },
    ],
  },
  {
    id: 'safety_quality',
    name: 'Safety & Quality Testing',
    icon: '🦺',
    description: 'Harnesses, rebound hammers, and levels',
    popularItems: [
      { name: 'Full Body Safety Harness with Lanyard (Set of 10)', defaultBrand: 'Karam / Udyogi', defaultUnit: 'Sets', suggestedCodePrefix: 'SH' },
      { name: 'Schmidt Concrete Rebound Hammer', defaultBrand: 'Proceq / Matest', defaultUnit: 'Nos', suggestedCodePrefix: 'SRH' },
      { name: 'Precision Aluminum Spirit Level 600mm / 1200mm', defaultBrand: 'Stanley / Kapro', defaultUnit: 'Nos', suggestedCodePrefix: 'SPL' },
      { name: 'Heavy Brass Plumb Bob (500g / 1kg)', defaultBrand: 'Freemans', defaultUnit: 'Nos', suggestedCodePrefix: 'PB' },
      { name: 'Digital Concrete Thermometer / Moisture Meter', defaultBrand: 'Testo', defaultUnit: 'Nos', suggestedCodePrefix: 'THM' },
    ],
  },
]

export const ASSET_STATUS_CONFIG = {
  OPERATIONAL: {
    label: 'Operational',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800',
    dotClass: 'bg-emerald-500',
    description: 'Working condition · Ready for deployment',
  },
  IN_USE: {
    label: 'In Use on Site',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800',
    dotClass: 'bg-sky-500',
    description: 'Currently deployed at site',
  },
  UNDER_MAINTENANCE: {
    label: 'Under Maintenance',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800',
    dotClass: 'bg-amber-500',
    description: 'Under repair, servicing, or calibration',
  },
  STANDBY: {
    label: 'Standby / Yard',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800',
    dotClass: 'bg-indigo-500',
    description: 'Available in company yard or store',
  },
  DAMAGED: {
    label: 'Damaged / Needs Fix',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800',
    dotClass: 'bg-rose-500',
    description: 'Damaged or broken · Awaiting inspection',
  },
  DECOMMISSIONED: {
    label: 'Decommissioned',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    dotClass: 'bg-slate-400',
    description: 'Retired, sold, or scrapped',
  },
} as const

export type AssetStatusKey = keyof typeof ASSET_STATUS_CONFIG

export const ASSET_UNITS = ['Nos', 'Sets', 'Units', 'Pairs', 'Meters', 'Lots', 'Bags']
