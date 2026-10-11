import os
from fastapi import APIRouter, Request
from fastapi.responses import (
    RedirectResponse,
    JSONResponse,
)

from app.services.gmail_service import (
    get_authorization_url,
    complete_authorization,
)
from app.core.config import cookie_secure


router = APIRouter(
    prefix="/email",
    tags=["Email"],
)


@router.get("/google/authorize")
def google_authorize():

    (
        authorization_url,
        state,
        code_verifier,
    ) = get_authorization_url()

    response = RedirectResponse(
        url=authorization_url
    )

    # OAuth state
    response.set_cookie(
        key="gmail_oauth_state",
        value=state,
        httponly=True,
        secure=cookie_secure(),
        samesite="lax",
        max_age=600,
    )

    # PKCE code verifier
    response.set_cookie(
        key="gmail_oauth_code_verifier",
        value=code_verifier,
        httponly=True,
        secure=cookie_secure(),
        samesite="lax",
        max_age=600,
    )

    return response


@router.get("/google/callback")
def google_callback(
    request: Request,
):

    state = request.cookies.get(
        "gmail_oauth_state"
    )

    code_verifier = request.cookies.get(
        "gmail_oauth_code_verifier"
    )

    if not state:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "detail": (
                    "OAuth state is missing."
                ),
            },
        )

    if not code_verifier:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "detail": (
                    "OAuth code verifier is missing."
                ),
            },
        )

    authorization_response = str(
        request.url
    )

    try:

        complete_authorization(
            authorization_response=(
                authorization_response
            ),
            state=state,
            code_verifier=code_verifier,
        )

        response = JSONResponse(
            content={
                "success": True,
                "message": (
                    "Gmail account connected "
                    "successfully."
                ),
            }
        )

        # Remove temporary OAuth cookies.
        response.delete_cookie(
            "gmail_oauth_state"
        )

        response.delete_cookie(
            "gmail_oauth_code_verifier"
        )

        return response

    except Exception as exc:

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "detail": str(exc),
            },
        )