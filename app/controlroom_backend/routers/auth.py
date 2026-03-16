from datetime import datetime, timedelta, timezone

import bcrypt
from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel

from config import settings
from database import get_conn

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class Token(BaseModel):
    access_token: str
    token_type: str


class UserOut(BaseModel):
    user_id: str
    username: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _create_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": username, "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    conn: Connection = Depends(get_conn),
) -> UserOut:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    row = await conn.fetchrow(
        "SELECT user_id, username FROM users WHERE username = $1", username
    )
    if row is None:
        raise credentials_exc
    return UserOut(user_id=str(row["user_id"]), username=row["username"])


# ---------------------------------------------------------------------------
# Startup helper — seed default admin if users table is empty
# ---------------------------------------------------------------------------

async def seed_default_admin(conn: Connection) -> None:
    count = await conn.fetchval("SELECT COUNT(*) FROM users")
    if count == 0:
        hashed = _hash_password("admin")
        await conn.execute(
            "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
            "admin",
            hashed,
        )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/token", response_model=Token)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    conn: Connection = Depends(get_conn),
):
    row = await conn.fetchrow(
        "SELECT password_hash FROM users WHERE username = $1", form.username
    )
    if row is None or not _verify_password(form.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=_create_token(form.username), token_type="bearer")


@router.get("/me", response_model=UserOut)
async def me(current_user: UserOut = Depends(get_current_user)):
    return current_user
