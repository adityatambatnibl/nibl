// /signup - one registration creates the account in every NIBL application.
// Same form, checks and HOD pop-up as the old OIPM sign-up.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getHods, registerUser } from "../../services/authService";
import SignupPage from "./SignupPage";

const EMPTY = { fullName: "", employeeCode: "", email: "", password: "", confirmPassword: "", role: "employee", hodId: "" };

export default function Signup() {
    const navigate = useNavigate();
    const [signupForm, setSignupForm] = useState(EMPTY);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [hods, setHods] = useState([]);
    const [hodsLoading, setHodsLoading] = useState(true);
    const [showHodModal, setShowHodModal] = useState(false);

    useEffect(() => {
        getHods()
            .then((data) => setHods(Array.isArray(data) ? data : data?.items || []))
            .finally(() => setHodsLoading(false));
    }, []);

    function onChange(event) {
        const { name, value } = event.target;
        setSignupForm((p) => ({ ...p, [name]: value, ...(name === "role" && value !== "employee" ? { hodId: "" } : {}) }));
        setError("");
        setSuccess("");
        if (name === "hodId" && value === "not_available") setShowHodModal(true);
    }

    async function onSubmit(event) {
        event.preventDefault();
        setError("");
        setSuccess("");
        if (signupForm.password !== signupForm.confirmPassword) return setError("Passwords do not match.");
        if (!["@nibl.in", "@nibc.in", "@niblkorta.in"].some((d) => signupForm.email.trim().toLowerCase().endsWith(d))) {
            return setError("Please use your official NIBL email address.");
        }
        if (signupForm.role === "employee" && !signupForm.hodId) {
            return setError("Please select your HOD or choose 'I do not have an HOD'.");
        }
        if (signupForm.hodId === "not_available") return setShowHodModal(true);
        const hodId = signupForm.role === "employee" && signupForm.hodId && signupForm.hodId !== "no_hod" ? signupForm.hodId : null;
        setLoading(true);
        try {
            await registerUser({
                full_name: signupForm.fullName.trim(),
                employee_code: signupForm.employeeCode.trim(),
                email: signupForm.email.trim().toLowerCase(),
                password: signupForm.password,
                role: signupForm.role,
                hod_id: hodId,
            });
            setSuccess("Your NIBL account has been created. You can sign in now; each application opens once its administrator approves you.");
            setSignupForm(EMPTY);
            setTimeout(() => navigate("/login"), 2200);
        } catch (err) {
            setError(err.message || "Unable to create your account.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <SignupPage
                form={signupForm}
                hods={hods}
                hodsLoading={hodsLoading}
                error={error}
                success={success}
                loading={loading}
                onChange={onChange}
                onSubmit={onSubmit}
                onLogin={() => navigate("/login")}
                onBack={() => navigate("/login")}
            />

            {showHodModal && (

                <div
                    className="modal-overlay"
                    onClick={() =>
                        setShowHodModal(
                            false
                        )
                    }
                >

                    <div
                        className="hod-modal"
                        onClick={(event) =>
                            event.stopPropagation()
                        }
                    >

                        <div className="modal-icon">
                            !
                        </div>


                        <h2>
                            HOD Not Available
                        </h2>


                        <p>
                            Your HOD is not
                            currently registered
                            in the NIBL INTERNAL WORKING SPACE
                            system.
                        </p>


                        <p>
                            Please ask your HOD
                            to register before
                            continuing with
                            employee
                            registration.
                        </p>


                        <button
                            className="primary-button"
                            onClick={() => {

                                setShowHodModal(
                                    false
                                );


                                setSignupForm(
                                    (previous) => ({

                                        ...previous,

                                        hodId: "",

                                    })
                                );

                            }}
                            type="button"
                        >
                            Okay
                        </button>

                    </div>

                </div>

            )}

        </>
    );
}
