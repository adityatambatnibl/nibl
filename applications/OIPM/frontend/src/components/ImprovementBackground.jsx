
/*
 * ============================================================
 * OIPM IMPROVEMENT BACKGROUND
 *
 * Two real bearing visuals.
 *
 * This is intentionally separate from the form so the
 * background animation never affects the form content.
 * ============================================================
 */


function ImprovementBearing({
    className = "",
}) {

    return (
        <div
            className={`improvement-bearing ${className}`}
            aria-hidden="true"
        >

            {/* Outer technical rings */}
            <div className="improvement-bearing-ring ring-one" />
            <div className="improvement-bearing-ring ring-two" />
            <div className="improvement-bearing-ring ring-three" />


            {/* Actual bearing body */}
            <div className="improvement-bearing-body">

                {/* Outer race */}
                <div className="improvement-bearing-outer-race" />

                {/* Inner race */}
                <div className="improvement-bearing-inner-race" />


                {/* Bearing balls */}
                <span className="improvement-bearing-ball ball-1" />
                <span className="improvement-bearing-ball ball-2" />
                <span className="improvement-bearing-ball ball-3" />
                <span className="improvement-bearing-ball ball-4" />
                <span className="improvement-bearing-ball ball-5" />
                <span className="improvement-bearing-ball ball-6" />
                <span className="improvement-bearing-ball ball-7" />
                <span className="improvement-bearing-ball ball-8" />


                {/* Inner hub */}
                <div className="improvement-bearing-hub">

                    <div className="improvement-bearing-hole" />

                </div>

            </div>

        </div>
    );
}


/*
 * ============================================================
 * BACKGROUND
 * ============================================================
 */

export default function ImprovementBackground() {

    return (
        <div
            className="improvement-background"
            aria-hidden="true"
        >

            <ImprovementBearing
                className="improvement-bearing-left"
            />

            <ImprovementBearing
                className="improvement-bearing-right"
            />


            {/* Technical process line */}
            <div className="improvement-process-line">

                <span className="improvement-process-dot dot-one" />

                <span className="improvement-process-dot dot-two" />

                <span className="improvement-process-dot dot-three" />

                <span className="improvement-process-dot dot-four" />

            </div>

        </div>
    );
}