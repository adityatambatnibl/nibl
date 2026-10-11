import { ArrowLeft, LogOut, Mail, ShieldCheck, UserCircle2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import logo from "../../../assest/logo.jpg";
import "./Profile.css";
import ImprovementBackground from "../../components/ImprovementBackground";

function formatRole(role) {
    if (!role) return "-";

    return String(role)
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getInitial(user) {
    return (
        user?.full_name?.charAt(0) ||
        user?.name?.charAt(0) ||
        "U"
    ).toUpperCase();
}

function ProfileField({ label, value, icon: Icon }) {
    return (
        <div className="profile-field">
            <div className="profile-field-icon">
                <Icon size={17} />
            </div>
            <div className="profile-field-content">
                <span>{label}</span>
                <strong>{value || "-"}</strong>
            </div>
        </div>
    );
}

export default function Profile({ onBack }) {
    const { user, logout } = useAuth();

    const role = formatRole(user?.role);

    return (
        <div className="profile-page">

            <ImprovementBackground />
            <header className="profile-header">
                <div className="profile-brand">
                    <img src={logo} alt="NRB Industrial Bearings" />
                </div>

                <button
                    type="button"
                    className="profile-back-button"
                    onClick={onBack}
                >
                    <ArrowLeft size={17} />
                    Back to Dashboard
                </button>
            </header>

            <main className="profile-content">
                <section className="profile-hero-card">
                    <div className="profile-avatar-large">
                        {getInitial(user)}
                    </div>

                    <div className="profile-hero-copy">
                        <span className="profile-eyebrow">MY PROFILE</span>
                        <h1>{user?.full_name || user?.name || "User"}</h1>
                        <p>{role}</p>
                    </div>
                </section>

                <section className="profile-card">
                    <div className="profile-card-heading">
                        <div>
                            <span>ACCOUNT INFORMATION</span>
                            <h2>Personal Details</h2>
                        </div>
                        <UserCircle2 size={22} />
                    </div>

                    <div className="profile-fields-grid">
                        <ProfileField
                            label="Full Name"
                            value={user?.full_name || user?.name}
                            icon={UserCircle2}
                        />
                        <ProfileField
                            label="Employee Code"
                            value={user?.employee_code}
                            icon={ShieldCheck}
                        />
                        <ProfileField
                            label="Email Address"
                            value={user?.email}
                            icon={Mail}
                        />
                        <ProfileField
                            label="Role"
                            value={role}
                            icon={ShieldCheck}
                        />
                      
                    </div>
                </section>

                <section className="profile-account-card">
                    <div>
                        <span>ACCOUNT ACCESS</span>
                        <h2>Session</h2>
                        <p>Your account is currently signed in to OIPM.</p>
                    </div>

                    <button
                        type="button"
                        className="profile-logout-button"
                        onClick={logout}
                    >
                        <LogOut size={17} />
                        Logout
                    </button>
                </section>
            </main>
        </div>
    );
}
