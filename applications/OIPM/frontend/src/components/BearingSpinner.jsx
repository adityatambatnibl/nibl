import { useMemo } from "react";

function BearingSpinner({ size = 54, className = "" }) {
    const rollers = useMemo(
        () =>
            Array.from(
                { length: 12 },
                (_, index) => (index * 360) / 12
            ),
        []
    );

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            role="img"
            aria-label="Loading"
            className={className}
        >
            <g
                style={{
                    transformOrigin: "50px 50px",
                    animation: "oipm-bearing-spin 3s linear infinite",
                }}
            >
                <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    opacity="0.9"
                />
                <circle
                    cx="50"
                    cy="50"
                    r="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    opacity="0.9"
                />

                {rollers.map((deg) => (
                    <circle
                        key={deg}
                        cx={
                            50 +
                            33 *
                                Math.cos(
                                    (deg * Math.PI) / 180
                                )
                        }
                        cy={
                            50 +
                            33 *
                                Math.sin(
                                    (deg * Math.PI) / 180
                                )
                        }
                        r="6.5"
                        fill="currentColor"
                        opacity="0.75"
                    />
                ))}
            </g>

            <circle
                cx="50"
                cy="50"
                r="9"
                fill="currentColor"
                opacity="0.25"
            />
        </svg>
    );
}

export default BearingSpinner;
