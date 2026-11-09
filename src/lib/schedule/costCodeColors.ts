// Locked schedule color scheme: cost book division -> color.
// Related divisions share a color so bars stay readable on a Gantt.
// Changing a color here changes it for new/edited items; existing rows keep the
// color they were saved with (schedule_items.color) until re-saved.

export interface CostDivision {
  num: string
  name: string
  color: string
}

const PINK = '#EC4899', SLATE = '#64748B', NAVY = '#1b2b4a', SKY = '#0EA5E9'
const ROSE = '#F43F5E', ORANGE = '#F97316', RED = '#EF4444', TEAL = '#14B8A6'
const BLUE = '#3B82F6', VIOLET = '#8B5CF6', YELLOW = '#EAB308', LIME = '#84CC16'
const INDIGO = '#6366F1', GREEN = '#22C55E', AMBER = '#F59E0B', PURPLE = '#A855F7'

export const COST_DIVISIONS: CostDivision[] = [
  { num: '01', name: 'Plans and Permits',        color: PINK },
  { num: '02', name: 'Tear-Out and Demolition',  color: SLATE },
  { num: '03', name: 'Excavation and Grading',   color: NAVY },
  { num: '04', name: 'Concrete',                 color: SKY },
  { num: '05', name: 'Masonry',                  color: ROSE },
  { num: '06', name: 'Floor Framing',            color: ORANGE },
  { num: '07', name: 'Wall Framing',             color: ORANGE },
  { num: '08', name: 'Roof Framing',             color: ORANGE },
  { num: '09', name: 'Roofing and Flashing',     color: RED },
  { num: '10', name: 'Exterior Trim and Decks',  color: TEAL },
  { num: '11', name: 'Siding',                   color: TEAL },
  { num: '12', name: 'Exterior Doors and Trim',  color: TEAL },
  { num: '13', name: 'Windows and Trim',         color: TEAL },
  { num: '14', name: 'Plumbing',                 color: BLUE },
  { num: '15', name: 'Heating and Cooling',      color: VIOLET },
  { num: '16', name: 'Electrical',               color: YELLOW },
  { num: '17', name: 'Insulation',               color: LIME },
  { num: '18', name: 'Interior Wall Coverings',  color: INDIGO },
  { num: '19', name: 'Ceiling Coverings',        color: INDIGO },
  { num: '20', name: 'Millwork and Trim',        color: GREEN },
  { num: '21', name: 'Cabinets and Appliances',  color: GREEN },
  { num: '22', name: 'Specialties',              color: GREEN },
  { num: '23', name: 'Floor Covering',           color: AMBER },
  { num: '24', name: 'Painting',                 color: PURPLE },
  { num: '25', name: 'Clean-Up',                 color: SLATE },
]

export function divisionFor(costCode: string | null | undefined): CostDivision | undefined {
  if (!costCode) return undefined
  const num = costCode.split('.')[0].trim()
  return COST_DIVISIONS.find(d => d.num === num)
}
