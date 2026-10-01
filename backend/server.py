from supabase import create_client, Client
from dotenv import load_dotenv

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timezone


# ============================================================
# LOAD ENVIRONMENT VARIABLES
# ============================================================

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")


# ============================================================
# MONGODB CONNECTION
# ============================================================

mongo_url = os.environ["MONGO_URL"]

client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


# ============================================================
# SUPABASE CONNECTION
# ============================================================

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SECRET_KEY = os.environ["SUPABASE_SECRET_KEY"]

supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY
)


# ============================================================
# CREATE FASTAPI APP
# ============================================================

app = FastAPI()


# ============================================================
# API ROUTER
# ============================================================

api_router = APIRouter(prefix="/api")


# ============================================================
# MODELS
# ============================================================

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4())
    )

    client_name: str

    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class StatusCheckCreate(BaseModel):
    client_name: str


# ============================================================
# ROOT API
# ============================================================

@api_router.get("/")
async def root():
    return {
        "message": "GMIT Smart Attendance API is running"
    }


# ============================================================
# CREATE STATUS CHECK
# ============================================================

@api_router.post(
    "/status",
    response_model=StatusCheck
)
async def create_status_check(
    input: StatusCheckCreate
):
    status_dict = input.model_dump()

    status_obj = StatusCheck(**status_dict)

    doc = status_obj.model_dump()

    doc["timestamp"] = doc["timestamp"].isoformat()

    await db.status_checks.insert_one(doc)

    return status_obj


# ============================================================
# GET STATUS CHECKS
# ============================================================

@api_router.get(
    "/status",
    response_model=List[StatusCheck]
)
async def get_status_checks():

    status_checks = await db.status_checks.find(
        {},
        {"_id": 0}
    ).to_list(1000)

    for check in status_checks:

        if isinstance(check["timestamp"], str):
            check["timestamp"] = datetime.fromisoformat(
                check["timestamp"]
            )

    return status_checks


# ============================================================
# INCLUDE ROUTER
# ============================================================

app.include_router(api_router)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,

    allow_credentials=True,

    allow_origins=os.environ.get(
        "CORS_ORIGINS",
        "*"
    ).split(","),

    allow_methods=["*"],

    allow_headers=["*"],
)


# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)


# ============================================================
# SHUTDOWN
# ============================================================

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()