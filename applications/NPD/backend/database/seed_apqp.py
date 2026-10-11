import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from database import repo
from database.connection import init_db, close_db, session_scope
from models.template import Template, TemplateKind, ApqpPhase, ApqpActivity


# (no_label, activity_name, default_check_point, default_responsibility)
HEADING_LABELS: set[str] = set()
PHASES = [
    ("PHASE0", "PHASE 0: Enquiry & Feasibility", [
        ("0.1", "Receipt of Enquiry", None, "MKTG"),
        ("a", "Customer Data Sheet", None, "MKTG"),
        ("b", "Quality System Review Check List", None, "R&D"),
        ("c", "Customer Drawing / Specification", None, "MKTG & R&D"),
        ("d", "Customer samples", None, "MKTG & R&D"),
        ("e", "Customer specific requirement", None, "NA"),
        ("0.2", "Project feasibility Assessment", None, "CFT"),
        ("a", "Sample study report / Study on input from marketing or customer", None, "R&D"),
        ("0.3", "Proposal to customer", None, "R&D"),
        ("a", "NPD Project approval", None, "MKTG"),
        ("b", "P.O from customer", None, "MKTG"),
        ("c", "Project risk assessment", None, "MKTG"),
    ]),
    ("PHASE1", "PHASE 1: Plan and Define Program", [
        ("1.1", "Team Feasibility Commitment by the CFT", None, "CFT"),
        ("a", "Review Feasibility sheet", "MOM", "CFT"),
        ("b", "Technical Feasibility", "MOM", "CFT"),
        ("c", "Check list for training need", "NIBL/FO/04/39 rev01", "CFT"),
        ("1.2", "Receipt information / Review Check Sheet", "NIBL/FO/04/01", "R&D"),
        ("1.3", "Timing Plan / Gantt chart", "NIBL/FO/04/30", "R&D"),
    ]),
    ("PHASE2", "PHASE 2: Product Design and Development and Tool Designing", [
        ("2.1", "Quality Data (Historical Warranty)", "NIBL/FO/04/31", "QA"),
        ("2.2", "Bench Marking", "NIBL/FO/04/32", "R&D"),
        ("2.3", "Preparation of product drawing, Part list", "As per parts list", "R&D"),
        ("2.4", "Identification and listing of the special product characteristics", "NIBL/FO/04/05/Rev01", "R&D"),
        ("2.5", "Design Goal", "NIBL/FO/04/06/Rev01", "R&D"),
        ("2.6", "Reliability & Quality Goal", "NIBL/FO/04/34", "R&D"),
        ("2.7", "Conduct DFMEA", "NIBL/FO/04/42", "R&D"),
        ("2.8", "Process Assumption", "NIBL/FO/04/35", "CFT"),
        ("2.9", "ERP activity", "Refer ERP data sheet", "R&D"),
        ("a", "Preparation of Component Drawings", "Part list", "R&D"),
        ("2.10", "Review of statutory & Regulatory Requirement", "NIBL/FO/04/04/Rev01", "CFT"),
        ("2.11", "Preparation of Tool drawings (attach part list of all component)", "Format number", "R&D"),
        ("2.12", "Facility Planning", "NIBL/FO/04/36", "CFT"),
        ("2.13", "Design Review, verification at design stage", "Format number", "R&D"),
        ("2.14", "Management Support [Review open issues if any]", "NPD MOM", "CFT"),
        ("2.15", "Indenting Process", None, None),
        ("a.", "Indenting process for RM, bought-out item, interplant transfer, Packaging", "Indent Sheet to be created", "R&D"),
    ]),
    ("PHASE3", "PHASE 3: Process Design and Development", [
        ("3.1", "Gauge Plan", "NIBL/FO/04/37", "QA"),
        ("3.2", "Test Timing Plan", "NIBL/FO/04/38", "R&D"),
        ("3.3", "Review of OPEN issues of APQP and Project Flow and corrective and preventive action", None, "CFT"),
        ("3.4", "MSA plan", None, "CFT"),
        ("3.5", "SPC plan", None, "CFT"),
        ("3.6", "Manufacturing activity of Tools and Gauges - list all items of bearings", None, "CFT"),
        ("3.7", "Preparation & review of mfg. Process Review Documents for assembly & components", None, "CFT"),
        ("3.8", "Preparation of MSA plan with specific reference to gauge, R&R activity", None, "CFT"),
        ("3.9", "Preparation of Work Instructions for assembly and each bearing component", None, "CFT"),
        ("3.10", "Management Support [Review open issues if any]", None, "CFT"),
        ("3.11", "Develop & release setup parameter", None, "CFT"),
        ("3.12", "Packaging specifications and drawing", "Existing spec review", "R&D"),
        ("3.13", "Procurement Process", "Existing supplier", "Sourcing"),
        ("a", "New Supplier Selection (Supplier evaluation)", "Existing supplier", "Sourcing"),
        ("b", "Existing supplier risk assessment", "NIBL/FO/04/41", "Sourcing"),
        ("c", "Raw material / Component", None, "Sourcing"),
        ("d", "Tooling / Fixture procurement", None, "Sourcing"),
        ("3.14", "Inward inspection", None, "QA"),
        ("3.15", "Management Support [Review open issues if any]", None, "CFT"),
    ]),
    ("PHASE4", "PHASE 4: Product & Process Validation", [
        ("4.1", "Conducting a Production Trial Run", None, None),
        ("a", "Inspection of toolings, fixtures and gauges", None, None),
        ("b", "Production trial run", None, None),
        ("c", "Inspection of component", None, None),
        ("d", "Part assembly Inspection Report with PPAP", None, None),
        ("e", "TGR / TGW", None, None),
        ("4.2", "PPAP Submission to the Customer", "Not Applicable", None),
        ("4.3", "Quality Sign-Off documentation", None, None),
        ("4.4", "Management Support [Review open issues if any]", None, None),
    ]),
    ("PHASE5", "PHASE 5: Feedback, Assessment & Corrective Action", [
        ("5.1", "Customer Feed back (PSW)", None, None),
        ("5.2", "Monitoring production ramp-up plan", None, None),
    ]),
]

CHECK_POINT_OPTIONS = [
    "Not Available", "Available", "Not Applicable", "MOM", "NPD MOM",
    "As per parts list", "Part list", "Format number", "Existing supplier",
    "Existing spec review", "Customer sample", "Approval / P.O.",
    "Indent Sheet to be created", "Refer ERP data sheet",
]


def build_phases() -> list[ApqpPhase]:
    phases = []
    seq = 0
    for p_idx, (code, name, activities) in enumerate(PHASES, start=1):
        records = []
        for a_idx, (no_label, act_name, check_point, resp) in enumerate(activities, start=1):
            seq += 1
            records.append(ApqpActivity(
                activity_id=f"{code}-{a_idx:03d}",
                phase_code=code,
                no_label=no_label,
                name=act_name,
                sequence=seq,
                default_responsibility=None,
                default_check_point=None,
                is_heading=no_label in HEADING_LABELS,
            ))
        phases.append(ApqpPhase(phase_code=code, phase_name=name, sequence=p_idx, activities=records))
    return phases


async def seed():
    await init_db()
    phases = build_phases()
    total = sum(len(p.activities) for p in phases)

    async with session_scope():
        existing = await repo.find_one(
            select(Template).where(Template.kind == TemplateKind.APQP_PHASES)
        )
        if existing:
            existing.phases = phases
            existing.version += 1
            existing.updated_at = datetime.now(timezone.utc)
            print(f"updated apqp_phases -> v{existing.version}")
        else:
            await repo.add(Template(kind=TemplateKind.APQP_PHASES, phases=phases))
            print("created apqp_phases")

        for p in phases:
            print(f"  {p.phase_code}: {len(p.activities)} activities")
        print(f"  TOTAL: {total}")

        lookups = await repo.find_one(
            select(Template).where(Template.kind == TemplateKind.LOOKUPS)
        )
        if lookups and not lookups.check_point_options:
            lookups.check_point_options = CHECK_POINT_OPTIONS
            print("added check_point_options to lookups")

    await close_db()


if __name__ == "__main__":
    asyncio.run(seed())