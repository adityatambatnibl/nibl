from pydantic import BaseModel


class ProjectCard(BaseModel):
    id: str
    name: str
    subtitle: str = ""
    description: str = ""
    icon: str | None = None
    theme: dict | None = None
    status: str = "active"
    launch: dict
    access: str
    can_open: bool
    message: str | None = None
