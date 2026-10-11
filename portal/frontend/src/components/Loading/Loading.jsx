import BearingSpinner from "./BearingSpinner";

export default function Loading({ label = "Loading NIBL Application Portal..." }) {
    return (
        <div className="app-loading">
            <BearingSpinner size={72} />
            <p>{label}</p>
        </div>
    );
}
