from fastapi import APIRouter, Depends, status

from models.user import User
from schemas.auth import (
    SignupRequest, RequestAccessRequest, LoginRequest, OipmSsoRequest, TokenResponse, UserOut, MessageResponse,ForgotPasswordRequest, ResetPasswordRequest, ChangePasswordRequest,
)
from services import audit_service, auth_service
from utils.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/request-access", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def request_access(data: RequestAccessRequest):
    await auth_service.request_access(data)
    return MessageResponse(
        message="Request received. An admin will review it and set up your account."
    )
@router.post("/signup", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def signup(data: SignupRequest):
    user = await auth_service.signup(data)
    if user.is_admin:
        return MessageResponse(message="Admin account created. You can log in now.")
    return MessageResponse(message="Account created. An admin must approve it before you can log in.")


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest):
    token, user = await auth_service.login(data)
    return TokenResponse(access_token=token, user=auth_service.to_user_out(user))


@router.post("/sso", response_model=TokenResponse)
async def sso(data: OipmSsoRequest):
    token, user = await auth_service.sso_login(data)
    await audit_service.log_sign_in(user)
    return TokenResponse(access_token=token, user=auth_service.to_user_out(user))


@router.post("/sso-check")
async def sso_check(data: OipmSsoRequest):
    """For the OIPM launcher: {allowed, message} - no session is created."""
    return await auth_service.sso_check(data)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return auth_service.to_user_out(user)


from schemas.auth import (
    SignupRequest, LoginRequest, TokenResponse, UserOut, MessageResponse,
    ForgotPasswordRequest, ResetPasswordRequest, ChangePasswordRequest,
)
from services import auth_service, password_service


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(data: ForgotPasswordRequest):
    await password_service.request_reset(str(data.email))
    return MessageResponse(
        message="If an account exists for that address, a reset link has been sent."
    )


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(data: ResetPasswordRequest):
    await password_service.reset_with_token(data.token, data.password)
    return MessageResponse(message="Your password has been updated. You can sign in now.")


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    data: ChangePasswordRequest,
    user: User = Depends(get_current_user),
):
    await password_service.change_own(user, data.current_password, data.new_password)
    return MessageResponse(message="Your password has been changed.")