
/* ============================================================
   PREMIUM BEARING
============================================================ */

function Bearing({
    className = "",
    type = "ball",
}) {

    const balls = Array.from({
        length: 8,
    });

    const rollers = Array.from({
        length: 8,
    });

    return (
        <div
            className={`premium-bearing premium-bearing-${type} ${className}`}
            aria-hidden="true"
        >

            <div className="premium-bearing-outer">

                <div className="premium-bearing-ring ring-outer" />

                <div className="premium-bearing-ring ring-middle" />

                {type === "ball" && (

                    <div className="premium-bearing-balls">

                        {balls.map((_, index) => (
                            <span key={index} />
                        ))}

                    </div>

                )}


                {type === "roller" && (

                    <div className="premium-bearing-rollers">

                        {rollers.map((_, index) => (
                            <span key={index} />
                        ))}

                    </div>

                )}


                {type === "needle" && (

                    <div className="premium-bearing-needles">

                        {rollers.map((_, index) => (
                            <span key={index} />
                        ))}

                    </div>

                )}


                <div className="premium-bearing-center">

                    <div />

                </div>

            </div>

        </div>
    );
}


/* ============================================================
   PROCESS LINE
============================================================ */

function ProcessLine() {

    return (
        <div
            className="premium-process-line"
            aria-hidden="true"
        >

            <div className="premium-process-track" />

            <span className="process-dot dot-one" />
            <span className="process-dot dot-two" />
            <span className="process-dot dot-three" />

        </div>
    );
}


/* ============================================================
   AUTH BACKGROUND
============================================================ */

function AuthBackground({
    variant,
}) {

    return (
        <div
            className={`premium-scene premium-auth-scene premium-auth-${variant}`}
            aria-hidden="true"
        >

            <Bearing
                type={
                    variant === "login"
                        ? "ball"
                        : "needle"
                }
                className="auth-bearing-left"
            />


            <Bearing
                type={
                    variant === "login"
                        ? "roller"
                        : "ball"
                }
                className="auth-bearing-right"
            />


            <ProcessLine />

        </div>
    );
}


/* ============================================================
   LANDING BACKGROUND
============================================================ */

function LandingBackground() {

    return (
        <div
            className="premium-scene premium-landing-scene"
            aria-hidden="true"
        >

            <Bearing
                type="ball"
                className="landing-bearing-one"
            />


            <Bearing
                type="roller"
                className="landing-bearing-two"
            />


            <Bearing
                type="needle"
                className="landing-bearing-three"
            />


            <ProcessLine />

        </div>
    );
}


/* ============================================================
   MAIN COMPONENT
============================================================ */

export default function BearingBackground({
    variant = "landing",
}) {

    if (
        variant === "login" ||
        variant === "signup"
    ) {

        return (
            <div
                className="bearing-background premium-background"
                aria-hidden="true"
            >

                <AuthBackground
                    variant={variant}
                />

            </div>
        );
    }


    return (
        <div
            className="bearing-background premium-background"
            aria-hidden="true"
        >

            <LandingBackground />

        </div>
    );
}