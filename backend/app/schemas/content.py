from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import Audience, NodeKind


class NodeBase(BaseModel):
    audience: Audience
    parent_id: int | None = None
    kind: NodeKind = NodeKind.menu
    title: str = Field(max_length=120)
    body: str | None = None
    image_url: str | None = None
    audio_url: str | None = None
    link_url: str | None = None
    position: int = 0
    is_published: bool = True


class NodeCreate(NodeBase):
    pass


class NodeUpdate(BaseModel):
    parent_id: int | None = None
    kind: NodeKind | None = None
    title: str | None = Field(default=None, max_length=120)
    body: str | None = None
    image_url: str | None = None
    audio_url: str | None = None
    link_url: str | None = None
    position: int | None = None
    is_published: bool | None = None


class NodeOut(NodeBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    updated_at: datetime


class NodeTree(NodeOut):
    children: list["NodeTree"] = []


class SettingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    key: str
    value: str
    description: str | None = None


class SettingUpdate(BaseModel):
    value: str
    description: str | None = None
