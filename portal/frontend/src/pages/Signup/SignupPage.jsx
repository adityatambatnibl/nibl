// Sign-up page - same screen as the old OIPM sign-up (moved here unchanged).
// One registration creates the account in every NIBL application (pending
// until each application's admin approves).
import BrandLogos from "../../components/Brand/BrandLogos";
import BearingBackground from "../../components/Brand/BearingBackground";

/* =====================================================
   PUBLIC REGISTRATION ROLES

   Plant Head and Admin are system-created accounts.
===================================================== */

const ROLES = [

    {
        value: "employee",

        label: "Employee",

        description:
            "Create and manage your improvement initiatives.",
    },

    {
        value: "hod",

        label: "HOD",

        description:
            "Review and manage improvements submitted by your employees.",
    },

    {
        value: "accounts",

        label: "Accounts",

        description:
            "Verify improvement financial information.",
    },

    {
        value: "plant_head",

        label: "Plant Head",

        description:
            "Approve and manage plant-wide improvement initiatives.",
    },

];


/* =====================================================
   SIGNUP PAGE
===================================================== */

export default function SignupPage({
    form,
    hods,
    hodsLoading,
    error,
    success,
    loading,
    onChange,
    onSubmit,
    onLogin,
    onBack,
}) {

    return (

        <div className="auth-page signup-page signup-compact">

             <BearingBackground variant="signup" />


            <div className="auth-brand">

                <button
                    className="back-button"
                    onClick={onBack}
                    type="button"
                >
                    &#8592;
                </button>


                <div className="auth-brand-content">
                    <BrandLogos />
                </div>

            </div>


            <div className="signup-container">

                <div className="signup-box">

                <aside className="signup-aside">

                    <span className="signup-aside-eyebrow">
                        NEW ACCOUNT
                    </span>

                    <h1>
                        Create your <span>account.</span>
                    </h1>

                    <p>
                        Register once with your official NIBL
                        email to access approved internal projects.
                    </p>

                    <ul className="signup-steps">
                        <li><b>1</b> Fill in your details</li>
                        <li><b>2</b> Choose your role</li>
                        <li><b>3</b> Sign in and open your projects</li>
                    </ul>

                </aside>


                <div className="signup-card">

                    <div className="signup-card-heading">
                        <h2>Register</h2>
                    </div>


                    {error && (

                        <div className="error-message">
                            {error}
                        </div>

                    )}


                    {success && (

                        <div className="success-message">
                            {success}
                        </div>

                    )}


                    <form
                        onSubmit={onSubmit}
                    >

                        <div className="form-grid">

                            <div className="form-group">
                                <label>Full Name</label>
                                <input
                                    type="text"
                                    name="fullName"
                                    value={form.fullName}
                                    onChange={onChange}
                                    placeholder="Enter your full name"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Employee Code</label>
                                <input
                                    type="text"
                                    name="employeeCode"
                                    value={form.employeeCode}
                                    onChange={onChange}
                                    placeholder="Employee code"
                                    required
                                />
                            </div>

                        </div>


                        <div className="form-group">

                            <label>Select Role</label>

                            <div className="role-grid">
                                {ROLES.map((role) => (
                                    <button
                                        key={role.value}
                                        type="button"
                                        title={role.description}
                                        className={`role-option ${form.role === role.value ? "selected" : ""}`}
                                        onClick={() => {
                                            onChange({
                                                target: {
                                                    name: "role",
                                                    value: role.value,
                                                },
                                            });
                                        }}
                                    >
                                        <span
                                            className={`role-radio ${form.role === role.value ? "selected" : ""}`}
                                            aria-hidden="true"
                                        />
                                        <span className="role-content">
                                            <strong>{role.label}</strong>
                                        </span>
                                    </button>
                                ))}
                            </div>

                            <span className="field-help">
                                {ROLES.find((role) => role.value === form.role)?.description}
                            </span>

                        </div>


                        <div className="form-grid">

                            <div
                                className="form-group"
                                style={form.role === "employee" ? undefined : { gridColumn: "1 / -1" }}
                            >
                                <label>NIBL Email</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={form.email}
                                    onChange={onChange}
                                    placeholder="name@nibl.in"
                                    title="Only official NIBL email addresses are accepted."
                                    required
                                />
                            </div>

                            {form.role === "employee" && (

                                <div className="form-group">

                                    <label>Select Your HOD</label>

                                    <select
                                        name="hodId"
                                        value={form.hodId}
                                        onChange={onChange}
                                        required
                                        title="If you don't have an HOD, the Plant Head will be assigned as your HOD."
                                    >
                                        <option value="">
                                            Select your HOD
                                        </option>

                                        {hodsLoading ? (
                                            <option value="" disabled>
                                                Loading HODs...
                                            </option>
                                        ) : (
                                            hods.map((hod) => (
                                                <option key={hod.id} value={hod.id}>
                                                    {hod.full_name}
                                                </option>
                                            ))
                                        )}

                                        <option value="no_hod">
                                            I do not have an HOD
                                        </option>

                                        <option value="not_available">
                                            My HOD is not listed
                                        </option>
                                    </select>

                                </div>

                            )}

                        </div>


                        <div className="form-grid">

                            <div className="form-group">
                                <label>Password</label>
                                <input
                                    type="password"
                                    name="password"
                                    value={form.password}
                                    onChange={onChange}
                                    placeholder="Min. 8 characters"
                                    required
                                    minLength={8}
                                />
                            </div>

                            <div className="form-group">
                                <label>Confirm Password</label>
                                <input
                                    type="password"
                                    name="confirmPassword"
                                    value={form.confirmPassword}
                                    onChange={onChange}
                                    placeholder="Repeat your password"
                                    required
                                    minLength={8}
                                />
                            </div>

                        </div>


                        <p className="field-help signup-note">
                            Only official NIBL email addresses are accepted.
                            {form.role === "employee" &&
                                " No HOD? The Plant Head will be assigned as your HOD."}
                        </p>


                        <button
                            className="primary-button full"
                            type="submit"
                            disabled={loading}
                        >
                            {loading
                                ? "Creating account..."
                                : "Create Account"}
                        </button>

                    </form>


                    <div className="auth-switch">

                        <span>
                            Already registered?
                        </span>


                        <button
                            type="button"
                            onClick={onLogin}
                        >
                            Sign In
                        </button>

                    </div>

                </div>

                </div>

            </div>

        </div>
    );
}


