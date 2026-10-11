from datetime import (
    datetime,
    timedelta,
    timezone,
)

from typing import Optional


from fastapi import (
    Depends,
    HTTPException,
    status,
)


from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)


from jose import (
    JWTError,
    jwt,
)


from passlib.context import CryptContext


from sqlalchemy.orm import Session


from app.core.config import settings
from app.db.database import get_db
from app.models.user import User


# ============================================================
# PASSWORD HASHING
# ============================================================

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)


def hash_password(
    password: str,
) -> str:

    return pwd_context.hash(
        password
    )


def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:

    return pwd_context.verify(
        plain_password,
        hashed_password,
    )


# ============================================================
# JWT SECURITY
# ============================================================

security = HTTPBearer()


# ============================================================
# CREATE ACCESS TOKEN
# ============================================================

def create_access_token(
    subject,
    expires_delta: Optional[timedelta] = None,
):

    if expires_delta:

        expire = (
            datetime.now(timezone.utc)
            + expires_delta
        )

    else:

        expire = (
            datetime.now(timezone.utc)
            + timedelta(
                minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
            )
        )


    payload = {
        "sub": str(subject),

        "type": "access",

        "exp": expire,
    }


    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


# ============================================================
# CREATE REFRESH TOKEN
# ============================================================

def create_refresh_token(
    subject,
    expires_delta: Optional[timedelta] = None,
):

    if expires_delta:

        expire = (
            datetime.now(timezone.utc)
            + expires_delta
        )

    else:

        # ----------------------------------------------------
        # Refresh token lifetime
        #
        # 30 days
        # ----------------------------------------------------

        expire = (
            datetime.now(timezone.utc)
            + timedelta(days=30)
        )


    payload = {
        "sub": str(subject),

        "type": "refresh",

        "exp": expire,
    }


    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


# ============================================================
# VERIFY REFRESH TOKEN
# ============================================================

def verify_refresh_token(
    token: str,
):

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,

        detail=(
            "Refresh token is invalid "
            "or has expired."
        ),

        headers={
            "WWW-Authenticate": "Bearer",
        },
    )


    try:

        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[
                settings.JWT_ALGORITHM
            ],
        )


        token_type = payload.get(
            "type"
        )


        if token_type != "refresh":

            raise credentials_exception


        user_id = payload.get(
            "sub"
        )


        if not user_id:

            raise credentials_exception


        return user_id


    except JWTError:

        raise credentials_exception


# ============================================================
# GET CURRENT USER
# ============================================================

def get_current_user(
    credentials: HTTPAuthorizationCredentials =
        Depends(security),

    db: Session =
        Depends(get_db),
):

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,

        detail=(
            "Could not validate "
            "authentication credentials."
        ),

        headers={
            "WWW-Authenticate": "Bearer",
        },
    )


    token = credentials.credentials


    try:

        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[
                settings.JWT_ALGORITHM
            ],
        )


        # ----------------------------------------------------
        # IMPORTANT:
        #
        # Only access tokens can be used
        # for normal API authentication.
        #
        # A refresh token cannot be used
        # directly against protected APIs.
        # ----------------------------------------------------

        token_type = payload.get(
            "type"
        )


        if token_type != "access":

            raise credentials_exception


        user_id = payload.get(
            "sub"
        )


        if not user_id:

            raise credentials_exception


    except JWTError:

        raise credentials_exception


    user = (
        db.query(User)
        .filter(
            User.id == user_id
        )
        .first()
    )


    if user is None:

        raise credentials_exception


    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,

            detail=(
                "Your account is inactive."
            ),
        )


    return user


# ============================================================
# ROLE CHECK
# ============================================================

def require_role(
    *allowed_roles
):

    def role_dependency(
        current_user=Depends(
            get_current_user
        ),
    ):

        current_role = getattr(
            current_user.role,
            "value",
            str(current_user.role),
        )


        allowed = []


        for role in allowed_roles:

            value = getattr(
                role,
                "value",
                str(role),
            )


            allowed.append(
                value
            )


        if current_role not in allowed:

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,

                detail=(
                    "You do not have permission "
                    "to perform this action."
                ),
            )


        return current_user


    return role_dependency