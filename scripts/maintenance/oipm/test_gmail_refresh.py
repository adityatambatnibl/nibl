import json
import os

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request


TOKEN_FILE = "token.json"


print("\n========================================")
print("       GMAIL REFRESH TOKEN TEST")
print("========================================\n")


# ============================================================
# 1. CHECK TOKEN FILE
# ============================================================

if not os.path.exists(TOKEN_FILE):

    print("❌ ERROR: token.json not found.")

    raise SystemExit(1)


# ============================================================
# 2. LOAD TOKEN FILE
# ============================================================

with open(
    TOKEN_FILE,
    "r",
    encoding="utf-8",
) as file:

    token_data = json.load(file)


refresh_token = token_data.get(
    "refresh_token"
)


if not refresh_token:

    print(
        "❌ ERROR: No refresh_token found in token.json."
    )

    raise SystemExit(1)


print("✓ Refresh token found")


# ============================================================
# 3. CREATE GOOGLE CREDENTIALS
# ============================================================

credentials = Credentials(
    token=token_data.get("token"),

    refresh_token=token_data.get(
        "refresh_token"
    ),

    token_uri=token_data.get(
        "token_uri"
    ),

    client_id=token_data.get(
        "client_id"
    ),

    client_secret=token_data.get(
        "client_secret"
    ),

    scopes=token_data.get(
        "scopes"
    ),
)


print(
    "Current access token:",
    (
        credentials.token[:20] + "..."
        if credentials.token
        else "None"
    ),
)


print(
    "Refresh token available:",
    bool(
        credentials.refresh_token
    )
)


# ============================================================
# 4. SAVE OLD ACCESS TOKEN
# ============================================================

old_access_token = (
    credentials.token
)


# ============================================================
# 5. FORCE REFRESH DIRECTLY
# ============================================================

print(
    "\nCalling Google refresh endpoint..."
)


try:

    credentials.refresh(
        Request()
    )

except Exception as error:

    print(
        "\n❌ REFRESH FAILED"
    )

    print(
        "Error:",
        error
    )

    raise SystemExit(1)


# ============================================================
# 6. CHECK NEW TOKEN
# ============================================================

new_access_token = (
    credentials.token
)


print(
    "\n✓ Google refresh request completed."
)


print(
    "New access token:",
    (
        new_access_token[:20] + "..."
        if new_access_token
        else "None"
    ),
)


print(
    "New expiry:",
    credentials.expiry
)


print(
    "Refresh token still present:",
    bool(
        credentials.refresh_token
    )
)


# ============================================================
# 7. VERIFY TOKEN WAS RECEIVED
# ============================================================

if not new_access_token:

    print(
        "\n❌ TEST FAILED:"
        " Google did not return an access token."
    )

    raise SystemExit(1)


# ============================================================
# 8. SAVE UPDATED CREDENTIALS
# ============================================================

with open(
    TOKEN_FILE,
    "w",
    encoding="utf-8",
) as file:

    file.write(
        credentials.to_json()
    )


print(
    "\n✓ token.json updated successfully."
)


# ============================================================
# 9. FINAL RESULT
# ============================================================

print("\n========================================")
print("             TEST RESULT")
print("========================================\n")


if old_access_token != new_access_token:

    print(
        "✓ NEW ACCESS TOKEN RECEIVED"
    )

    print(
        "✓ REFRESH TOKEN WORKED"
    )

    print(
        "✓ token.json UPDATED"
    )

    print(
        "\nGmail automatic token refresh is WORKING."
    )

else:

    print(
        "✓ Google accepted the refresh request."
    )

    print(
        "✓ Refresh token is valid."
    )

    print(
        "\nGoogle returned the same access token, "
        "which can happen if the current token "
        "is still valid."
    )


print(
    "\n========================================\n"
)