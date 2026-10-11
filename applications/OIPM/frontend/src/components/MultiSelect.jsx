import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import "./MultiSelect.css";

export default function MultiSelect({
    label,
    value = [],
    onChange,
    options = [],
    required = false,
    placeholder = "Select options",
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const selected = Array.isArray(value) ? value : value ? [value] : [];

    useEffect(() => {
        function handleOutside(event) {
            if (!ref.current?.contains(event.target)) setOpen(false);
        }
        document.addEventListener("mousedown", handleOutside);
        return () => document.removeEventListener("mousedown", handleOutside);
    }, []);

    const toggle = (optionValue) => {
        const next = selected.includes(optionValue)
            ? selected.filter((item) => item !== optionValue)
            : [...selected, optionValue];
        onChange(next);
    };

    const labels = selected
        .map((item) => options.find((option) => option.value === item)?.label || item)
        .filter(Boolean);

    return (
        <div className="multi-select-field" ref={ref}>
            <label>
                {label}
                {required && <span className="required">*</span>}
            </label>
            <button
                type="button"
                className="multi-select-trigger"
                onClick={() => setOpen((current) => !current)}
                aria-expanded={open}
            >
                <span className={labels.length ? "multi-select-values" : "multi-select-placeholder"}>
                    {labels.length ? labels.join(", ") : placeholder}
                </span>
                <ChevronDown size={16} className={open ? "multi-select-chevron open" : "multi-select-chevron"} />
            </button>
            {open && (
                <div className="multi-select-menu">
                    {options.map((option) => {
                        const checked = selected.includes(option.value);
                        return (
                            <button
                                type="button"
                                className={`multi-select-option ${checked ? "selected" : ""}`}
                                key={option.value}
                                onClick={() => toggle(option.value)}
                            >
                                <span className={`multi-select-checkbox ${checked ? "checked" : ""}`}>
                                    {checked && <Check size={13} />}
                                </span>
                                <span>{option.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
