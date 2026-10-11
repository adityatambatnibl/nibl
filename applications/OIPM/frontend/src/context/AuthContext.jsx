import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";


import { goToPortal } from "../utils/portal";

const AuthContext = createContext(null);


const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "/api/v1";


// ============================================================
// TOKEN REFRESH TIMER
// ============================================================

function scheduleTokenRefreshTimer(
    accessToken,
    currentTime,
    refreshTimerRef,
    clearRefreshTimer,
    refreshAccessToken
) {

    clearRefreshTimer();


    if (!accessToken) {
        return;
    }


    try {

        const payload =
            JSON.parse(
                atob(
                    accessToken
                        .split(".")[1]
                        .replace(/-/g, "+")
                        .replace(/_/g, "/")
                )
            );


        if (!payload.exp) {
            return;
        }


        const expiryTime =
            payload.exp * 1000;


        // ----------------------------------------------------
        // Refresh 60 seconds before expiry
        // ----------------------------------------------------

        const refreshTime =
            expiryTime -
            currentTime -
            60 * 1000;


        const delay =
            Math.max(
                refreshTime,
                5000
            );


        refreshTimerRef.current =
            setTimeout(
                async () => {

                    const newToken =
                        await refreshAccessToken();


                    if (!newToken) {
                        return;
                    }


                    // ------------------------------------------------
                    // Schedule the next refresh using the same helper.
                    // This avoids recursive reference to a React
                    // callback while that callback is being declared.
                    // ------------------------------------------------

                    scheduleTokenRefreshTimer(
                        newToken,
                        Date.now(),
                        refreshTimerRef,
                        clearRefreshTimer,
                        refreshAccessToken
                    );

                },
                delay
            );


    } catch (error) {

        console.error(
            "Unable to schedule token refresh:",
            error
        );

    }
}


export function AuthProvider({ children }) {

    const [user, setUser] =
        useState(null);


    const [token, setToken] =
        useState(null);


    const [loading, setLoading] =
        useState(true);


    const refreshTimerRef =
        useRef(null);


    // ========================================================
    // CLEAR REFRESH TIMER
    // ========================================================

    const clearRefreshTimer =
        useCallback(() => {

            if (
                refreshTimerRef.current
            ) {

                clearTimeout(
                    refreshTimerRef.current
                );


                refreshTimerRef.current =
                    null;
            }

        }, []);


    // ========================================================
    // REFRESH ACCESS TOKEN
    // ========================================================

    const refreshAccessToken =
        useCallback(async () => {

            try {

                const response =
                    await fetch(
                        `${API_BASE_URL}/auth/refresh`,
                        {
                            method: "POST",

                            credentials: "include",

                            headers: {
                                "Content-Type":
                                    "application/json",
                            },
                        }
                    );


                if (!response.ok) {

                    throw new Error(
                        "Unable to refresh access token."
                    );
                }


                const data =
                    await response.json();


                if (!data.access_token) {

                    throw new Error(
                        "Refresh response did not contain an access token."
                    );
                }


                // --------------------------------------------
                // Store new access token
                // --------------------------------------------

                localStorage.setItem(
                    "oipm_access_token",
                    data.access_token
                );


                setToken(
                    data.access_token
                );


                // --------------------------------------------
                // User may also be returned by refresh endpoint
                // --------------------------------------------

                if (data.user) {

                    localStorage.setItem(
                        "oipm_user",
                        JSON.stringify(
                            data.user
                        )
                    );


                    setUser(
                        data.user
                    );
                }


                return data.access_token;


            } catch (error) {

                console.error(
                    "Access token refresh failed:",
                    error
                );


                return null;
            }

        }, []);


    // ========================================================
    // SCHEDULE NEXT TOKEN REFRESH
    // ========================================================

    const scheduleTokenRefresh =
        useCallback((
            accessToken,
            currentTime
        ) => {

            scheduleTokenRefreshTimer(
                accessToken,
                currentTime,
                refreshTimerRef,
                clearRefreshTimer,
                refreshAccessToken
            );

        }, [
            clearRefreshTimer,
            refreshAccessToken,
        ]);


    // ========================================================
    // RESTORE PREVIOUS LOGIN
    // ========================================================

    useEffect(() => {

        const restoreSession =
            async () => {

                const savedToken =
                    localStorage.getItem(
                        "oipm_access_token"
                    );


                const savedUser =
                    localStorage.getItem(
                        "oipm_user"
                    );


                if (
                    savedToken &&
                    savedUser
                ) {

                    try {

                        const parsedUser =
                            JSON.parse(
                                savedUser
                            );


                        setToken(
                            savedToken
                        );


                        setUser(
                            parsedUser
                        );


                        // ----------------------------------------
                        // Schedule automatic refresh
                        // ----------------------------------------

                        scheduleTokenRefresh(
                            savedToken,
                            Date.now()
                        );


                    } catch (error) {

                        console.error(
                            "Unable to restore login session:",
                            error
                        );


                        localStorage.removeItem(
                            "oipm_access_token"
                        );


                        localStorage.removeItem(
                            "oipm_user"
                        );
                    }


                } else {

                    // ------------------------------------------------
                    // No access token in localStorage.
                    //
                    // Try refresh cookie in case the browser
                    // still has a valid OIPM refresh token.
                    // ------------------------------------------------

                    const newToken =
                        await refreshAccessToken();


                    if (newToken) {

                        scheduleTokenRefresh(
                            newToken,
                            Date.now()
                        );
                    }
                }


                setLoading(false);
            };


        restoreSession();


        return () => {

            clearRefreshTimer();

        };

    }, [
        clearRefreshTimer,
        refreshAccessToken,
        scheduleTokenRefresh,
    ]);


    // ========================================================
    // STORE SUCCESSFUL LOGIN
    // ========================================================

    const login =
        useCallback((
            loginResponse
        ) => {

            const {
                access_token,
                user: loggedInUser,
            } = loginResponse;


            localStorage.setItem(
                "oipm_access_token",
                access_token
            );


            localStorage.setItem(
                "oipm_user",
                JSON.stringify(
                    loggedInUser
                )
            );


            setToken(
                access_token
            );


            setUser(
                loggedInUser
            );


            // --------------------------------------------
            // Start automatic refresh timer
            // --------------------------------------------

            scheduleTokenRefresh(
                access_token,
                Date.now()
            );

        }, [
            scheduleTokenRefresh,
        ]);


    // ========================================================
    // LOGOUT
    // ========================================================

    const logout =
        useCallback(async () => {

            clearRefreshTimer();


            // --------------------------------------------
            // Tell backend to remove refresh cookie
            // --------------------------------------------

            try {

                await fetch(
                    `${API_BASE_URL}/auth/logout`,
                    {
                        method: "POST",

                        credentials: "include",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                    }
                );

            } catch (error) {

                console.error(
                    "Logout request failed:",
                    error
                );
            }


            localStorage.removeItem(
                "oipm_access_token"
            );


            localStorage.removeItem(
                "oipm_user"
            );


            localStorage.removeItem("access_token");
            localStorage.removeItem("oipm_current_screen");

            // Sign out of the portal too and land on its login page. State is not
            // cleared here on purpose: that would first bounce to the card page.
            goToPortal("/logout");

        }, [
            clearRefreshTimer,
        ]);


    // ========================================================
    // CONTEXT VALUE
    // ========================================================

    const value = {

        user,

        token,

        loading,

        isAuthenticated:
            Boolean(
                token &&
                user
            ),

        login,

        logout,

        refreshAccessToken,
    };


    return (
        <AuthContext.Provider
            value={value}
        >

            {children}

        </AuthContext.Provider>
    );
}


// ============================================================
// USE AUTH
// ============================================================

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {

    const context =
        useContext(
            AuthContext
        );


    if (!context) {

        throw new Error(
            "useAuth must be used inside AuthProvider"
        );
    }


    return context;
}


