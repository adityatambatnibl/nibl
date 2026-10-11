// Sign-in page - same screen as the old OIPM sign-in (moved here unchanged).
// "Forgot password?" is inside this page, as before.
import { useState } from "react";

import { forgotPassword } from "../../services/authService";
import BrandLogos from "../../components/Brand/BrandLogos";
import BearingBackground from "../../components/Brand/BearingBackground";


/* =====================================================
   LOGIN PAGE
===================================================== */

export default function LoginPage({
    form,
    error,
    loading,
    onChange,
    onSubmit,
    onSignup,
}) {

    const [showPasswordHelp, setShowPasswordHelp] =
        useState(false);

    const [forgotPasswordLoading, setForgotPasswordLoading] =
        useState(false);


    return (

        <div className="auth-page">

            <BearingBackground variant="login"  />

            <div className="auth-brand">

                <div className="auth-brand-content">
                    <BrandLogos />
                </div>

            </div>


            <div className="auth-container">


                <div className="auth-visual">

                    <h1>

                        One place for


                        <br />

                        <span>
                           NIBL digital work.
                        </span>

                    </h1>


                    <p>
                        Access approved internal digital projects through one secure workspace.
                    </p>


                </div>


                <div className="auth-card">


                    <div className="auth-card-heading">

                        <h2>
                            Sign in
                        </h2>


                        <p>
                            Use your official
                            NIBL account.
                        </p>

                    </div>


                    {error && (

                        <div className="error-message">
                            {error}
                        </div>

                    )}


                    <form
                        onSubmit={onSubmit}
                    >

                        <div className="form-group">

                            <label>
                                NIBL Email
                            </label>


                            <input
                                type="email"
                                name="email"
                                value={
                                    form.email
                                }
                                onChange={
                                    onChange
                                }
                                placeholder="name@nibl.in"
                                required
                            />

                        </div>


                        <div className="form-group">

                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    marginBottom: "6px",
                                }}
                            >

                                <label
                                    style={{
                                        marginBottom: 0,
                                    }}
                                >
                                    Password
                                </label>


                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowPasswordHelp(
                                            true
                                        )
                                    }
                                    style={{
                                        border: "none",
                                        background: "transparent",
                                        padding: 0,
                                        margin: 0,
                                        color: "#bd1717",
                                        fontSize: "12px",
                                        fontWeight: "600",
                                        cursor: "pointer",
                                    }}
                                >
                                    Forgot password?
                                </button>

                            </div>


                            <input
                                type="password"
                                name="password"
                                value={
                                    form.password
                                }
                                onChange={
                                    onChange
                                }
                                placeholder="Enter your password"
                                required
                            />

                        </div>


                        <button
                            className="primary-button full"
                            type="submit"
                            disabled={loading}
                        >

                            {loading
                                ? "Signing in..."
                                : "Sign In"}

                        </button>

                    </form>


                    <div className="auth-switch">

                        <span>
                            Don't have an
                            account?
                        </span>


                        <button
                            type="button"
                            onClick={onSignup}
                        >
                            Register
                        </button>

                    </div>

                </div>

            </div>


            {showPasswordHelp && (

                <div
                    onClick={() =>
                        setShowPasswordHelp(false)
                    }
                    style={{
                        position: "fixed",
                        inset: 0,
                        background:
                            "rgba(30, 20, 20, 0.48)",
                        backdropFilter:
                            "blur(4px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 9999,
                        padding: "20px",
                    }}
                >

                    <div
                        onClick={(event) =>
                            event.stopPropagation()
                        }
                        style={{
                            width: "100%",
                            maxWidth: "380px",
                            padding: "32px",
                            background: "#ffffff",
                            border:
                                "1px solid #ececed",
                            borderRadius: "18px",
                            boxShadow:
                                "0 25px 70px rgba(30, 10, 10, 0.20)",
                        }}
                    >

                    <div
                        style={{
                            width: "52px",
                            height: "52px",
                            margin:
                                "0 auto 17px",
                            display: "grid",
                            placeItems:
                                "center",
                            borderRadius: "50%",
                            color: "#b51212",
                            background:
                                "#fff0f0",
                            fontSize: "22px",
                            fontWeight: "700",
                        }}
                    >
                        &#128274;
                    </div>


                    <h2
                        style={{
                            margin:
                                "0 0 10px",
                            color: "#202124",
                            fontSize: "21px",
                            letterSpacing:
                                "-0.4px",
                            textAlign: "center",
                        }}
                    >
                        Change Password
                    </h2>


                    <p
                        style={{
                            margin:
                                "0 auto 22px",
                            maxWidth: "310px",
                            color: "#70757d",
                            fontSize: "12px",
                            ineHeight:
                                "1.65",
                            textAlign: "center",
                        }}
                    >
                        Enter your registered
                        email and employee code.
                        A new password will be
                        generated and sent to
                        your email.
                    </p>


                    <div
                        className="form-group"
                        style={{
                            marginBottom: "15px",
                        }}
                    >

                        <label>
                            NIBL Email
                        </label>


                        <input
                            type="email"
                            placeholder="name@nibl.in"
                            id="forgot-password-email"
                    />

                </div>


                <div
                    className="form-group"
                    style={{
                        marginBottom: "20px",
                    }}
                >

                    <label>
                        Employee Code
                    </label>


                    <input
                        type="text"
                        placeholder="Enter employee code"
                        id="forgot-password-employee-code"
                    />

                </div>


            <button
                type="button"
                className="primary-button"
                style={{
                    width: "100%",
                    opacity: forgotPasswordLoading ? 0.7 : 1,
                    cursor: forgotPasswordLoading ? "not-allowed" : "pointer",
                }}
                disabled={forgotPasswordLoading}
                onClick={async () => {

                    if (forgotPasswordLoading) {
                        return;
                    }

                    const email =
                        document.getElementById(
                            "forgot-password-email"
                        )?.value
                            ?.trim()
                            .toLowerCase();


                    const employeeCode =
                        document.getElementById(
                            "forgot-password-employee-code"
                        )?.value
                            ?.trim();


                    if (!email) {

                        alert(
                            "Please enter your email address."
                        );

                        return;

                    }


                    if (!employeeCode) {

                        alert(
                            "Please enter your employee code."
                        );

                        return;

                    }


                    setForgotPasswordLoading(true);

                    try {

                        await forgotPassword(
                            email,
                            employeeCode
                        );


                        alert(
                            "Password changed successfully. A new password has been sent to your registered email."
                        );


                        setShowPasswordHelp(
                            false
                        );


                    } catch (error) {

                        alert(
                            error.message ||
                            "Unable to change password. Please check your email and employee code."
                        );

                    } finally {

                        setForgotPasswordLoading(false);

                    }

                }}
            >
                {forgotPasswordLoading
                    ? "Changing Password..."
                    : "Submit Request"}
            </button>


            <button
                type="button"
                onClick={() =>
                    setShowPasswordHelp(false)
                }
                style={{
                    width: "100%",
                    marginTop: "10px",
                    border: "none",
                    background:
                        "transparent",
                    color: "#70757d",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    padding: "8px",
                }}
            >
                Cancel
            </button>

        </div>

    </div>

)}

        </div>
    );
}


