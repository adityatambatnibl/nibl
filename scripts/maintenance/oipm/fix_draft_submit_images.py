from pathlib import Path

file_path = r"D:\Internal Workspace\oipm\backend\app\api\drafts.py"

with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

# ------------------------------------------------------------
# 1. Insert the missing draft-image migration helper
# ------------------------------------------------------------

marker = '''from app.services.storage_service import storage_service

router = APIRouter(
'''

helper = '''from app.services.storage_service import storage_service


# ============================================================
# LOCAL DRAFT IMAGE LIFECYCLE
# ============================================================

def _iter_image_items(payload):
    if not isinstance(payload, dict):
        return

    for key in (
        "problem_images",
        "countermeasure_images",
        "result_images",
    ):
        images = payload.get(key) or []

        if isinstance(images, list):
            for image in images:
                if isinstance(image, dict):
                    yield image


def _move_draft_images_to_improvement(
    image_payload,
    project_id,
):
    """
    Move all draft images into the final improvement folder
    when the draft is submitted.
    """

    current_year = date.today().year

    migrated_payload = {}

    for field_name in (
        "problem_images",
        "countermeasure_images",
        "result_images",
    ):

        images = image_payload.get(field_name) or []

        migrated_images = []

        for image in images:

            image_copy = dict(image)

            storage_path = image_copy.get("storage_path")

            if not storage_path:
                migrated_images.append(image_copy)
                continue

            # Already in final improvement storage.
            if not storage_path.startswith("drafts/"):
                migrated_images.append(image_copy)
                continue

            path_parts = Path(storage_path).parts

            if len(path_parts) < 5:
                raise ValueError(
                    f"Invalid draft image path: {storage_path}"
                )

            section = path_parts[3]
            filename = path_parts[4]

            project_folder = project_id.replace("/", "-")

            destination_path = (
                f"{current_year}/"
                f"{project_folder}/"
                f"{section}/"
                f"{filename}"
            )

            storage_service.move_image(
                storage_path,
                destination_path,
            )

            image_copy["storage_path"] = destination_path

            image_copy["url"] = (
                storage_service.create_signed_url(
                    destination_path,
                    expires_in=3600,
                )
            )

            migrated_images.append(image_copy)

        migrated_payload[field_name] = migrated_images

    return migrated_payload


router = APIRouter(
'''

if marker not in text:
    raise SystemExit("ERROR: router insertion marker not found.")

if "def _move_draft_images_to_improvement(" not in text:
    text = text.replace(marker, helper, 1)

# ------------------------------------------------------------
# 2. Generate project_id BEFORE creating the Improvement
# ------------------------------------------------------------

old_project_id = '''        project_id=generate_project_id(
            db
        ),
'''

new_project_id = '''        project_id=project_id,
'''

if old_project_id not in text:
    raise SystemExit("ERROR: existing project_id block not found.")

text = text.replace(old_project_id, new_project_id, 1)

# Insert project_id + migration immediately before Improvement(...)
target = '''    improvement = Improvement(
'''

replacement = '''    project_id = generate_project_id(
        db
    )

    # ========================================================
    # MOVE DRAFT IMAGES INTO FINAL IMPROVEMENT STORAGE
    # ========================================================

    migrated_images = _move_draft_images_to_improvement(
        {
            "problem_images": validated.problem_images or [],
            "countermeasure_images": validated.countermeasure_images or [],
            "result_images": validated.result_images or [],
        },
        project_id,
    )

    validated = validated.model_copy(
        update=migrated_images
    )

    improvement = Improvement(
'''

if target not in text:
    raise SystemExit("ERROR: Improvement creation marker not found.")

text = text.replace(target, replacement, 1)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("drafts.py updated successfully.")
