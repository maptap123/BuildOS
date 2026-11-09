-- Applied to prod via Supabase MCP 2026-11-09.
alter table public.schedule_items add column if not exists cost_code text;

-- Backfill division from existing trade; color follows the locked division palette.
-- Generic "Framing" is left unset (could be floor/wall/roof framing: 06/07/08).
with map(trade, div, name, hex) as (values
 ('Site Work','03','Excavation and Grading','#1b2b4a'),
 ('Concrete','04','Concrete','#0EA5E9'),
 ('Masonry','05','Masonry','#F43F5E'),
 ('Roofing','09','Roofing and Flashing','#EF4444'),
 ('Exterior','10','Exterior Trim and Decks','#14B8A6'),
 ('Plumbing','14','Plumbing','#3B82F6'),
 ('Mechanical/HVAC','15','Heating and Cooling','#8B5CF6'),
 ('Electrical','16','Electrical','#EAB308'),
 ('Insulation','17','Insulation','#84CC16'),
 ('Drywall','18','Interior Wall Coverings','#6366F1'),
 ('Millwork/Trim','20','Millwork and Trim','#22C55E'),
 ('Flooring','23','Floor Covering','#F59E0B'),
 ('Painting','24','Painting','#A855F7'),
 ('Inspections','01','Plans and Permits','#EC4899'),
 ('Closeout','25','Clean-Up','#64748B')
)
update public.schedule_items s
set cost_code = m.div, trade = m.name, color = m.hex
from map m
where s.trade = m.trade and s.cost_code is null;
