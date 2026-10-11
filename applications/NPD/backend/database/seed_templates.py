import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from database import repo
from database.connection import init_db, close_db, session_scope
from models.template import Template, TemplateKind, StageOffset

# Source: Dev_Plan_ROllon Tracking sheet column headers.
# depends_on + offset_days encode the real chained rules.
# variants override offset_days for a given bearing type / condition.
STAGES = [
    StageOffset(code="ERP", name="ERP Activities", sequence=1,
                depends_on=None, offset_days=2, anchor_field="order_date",
                note="Order date + 2 days"),
    StageOffset(code="A0",  name="Sample study - expected sample from customer", sequence=1,
                depends_on=None, offset_days=0, note="Externally given by customer"),
    StageOffset(code="A",   name="Proposal Drawing to customer", sequence=2,
                depends_on=None, offset_days=0, note="ANCHOR - all dates derive from this"),
    StageOffset(code="B",   name="Drawing Approval from customer", sequence=3,
                depends_on="A", offset_days=10),
    StageOffset(code="C",   name="Product and component Design (process drg + item code, BOM routing)", sequence=4,
                depends_on="B", offset_days=5, note="Header says B+6; live data shows B+5 - CONFIRM"),
    StageOffset(code="D",   name="100% Tool Design ready", sequence=5,
                depends_on="C", offset_days=10,
                variants={"IM/BI": 4, "RAX": 15,
                          "AX-THICK": 10, "AX-THIN": 10, "AR-THICK": 10, "DB": 10, "DL": 10},
                note="C+4 IM/BI | C+10 AX/AR/DB/DL | C+15 RAX | CP-THICK & CP-THIN NOT SPECIFIED"),
    StageOffset(code="E",   name="Tool RM order", sequence=6,
                depends_on="D", offset_days=3),
    StageOffset(code="F",   name="RM Order for component (full PO qty)", sequence=7,
                depends_on="C", offset_days=5),
    StageOffset(code="G",   name="RM receipt for component", sequence=8,
                depends_on="F", offset_days=45,
                variants={"CP-THIN": 90},
                note="F+90 CP-THIN (import RM) | F+45 all others"),
     StageOffset(code="H",   name="100% Tooling readiness for each component", sequence=9,
                depends_on="D", offset_days=45,
                variants={"DB": 90, "DL": 90},
                note="D+90 DB & DL | D+45 all others"),
    StageOffset(code="J",   name="Turning", sequence=10,
                depends_on="G", offset_days=10),
    StageOffset(code="J1",  name="Blanking", sequence=11,
                depends_on="G", offset_days=3),
    StageOffset(code="K",   name="GR press operations (6*3)", sequence=12,
                depends_on="H", offset_days=15,
                note="Header says H+18; live data shows H+15 - CONFIRM"),
    StageOffset(code="L",   name="VI press operations (3*3)", sequence=13,
                depends_on="K", offset_days=10,
                note="Header says K+9; live data shows K+10 - CONFIRM"),
    StageOffset(code="M",   name="HT + Vibro + (Nitriding OSP)", sequence=14,
                depends_on="L", offset_days=5,
                note="Header says 'AD+5'; live data confirms L+5"),
    StageOffset(code="N",   name="FACE grinding", sequence=15,
                depends_on="M", offset_days=4),
    StageOffset(code="P",   name="OD Grinding", sequence=16,
                depends_on="N", offset_days=2),
    StageOffset(code="P1",  name="Track Grinding", sequence=17,
                depends_on="P", offset_days=4),
    StageOffset(code="P2",  name="Bore Grinding", sequence=18,
                depends_on="P", offset_days=4,
                note="Header says 'Q+4' - stage Q does not exist. Assumed P. CONFIRM"),
    StageOffset(code="P3",  name="Finish OD Grinding", sequence=19,
                depends_on="P", offset_days=2,
                note="Header says 'Q+2'. Assumed P. CONFIRM"),
    StageOffset(code="P4",  name="Hard Turning", sequence=20,
                depends_on="P", offset_days=4,
                note="Header says 'Q+4'. Assumed P. CONFIRM"),
    StageOffset(code="S",   name="Needle / Roller", sequence=21,
                depends_on="G", offset_days=30),
    StageOffset(code="S1",  name="Component Inspection and Assembly", sequence=22,
                depends_on="P3", offset_days=3,
                variants={"AX-THIN": 5, "AX-THICK": 5, "RAX": 5},
                depends_on_variants={"RAX": "P4"},
                note="P3+3 CP-THIN/CP-THICK/IM-BI | P3+5 AX-THIN/AX-THICK | P4+5 RAX | AR-THICK, DB, DL NOT SPECIFIED"),
    StageOffset(code="T",   name="Final Inspection", sequence=23,
                depends_on="S1", offset_days=3),
     StageOffset(code="U",   name="PDI / Reports / PPAP / Third party test", sequence=24,
                depends_on="T", offset_days=3,
                variants={"AX-THIN": 7, "AX-THICK": 7, "RAX": 7},
                note="T+3 CP-THIN/CP-THICK/IM-BI | T+7 AX-THIN/AX-THICK/RAX | AR-THICK, DB, DL NOT SPECIFIED"),
    StageOffset(code="V",   name="Packing", sequence=25,
                depends_on="U", offset_days=1),
    StageOffset(code="W",   name="Ready for Dispatch from FG", sequence=26,
                depends_on="V", offset_days=1),
    StageOffset(code="X",   name="Dispatch from plant", sequence=27,
                depends_on="W", offset_days=1,
                note="Depends on marketing clearance. Equals Planned Delivery Date (Sample)"),
    StageOffset(code="Y",   name="Customer approval for Sample", sequence=28,
                depends_on="X", offset_days=30),
    StageOffset(code="Z",   name="Production Batch after sample approval", sequence=29,
                depends_on="Y", offset_days=45,
                note="Equals Planned Delivery Date (Production Batch)"),
]

BEARING_TYPES = [
    "CP-Thick", "CP-Thin", "AX-Thick", "AX-Thin", "AR-Thick",
    "RAX", "Rings", "IM/BI", "DL", "DB",
]

RPD_STATUSES = ["Not received", "Developed", "In Progress", "Completed"]

DELAY_REASONS = [
    "Customer approval delayed", "Material not received", "Import RM delay",
    "Tool modification", "Design change", "Testing issue", "Supplier delay",
    "Production issue", "Machine breakdown", "Manpower shortage", "Other",
]

RESPONSIBILITIES = ["MKTG", "R&D", "MKTG & R&D", "CFT", "QA",
    "TOOL ROOM", "MFG GBD", "MFG NBD", "SOURCING", "TL", "NA"]


async def seed():
    await init_db()
    async with session_scope():
        existing = await repo.find_one(
            select(Template).where(Template.kind == TemplateKind.PRODUCTION_STAGES)
        )
        if existing:
            existing.stages = STAGES
            existing.version += 1
            existing.updated_at = datetime.now(timezone.utc)
            print(f"updated production_stages -> v{existing.version} ({len(STAGES)} stages)")
        else:
            await repo.add(Template(kind=TemplateKind.PRODUCTION_STAGES, stages=STAGES))
            print(f"created production_stages ({len(STAGES)} stages)")

        lookups = await repo.find_one(
            select(Template).where(Template.kind == TemplateKind.LOOKUPS)
        )
        if lookups:
            print("skip   lookups (already exists)")
        else:
            await repo.add(Template(
                kind=TemplateKind.LOOKUPS,
                bearing_types=BEARING_TYPES,
                rpd_statuses=RPD_STATUSES,
                delay_reasons=DELAY_REASONS,
                responsibilities=RESPONSIBILITIES,
            ))
            print("created lookups")

    await close_db()


if __name__ == "__main__":
    asyncio.run(seed())