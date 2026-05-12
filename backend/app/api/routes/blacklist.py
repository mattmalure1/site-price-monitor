import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.db.database import get_db
from app.models.blacklist import BlacklistRule

router = APIRouter(prefix="/blacklist", tags=["blacklist"])


class BlacklistRuleCreate(BaseModel):
    rule_type: str  # keyword / seller / grader / title_pattern
    value: str
    reason: str = ""


class BlacklistRuleOut(BaseModel):
    id: str
    rule_type: str
    value: str
    reason: str

    class Config:
        from_attributes = True


@router.get("/", response_model=list[BlacklistRuleOut])
async def list_rules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BlacklistRule))
    return result.scalars().all()


@router.post("/", response_model=BlacklistRuleOut, status_code=201)
async def add_rule(body: BlacklistRuleCreate, db: AsyncSession = Depends(get_db)):
    rule = BlacklistRule(
        id=str(uuid.uuid4()),
        rule_type=body.rule_type,
        value=body.value.lower(),
        reason=body.reason,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(rule_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BlacklistRule).where(BlacklistRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()
