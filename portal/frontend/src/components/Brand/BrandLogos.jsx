import { useState } from "react";

import nrbLocalLogo from "../../assets/logo.jpg";

import "./BrandLogos.css";

/* =====================================================
   GROUP BRAND LOGOS
   NRB Industrial · NIBC · NIBL Korta

   Loaded from the company websites. If a site cannot be
   reached, NRB falls back to the local logo and the other
   two are simply hidden - the header never shows a broken
   image.
===================================================== */

const LOGOS = [
    {
        key: "nrb",
        src: "https://nrbindustrialbearings.com/img/logo.jpg",
        fallback: nrbLocalLogo,
        alt: "NRB Industrial Bearings Limited",
    },
    {
        key: "nibc",
        src: "https://nibc.in/Img/logo.png",
        alt: "NIBC",
    },
    {
        key: "korta",
        src: "https://niblkortaballscrews.in/Img/nibl-korta-logo.jpg",
        alt: "NIBL Korta",
    },
];

function Logo({ logo }) {
    const [src, setSrc] = useState(logo.src);
    const [hidden, setHidden] = useState(false);

    if (hidden) return null;

    return (
        <img
            src={src}
            alt={logo.alt}
            className={`brand-logo brand-logo-${logo.key}`}
            onError={() => {
                if (logo.fallback && src !== logo.fallback) {
                    setSrc(logo.fallback);
                } else {
                    setHidden(true);
                }
            }}
        />
    );
}

export default function BrandLogos({ size = "md" }) {
    return (
        <div className={`brand-logos brand-logos-${size}`}>
            {LOGOS.map((logo) => (
                <Logo key={logo.key} logo={logo} />
            ))}
        </div>
    );
}
